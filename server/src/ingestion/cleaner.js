/**
 * cleaner.js
 *
 * Text normalisation applied to every piece of extracted content before it
 * is classified or chunked. Kept deliberately dumb and deterministic —
 * no NLP here, just whitespace/punctuation/URL hygiene so that two chunks
 * that are "the same sentence" don't fail a hash comparison over a curly
 * quote or a stray tab.
 */

const TRACKING_PARAM_NAMES = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
]);

/** Strip analytics tracking params from any URL found in the text.
 *  Data quality register #7 — Housing_and_Rental_(2).csv contains a URL
 *  with ?utm_source=chatgpt.com, an AI-generation fingerprint that should
 *  never reach a citizen-facing citation. */
export function stripTrackingParams(text) {
  return text.replace(/https?:\/\/[^\s")]+/g, (url) => {
    try {
      const u = new URL(url);
      for (const key of [...u.searchParams.keys()]) {
        if (TRACKING_PARAM_NAMES.has(key.toLowerCase())) {
          u.searchParams.delete(key);
        }
      }
      const cleaned = u.toString();
      // new URL() adds a trailing "?" when all params were stripped — trim it.
      return cleaned.endsWith('?') ? cleaned.slice(0, -1) : cleaned;
    } catch {
      return url; // not a real URL (e.g. trailing punctuation swallowed) — leave as-is
    }
  });
}

export function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00A0/g, ' ') // non-breaking space
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

export function normalizeQuotes(text) {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–|—/g, '-');
}

export function clean(text) {
  if (!text) return '';
  return normalizeWhitespace(stripTrackingParams(normalizeQuotes(text)));
}
