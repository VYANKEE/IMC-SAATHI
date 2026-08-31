/**
 * validate.js
 *
 * The ingestion-time validation gate from data-quality-register.md, applied
 * to every chunk before it's written to server/data/processed/. This is the
 * last checkpoint before a piece of text becomes eligible for embedding
 * (Phase 4) — nothing here talks to Mongo or Gemini, it's pure functions
 * over the chunk objects the chunkers produced.
 *
 * Every rule either:
 *   - does nothing (chunk is fine), or
 *   - attaches a non-blocking flag (chunk still ships, e.g. "this source
 *     was last verified >12 months ago"), or
 *   - attaches a blocking flag, which sets status: 'quarantined' — the
 *     chunk is still written to processed/ (nothing is silently deleted —
 *     you need to be able to see what was excluded and why) but Phase 4
 *     will skip embedding anything that isn't status: 'active'.
 */

const INDORE_STD_CODE = '0731';

// register #4 / #5 — numbers that appear in the source data but are either
// unverified or belong to a different service entirely. Never surfaced as
// IMC contact facts by this pipeline; kept here only so the ingestion
// report can show *why* they were excluded, which is the whole point of a
// data quality register — decisions stay visible, not silently applied.
const KNOWN_BAD_HELPLINES = new Set([
  '1800-233-5522', // register #4 — unverified toll-free, appears in no other source
  '0731-2535555', // register #3 — this is the Dead Animal helpline, not the IMC main line
]);

const ALLOWED_URL_HOSTS = new Set([
  'imcindore.mp.gov.in',
  'www.imcindore.mp.gov.in',
  'nfsa.gov.in',
]);

const RUPEE_PATTERN = /(?:₹|\bRs\.?\s?|\brupees?\b)\s?\d[\d,]*/i;

function flag(code, message, blocking) {
  return { code, message, blocking };
}

function checkContactCard(chunk) {
  if (!chunk.looksLikeContactCard) return null;
  return flag(
    'contact_card_content',
    'Chunk reads as a contact card (Name/Designation/Mobile No.), not procedural content — contacts belong in the Phase 2 contacts collection, not the vector index.',
    true
  );
}

function checkRedaction(chunk) {
  if (!chunk.redactionCount) return null;
  return flag(
    'contact_redacted',
    `${chunk.redactionCount} phone-like number(s) were redacted from this chunk's embedded text before indexing (see redact.js).`,
    false
  );
}

function checkStaleRate(chunk) {
  if (!RUPEE_PATTERN.test(chunk.text)) return null;
  const isRevenue = chunk.department === 'REVENUE';
  if (!isRevenue) return null;
  // v1 has no rateNotices collection with effectiveFrom/effectiveTo yet
  // (register #9) — until it exists, any Revenue chunk quoting a rupee
  // figure is quarantined rather than risking a stale rate reaching a citizen.
  return flag(
    'stale_rate_risk',
    'Revenue-department chunk quotes a rupee amount with no effectiveFrom/effectiveTo tracking (data-quality-register.md #9) — quarantined until rateNotices exists.',
    true
  );
}

function checkNeedsReview(chunk) {
  if (!chunk.needsReview) return null;
  return flag('needs_review', chunk.needsReviewReason ?? 'Flagged for human review.', true);
}

function checkLanguageMismatch(chunk) {
  if (!chunk.languageMismatch?.mismatch) return null;
  return flag(
    'language_column_mismatch',
    `Declared language "${chunk.languageMismatch.declared}" does not match detected "${chunk.languageMismatch.detected}"${chunk.languageMismatch.declaredLooksCorrupted ? ' (declared value is not even a language — register #1)' : ''}.`,
    false
  );
}

function checkSourceFactsPhone(chunk) {
  const phone = chunk.sourceFacts?.officePhone;
  if (!phone) return null;
  if (KNOWN_BAD_HELPLINES.has(phone.trim())) {
    return flag(
      'known_bad_helpline',
      `Row's office_phone (${phone}) matches a number data-quality-register.md flags as wrong/unverified — excluded from any future contact sync, informational only (not embedded).`,
      false
    );
  }
  const digitsOnly = phone.replace(/[^0-9]/g, '');
  if (phone.startsWith('0731') && digitsOnly.length !== 11 && digitsOnly.length !== 10) {
    return flag(
      'malformed_std_number',
      `office_phone "${phone}" has an unexpected digit count for an Indore (${INDORE_STD_CODE}) landline.`,
      false
    );
  }
  return null;
}

function checkSourceUrl(chunk) {
  const urls = [chunk.sourceFacts?.sourceUrl, chunk.sourceFacts?.sourceUrl2].filter(Boolean);
  for (const raw of urls) {
    try {
      const host = new URL(raw).host.toLowerCase();
      if (![...ALLOWED_URL_HOSTS].some((allowed) => host === allowed)) {
        return flag(
          'source_url_not_allowlisted',
          `source_url host "${host}" is not on the allowed IMC/MP-government list.`,
          false
        );
      }
    } catch {
      return flag('source_url_invalid', `source_url "${raw}" is not a parseable URL.`, false);
    }
  }
  return null;
}

function checkStale(chunk) {
  const lastVerified = chunk.sourceFacts?.lastVerified;
  if (!lastVerified) return null;
  const date = new Date(lastVerified);
  if (Number.isNaN(date.getTime())) return null;
  const twelveMonthsMs = 365 * 24 * 60 * 60 * 1000;
  if (Date.now() - date.getTime() > twelveMonthsMs) {
    return flag(
      'stale_source',
      `last_verified (${lastVerified}) is more than 12 months old.`,
      false
    );
  }
  return null;
}

const RULES = [
  checkContactCard,
  checkRedaction,
  checkStaleRate,
  checkNeedsReview,
  checkLanguageMismatch,
  checkSourceFactsPhone,
  checkSourceUrl,
  checkStale,
];

/**
 * Runs every rule against one chunk and returns it annotated with
 * `flags` and `status`. Does not mutate the input.
 */
export function validateChunk(chunk) {
  const flags = RULES.map((rule) => rule(chunk)).filter(Boolean);
  const blocked = flags.some((f) => f.blocking);
  return { ...chunk, flags, status: blocked ? 'quarantined' : 'active' };
}

/**
 * Chunk-level dedup across the whole run — catches the same Q/A text
 * appearing via two different source files that the file-level classifier
 * didn't already collapse. Must run AFTER validateChunk so hash is computed
 * on final text, and mutates status on the second-and-later occurrence.
 */
export function dedupeChunks(chunks, hashFn) {
  const seen = new Map(); // hash -> first chunk's sourceFile+ref
  return chunks.map((chunk) => {
    const hash = hashFn(chunk.text);
    if (seen.has(hash)) {
      const original = seen.get(hash);
      return {
        ...chunk,
        status: 'quarantined',
        flags: [
          ...chunk.flags,
          flag(
            'duplicate_chunk_text',
            `Identical embedded text to ${original} — kept the first occurrence only.`,
            true
          ),
        ],
      };
    }
    seen.set(hash, `${chunk.sourceFile}#${chunk.sourceRowRef}`);
    return chunk;
  });
}
