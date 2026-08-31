/**
 * retrieve.js
 *
 * The real Phase 5 retrieval module — docs/03-rag.md's $vectorSearch shape,
 * wired to a real embedder and the knowledgeChunk repository (never the
 * KnowledgeChunk model directly — see src/repositories/knowledgeChunk.repository.js's
 * own header comment on why DB access is repository-only).
 *
 * What this deliberately does NOT do yet: classify a query's department.
 * `classify.department.md` (the LLM prompt that produces departmentId +
 * confidence) is a Phase 6 deliverable, not Phase 5's. Until that exists,
 * every call here is effectively confidence=0 -> unfiltered search, which
 * is the documented safe default ("filtering on a wrong guess is worse than
 * not filtering", docs/03-rag.md). Once Phase 6 lands, its classifier's
 * output plugs straight into `departmentId`/`departmentConfidence` below —
 * this module does not need to change shape for that to happen.
 */
import { createNvidiaEmbedder } from '../embeddings/nvidiaEmbedder.js';
import { vectorSearchKnowledgeChunks } from '../../repositories/knowledgeChunk.repository.js';

// The >= 0.6 threshold below which a department guess is not trusted enough
// to filter on is docs/03-rag.md's own number, not something this module
// invented. MIN_SCORE for the *generation* confidence gate is intentionally
// NOT hardcoded here — docs/03-rag.md says calibrate it against the golden
// set, so it is a parameter the caller (the eval script, later the chat
// route) supplies, not a default this file guesses.
const DEPARTMENT_FILTER_CONFIDENCE_THRESHOLD = 0.6;

export function createRetriever({ apiKey, model, dimensions }) {
  const embedder = createNvidiaEmbedder({ apiKey, model, dimensions });

  /**
   * @param {string} query - raw citizen query text (any of en/hi/hinglish).
   * @param {object} [opts]
   * @param {string} [opts.departmentId] - only applied when departmentConfidence clears the threshold.
   * @param {number} [opts.departmentConfidence] - 0..1, from Phase 6's classifier once it exists.
   * @param {number} [opts.limit] - default 8, per docs/03-rag.md.
   * @param {number} [opts.numCandidates] - default 150 (~20x limit), per docs/03-rag.md.
   */
  async function retrieve(
    query,
    { departmentId, departmentConfidence = 0, limit = 8, numCandidates = 150 } = {}
  ) {
    // 'query' mode — the asymmetric counterpart to how the corpus itself
    // was embedded with 'passage' (docs/11-decisions.md D15).
    const [queryVector] = await embedder.embedTexts([query], { inputType: 'query' });

    const departmentFilterApplied =
      Boolean(departmentId) && departmentConfidence >= DEPARTMENT_FILTER_CONFIDENCE_THRESHOLD;
    const results = await vectorSearchKnowledgeChunks({
      queryVector,
      departmentId: departmentFilterApplied ? departmentId : undefined,
      limit,
      numCandidates,
    });

    return { results, departmentFilterApplied };
  }

  return { retrieve };
}

/**
 * The confidence gate itself (docs/03-rag.md: "if the top score is below
 * MIN_SCORE, do not generate"). Kept as a standalone function, not folded
 * into `retrieve`, so the eval script can sweep MIN_SCORE against a single
 * fixed set of retrieval results instead of re-querying NVIDIA/Atlas once
 * per threshold it wants to try.
 */
export function passesConfidenceGate(results, minScore) {
  return results.length > 0 && results[0].score >= minScore;
}
