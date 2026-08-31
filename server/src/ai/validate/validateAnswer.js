/**
 * validateAnswer.js
 *
 * The post-generation safety net (docs/03-rag.md "Post-generation
 * validation"). This is what turns "never invent a phone number / URL"
 * from a prompt instruction (models violate these) into a structural
 * guarantee: every phone-like token, URL, and cited chunkId in the model's
 * JSON output is checked against facts that were actually injected into the
 * prompt (verifiedFacts) or chunks that were actually retrieved this turn.
 * Anything that doesn't trace back is stripped, not trusted.
 *
 * Implements docs/03-rag.md's 6 steps in order. Step numbers in comments
 * below match that doc exactly, so a diff against it is easy to audit.
 */

// Loose enough to catch "0731-1234567", "9876543210", "1912" (helpline short
// codes) inside prose without a per-format regex; only ever used to check
// membership in the verified-facts allow-list, never to format anything.
const PHONE_TOKEN_PATTERN = /(?:\+?91[-\s]?)?\b\d[\d\-\s]{5,12}\d\b/g;
const URL_PATTERN = /https?:\/\/[^\s)"'<>]+/g;
const RUPEE_PATTERN = /(?:₹|\bRs\.?\s?)\s?[\d,]+(?:\.\d+)?/gi;

// groundingViolations counter, per prompt version (step 6) -- "your early
// warning that a prompt edit or a model version bump has degraded
// groundedness." In-memory only for now (no metrics store yet); a route or
// admin endpoint can read this later without this module changing shape.
const groundingViolations = new Map();

function bumpViolationCounter(promptVersion) {
  const key = promptVersion || 'unversioned';
  groundingViolations.set(key, (groundingViolations.get(key) || 0) + 1);
}

/** @param {string} [promptVersion] - omit to get the whole per-version map. */
export function getGroundingViolations(promptVersion) {
  if (promptVersion) return groundingViolations.get(promptVersion) || 0;
  return Object.fromEntries(groundingViolations);
}

// Exposed for tests only -- the counter is intentionally module-level state
// (see comment above), and a test suite that runs several validateAnswer
// scenarios needs a way back to zero between them.
export function _resetGroundingViolationsForTests() {
  groundingViolations.clear();
}

function normalizePhone(token) {
  return token.replace(/[\s-]/g, '');
}

// Every string field a phone number, URL, or rupee amount could hide in,
// per GROUNDED_ANSWER_SCHEMA (schemas/index.js) -- listed explicitly rather
// than a generic deep walk, so a new schema field doesn't silently escape
// validation.
const STRING_FIELDS = ['answer', 'officeTiming', 'fees', 'escalation'];
const STRING_ARRAY_FIELDS = ['procedureSteps', 'requiredDocuments', 'requiredInformation'];

function redactField(text, pattern, isAllowed, onViolation) {
  // Fresh RegExp per call (never a shared module-level `g` instance) so a
  // .test()/.replace() pair can never trip on stale `lastIndex` state.
  const re = new RegExp(pattern.source, pattern.flags);
  let violated = false;
  const result = text.replace(re, (match) => {
    if (isAllowed(match)) return match;
    violated = true;
    return '[unverified — removed]';
  });
  if (violated) onViolation();
  return result;
}

/**
 * @param {object} response - parsed GROUNDED_ANSWER_SCHEMA output.
 * @param {object} opts
 * @param {string[]} [opts.phones] - verifiedFacts.phones (facts/lookupFacts.js).
 * @param {string[]} [opts.urls] - verifiedFacts.urls, the official allow-list.
 * @param {string[]} [opts.retrievedChunkIds] - chunkIds actually retrieved this turn.
 * @param {string} opts.fallbackText - the exact fallback string the prompt used.
 * @param {string} [opts.promptVersion]
 * @returns {object} response with unverified content stripped, plus a
 *   `groundingViolations` array of intervention codes for this one call
 *   (separate from the module-level per-version counter).
 */
export function validateAnswer(
  response,
  { phones = [], urls = [], retrievedChunkIds = [], fallbackText, promptVersion } = {}
) {
  const violations = [];
  const result = structuredClone(response ?? {});
  const allowedPhones = new Set(phones.map(normalizePhone));
  const allowedUrls = new Set(urls);

  const phoneAllowed = (token) => allowedPhones.has(normalizePhone(token));
  const urlAllowed = (token) => allowedUrls.has(token);

  const markPhone = () => {
    if (!violations.includes('unverified_phone_number')) violations.push('unverified_phone_number');
  };
  const markUrl = () => {
    if (!violations.includes('unverified_url')) violations.push('unverified_url');
  };

  // Steps 1 + 2 together (both are "token in string field must be in the
  // allow-list, else redact") across every plain string field...
  for (const field of STRING_FIELDS) {
    if (typeof result[field] !== 'string' || !result[field]) continue;
    let text = redactField(result[field], PHONE_TOKEN_PATTERN, phoneAllowed, markPhone);
    text = redactField(text, URL_PATTERN, urlAllowed, markUrl);
    result[field] = text;
  }
  // ...every string-array field...
  for (const field of STRING_ARRAY_FIELDS) {
    if (!Array.isArray(result[field])) continue;
    result[field] = result[field].map((item) => {
      if (typeof item !== 'string') return item;
      let text = redactField(item, PHONE_TOKEN_PATTERN, phoneAllowed, markPhone);
      text = redactField(text, URL_PATTERN, urlAllowed, markUrl);
      return text;
    });
  }
  // ...and contact.phone / contact.office specifically (structured fields,
  // not free prose -- an unverified one is blanked outright rather than
  // partially redacted mid-sentence).
  if (result.contact) {
    if (result.contact.phone && !phoneAllowed(result.contact.phone)) {
      markPhone();
      result.contact.phone = undefined;
    }
    if (result.contact.office) {
      result.contact.office = redactField(result.contact.office, URL_PATTERN, urlAllowed, markUrl);
    }
  }

  // Step 3 -- drop any cited chunkId that was not actually retrieved this
  // turn (models do fabricate these).
  const retrievedSet = new Set(retrievedChunkIds);
  const originalSources = Array.isArray(result.sources) ? result.sources : [];
  result.sources = originalSources.filter((s) => s && retrievedSet.has(s.chunkId));
  if (result.sources.length !== originalSources.length) {
    violations.push('invented_citation');
  }

  // Step 4 -- empty sources forces the fallback answer, unless the model
  // already gave the fallback (nothing to force in that case).
  if (result.sources.length === 0 && result.answer !== fallbackText) {
    violations.push('empty_sources_not_fallback');
    result.answer = fallbackText;
    result.confidence = 'low';
  }

  // Step 5 -- an unverified rupee amount. No RateNotice/effectiveFrom model
  // exists yet (docs/03-rag.md's Finding 2: fee figures are redacted at
  // ingestion time, not modeled as a separate structured fact), so any
  // rupee figure surviving into the answer today is by definition not
  // backed by a verified fact -- strip it and point to the current notice.
  if (typeof result.fees === 'string' && new RegExp(RUPEE_PATTERN.source, 'i').test(result.fees)) {
    violations.push('unverified_fee_amount');
    result.fees = 'Please check the current fee on the official IMC portal.';
  }
  if (
    typeof result.answer === 'string' &&
    new RegExp(RUPEE_PATTERN.source, 'i').test(result.answer)
  ) {
    violations.push('unverified_fee_amount_in_answer');
    result.answer = result.answer.replace(
      new RegExp(RUPEE_PATTERN.source, RUPEE_PATTERN.flags),
      '[amount not verified — check the official IMC portal]'
    );
  }

  // Step 6 -- log every intervention.
  if (violations.length > 0) {
    bumpViolationCounter(promptVersion);
  }

  return { ...result, groundingViolations: violations };
}
