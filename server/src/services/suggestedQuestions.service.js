/**
 * suggestedQuestions.service.js
 *
 * Derives real, corpus-grounded "suggested questions" for a department from
 * the actual ingested knowledge chunks -- the same extraction pattern
 * scripts/generate-golden-set.js already uses and hand-verified against the
 * real corpus, reused here rather than writing a second, possibly-diverging
 * copy. Deliberately NOT hand-written placeholder text: what the chat demo
 * suggests is exactly the kind of question the KB actually has an answer
 * for, so clicking one demonstrates a real grounded answer, not a lucky
 * guess.
 */
import { findPrimaryChunksForDepartment } from '../repositories/knowledgeChunk.repository.js';

/**
 * Pulls the citizen-facing question out of a chunk's `text`
 * ("[Dept | category | intent]\nQ: ...\nA: ..." for most rows, or a bare
 * "1. Some question?" for the KB.pdf numbered-FAQ rows). Returns null when
 * neither pattern matches -- narrative (non-Q&A) chunks are common and
 * simply don't have a "suggested question" to offer.
 */
export function extractQuestion(text) {
  const body = text.replace(/^\[[^\]]*\]\n/, '');
  const qaMatch = body.match(/^Q: (.+?)\nA: /s);
  if (qaMatch) return qaMatch[1].trim();
  const firstLine = body
    .split('\n')[0]
    .trim()
    .replace(/^\d+\.\s*/, '');
  if (firstLine.endsWith('?') && firstLine.length < 200) return firstLine;
  return null;
}

/**
 * De-duplicates (case-insensitive) and caps to `limit`, preserving the
 * order chunks were fetched in. Pure and DB-free so it's cheap to unit test
 * against fixture chunks instead of a live database.
 */
export function pickSuggestedQuestions(chunks, limit = 5) {
  const seen = new Set();
  const questions = [];
  for (const chunk of chunks) {
    const q = extractQuestion(chunk.text);
    if (!q) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(q);
    if (questions.length >= limit) break;
  }
  return questions;
}

export async function getSuggestedQuestions(departmentCode, limit = 5, { category } = {}) {
  const chunks = await findPrimaryChunksForDepartment(departmentCode, { category });
  return pickSuggestedQuestions(chunks, limit);
}
