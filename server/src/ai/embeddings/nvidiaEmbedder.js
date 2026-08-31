/**
 * nvidiaEmbedder.js
 *
 * The one place server/scripts/embed.js talks to an embedding API. See
 * docs/11-decisions.md D15 (and its addenda) for the full story: we tried
 * two NVIDIA NIM model names that both turned out to already be
 * end-of-life, before querying build.nvidia.com's own /v1/models endpoint
 * with our real key to find out what's actually live. Landed on
 * `nvidia/nemotron-3-embed-1b` — 34 languages evaluated, with Hindi *and*
 * Hinglish listed as separate languages (exactly this project's need), and
 * a 32768-token max input.
 *
 * This is a plain fetch() call rather than a LangChain wrapper — there is
 * no JS LangChain package for NVIDIA's endpoints, and this model's API
 * needs an `input_type` parameter (query vs. passage) that a generic
 * OpenAI-compatible client has no slot for. Getting that wrong silently
 * degrades retrieval on a model tuned for asymmetric retrieval — worth a
 * few extra lines of hand-written code to get right.
 *
 * Dimension control is NOT an API parameter for this model (unlike the two
 * deprecated ones we tried first) — it natively returns 2048-dim vectors.
 * NVIDIA's own model card describes Matryoshka truncation as a client-side
 * operation instead: slice the vector to the first N dimensions, then
 * re-normalize (L2) the slice, since a raw un-renormalized slice is not a
 * unit vector any more and cosine similarity would be subtly wrong. That's
 * what `truncateEmbedding` below does, so `EMBEDDING_DIMENSIONS=768` in
 * .env stays honoured even though NVIDIA never sees that number.
 */
const NVIDIA_EMBEDDINGS_URL = 'https://integrate.api.nvidia.com/v1/embeddings';
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_DELAY_MS = 600;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Matryoshka-style truncation: keep the first `dimensions` components and
 * re-normalize to unit length. A no-op (returns the vector unchanged) if
 * `dimensions` is falsy or already >= the vector's own length — we only
 * ever shrink, never pad.
 */
export function truncateEmbedding(vector, dimensions) {
  if (!dimensions || dimensions >= vector.length) return vector;
  const sliced = vector.slice(0, dimensions);
  const norm = Math.sqrt(sliced.reduce((sum, x) => sum + x * x, 0));
  if (norm === 0) return sliced;
  return sliced.map((x) => x / norm);
}

export function createNvidiaEmbedder({ apiKey, model, dimensions }) {
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not set — cannot create an embedder.');
  }

  /**
   * `inputType` must be 'passage' for text you are indexing (our chunks)
   * and 'query' for text a citizen types at retrieval time (Phase 5) — this
   * model was trained asymmetrically, so the two are NOT interchangeable.
   */
  async function embedBatch(texts, inputType) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const res = await fetch(NVIDIA_EMBEDDINGS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: texts,
          model,
          input_type: inputType,
          truncate: 'END',
        }),
      });

      if (res.ok) {
        const body = await res.json();
        // NVIDIA's response.data is not guaranteed to preserve input order —
        // it carries an `index` per item. Sort defensively rather than trust
        // array position, which would otherwise silently mismatch chunk<->vector.
        return body.data
          .sort((a, b) => a.index - b.index)
          .map((item) => truncateEmbedding(item.embedding, dimensions));
      }

      const errorText = await res.text();
      const isRetryable = res.status === 429 || res.status >= 500;
      if (!isRetryable || attempt >= MAX_RETRIES) {
        throw new Error(
          `NVIDIA embeddings request failed (${res.status}): ${errorText.slice(0, 300)}`
        );
      }
      await sleep(2000 * attempt);
    }
  }

  /**
   * Embeds `texts` in small sequential batches — see the removed
   * geminiEmbedder.js's history for why sequential-not-parallel matters on
   * a first-time API key's rate limits.
   */
  async function embedTexts(texts, { inputType = 'passage', onBatchComplete } = {}) {
    const vectors = new Array(texts.length);
    for (let start = 0; start < texts.length; start += DEFAULT_BATCH_SIZE) {
      const batch = texts.slice(start, start + DEFAULT_BATCH_SIZE);
      const batchVectors = await embedBatch(batch, inputType);
      batchVectors.forEach((vector, i) => {
        if (!vector || vector.length === 0) {
          throw new Error(`Embedding for row ${start + i} came back empty.`);
        }
        vectors[start + i] = vector;
      });
      onBatchComplete?.({
        completed: Math.min(start + DEFAULT_BATCH_SIZE, texts.length),
        total: texts.length,
      });
      if (start + DEFAULT_BATCH_SIZE < texts.length) {
        await sleep(DEFAULT_DELAY_MS);
      }
    }
    return vectors;
  }

  return { embedTexts };
}
