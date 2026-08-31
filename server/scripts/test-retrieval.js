#!/usr/bin/env node
/**
 * scripts/test-retrieval.js
 *
 * Phase 4 close-out smoke test (docs/03-rag.md's retrieval shape) — embeds
 * one query, runs $vectorSearch against the real `vector_index`, prints the
 * top hits. Not the real Phase 5 retrieval module (no confidence gate, no
 * coverageTier logic) — just proof the embedding -> index -> search chain
 * actually works end to end.
 *
 * Usage: node scripts/test-retrieval.js "street light nahi jal raha"
 */
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createNvidiaEmbedder } from '../src/ai/embeddings/nvidiaEmbedder.js';
import { KnowledgeChunk } from '../src/models/index.js';

const query = process.argv[2];
if (!query) {
  throw new Error('Usage: node scripts/test-retrieval.js "your query here"');
}

const embedder = createNvidiaEmbedder({
  apiKey: env.NVIDIA_API_KEY,
  model: env.NVIDIA_EMBEDDING_MODEL,
  dimensions: env.EMBEDDING_DIMENSIONS,
});

// 'query' mode, NOT 'passage' — a citizen's live question, the asymmetric
// counterpart to how the corpus itself was embedded (docs/11-decisions.md D15).
const [queryVector] = await embedder.embedTexts([query], { inputType: 'query' });

await connectDatabase();

const results = await KnowledgeChunk.aggregate([
  {
    $vectorSearch: {
      index: 'vector_index',
      path: 'embedding',
      queryVector,
      numCandidates: 150,
      limit: 8,
      filter: { status: 'active' },
    },
  },
  { $addFields: { score: { $meta: 'vectorSearchScore' } } },
  { $project: { text: 1, department: 1, category: 1, isVariant: 1, score: 1 } },
]);

await disconnectDatabase();

console.log(`\nQuery: "${query}"\n`);
if (results.length === 0) {
  console.log('No results — check the index status is "Active" in Atlas, not still building.\n');
} else {
  results.forEach((r, i) => {
    console.log(
      `${i + 1}. [${r.score.toFixed(4)}] ${r.department} / ${r.category}${r.isVariant ? ' (variant)' : ''}`
    );
    console.log(`   ${r.text.slice(0, 140).replace(/\n/g, ' ')}...\n`);
  });
}
