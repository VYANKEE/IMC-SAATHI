#!/usr/bin/env node
/**
 * scripts/test-retrieval.js
 *
 * Phase 4/5 smoke test — runs one query through the real
 * src/ai/retrieval/retrieve.js module against the live `vector_index`.
 * Not the eval harness (scripts/eval.js) — just a quick manual sanity
 * check, e.g. after touching the embedder or the index.
 *
 * Usage: node scripts/test-retrieval.js "street light nahi jal raha"
 */
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createRetriever } from '../src/ai/retrieval/retrieve.js';

const query = process.argv[2];
if (!query) {
  throw new Error('Usage: node scripts/test-retrieval.js "your query here"');
}

const retriever = createRetriever({
  apiKey: env.NVIDIA_API_KEY,
  model: env.NVIDIA_EMBEDDING_MODEL,
  dimensions: env.EMBEDDING_DIMENSIONS,
});

await connectDatabase();
const { results, departmentFilterApplied } = await retriever.retrieve(query);
await disconnectDatabase();

console.log(`\nQuery: "${query}" (department filter applied: ${departmentFilterApplied})\n`);
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
