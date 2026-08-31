/**
 * language.js
 *
 * Data quality register #1: the source dataset's own `language` column is
 * corrupted (it holds action values like "Complaint"/"Inform" instead of a
 * language). The ingestion pipeline must never trust it — language is
 * detected from the question text itself, and a mismatch against whatever
 * the column claimed is logged (not silently overwritten) so the source
 * file itself can eventually be fixed.
 *
 * Heuristic (documented in docs/03-rag.md):
 *   1. Devanagari codepoint ratio  -> 'hi'   if high enough
 *   2. Romanised Hindi token ratio -> 'hinglish' if high enough
 *   3. otherwise                   -> 'en'
 */

const DEVANAGARI_RANGE = /[ऀ-ॿ]/;

// A small, high-precision set of common romanised Hindi/Hinglish function
// words seen throughout the actual source CSVs (kaise, karu, kya, hai...).
// Precision matters more than recall here: this only needs to catch the
// *obvious* Hinglish rows; borderline cases default to 'en', which is the
// safer failure mode (worst case we under-count Hinglish, we never mislabel
// English as Hindi).
const HINGLISH_TOKENS = new Set([
  'kaise',
  'kaisi',
  'kaisa',
  'karu',
  'karna',
  'karni',
  'karta',
  'karti',
  'kya',
  'kyu',
  'kyun',
  'kyunki',
  'hai',
  'hain',
  'ho',
  'hoga',
  'hogi',
  'raha',
  'rahi',
  'rahe',
  'nahi',
  'nahin',
  'mera',
  'meri',
  'mere',
  'mujhe',
  'humara',
  'hamara',
  'aap',
  'apna',
  'apne',
  'wala',
  'wali',
  'chahiye',
  'bhai',
  'bhi',
  'paani',
  'kaha',
  'kahan',
  'kab',
  'kaun',
  'sakte',
  'sakta',
  'gaya',
  'gayi',
  'diya',
  'diya',
  'lagta',
  'milega',
  'milegi',
  'padta',
  'padega',
]);

function devanagariRatio(text) {
  const chars = [...text].filter((c) => !/\s/.test(c));
  if (chars.length === 0) return 0;
  const devanagari = chars.filter((c) => DEVANAGARI_RANGE.test(c));
  return devanagari.length / chars.length;
}

function hinglishTokenRatio(text) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 0;
  const hits = words.filter((w) => HINGLISH_TOKENS.has(w));
  return hits.length / words.length;
}

/** Returns 'hi' | 'hinglish' | 'en'. */
export function detectLanguage(text) {
  if (!text || !text.trim()) return 'en';
  if (devanagariRatio(text) > 0.3) return 'hi';
  if (hinglishTokenRatio(text) >= 0.08) return 'hinglish';
  return 'en';
}

/**
 * Compares the detected language against whatever the source declared.
 * Never throws, never "corrects" the row — just tells the caller whether
 * to log a mismatch, matching the register's explicit instruction.
 */
export function checkLanguageMismatch(declared, detected) {
  const normalizedDeclared = (declared ?? '').trim().toLowerCase();
  const knownLanguageValues = new Set(['en', 'english', 'hi', 'hindi', 'hinglish']);
  if (!knownLanguageValues.has(normalizedDeclared)) {
    // The declared value isn't even a language (e.g. "Complaint", "Inform") —
    // this IS the corruption described in register #1. Always a mismatch.
    return { mismatch: true, declared, detected, declaredLooksCorrupted: true };
  }
  const declaredNormalized = normalizedDeclared.startsWith('en')
    ? 'en'
    : normalizedDeclared.startsWith('hinglish')
      ? 'hinglish'
      : 'hi';
  return {
    mismatch: declaredNormalized !== detected,
    declared,
    detected,
    declaredLooksCorrupted: false,
  };
}
