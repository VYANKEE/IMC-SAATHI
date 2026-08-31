#!/usr/bin/env node
/**
 * scripts/embed.js
 *
 * Phase 4: turns server/data/processed/knowledgeChunks.json's ACTIVE chunks
 * into vectors and upserts them into the `knowledgechunks` MongoDB
 * collection. This is the first script in the project that costs real
 * money/quota, so it is deliberately conservative and loud about what it's
 * about to do.
 *
 *   npm run embed:check   -> build the row list (primary + Hinglish variant
 *                            rows), print counts, call NEITHER NVIDIA nor
 *                            MongoDB. No API key required.
 *   npm run embed         -> the real thing. Requires NVIDIA_API_KEY and
 *                            MONGODB_URI.
 *
 * Dimensionality note (see src/ai/embeddings/nvidiaEmbedder.js): we pass
 * EMBEDDING_DIMENSIONS explicitly as NVIDIA's Matryoshka `dimensions`
 * request parameter, so the returned vectors SHOULD already match — but
 * this script still checks the first embedded row's actual length and
 * warns loudly if it doesn't match, rather than trusting the request blindly.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { env } from '../src/config/env.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { createNvidiaEmbedder } from '../src/ai/embeddings/nvidiaEmbedder.js';
import {
  bulkUpsertKnowledgeChunks,
  deleteKnowledgeChunksNotIn,
} from '../src/repositories/knowledgeChunk.repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');

/** Turns one active ingestion chunk into its embedding row(s): one primary
 *  row, plus one row per Hinglish question variant (docs/03-rag.md). */
function toEmbeddingRows(chunk) {
  const base = {
    department: chunk.department,
    category: chunk.category,
    intent: chunk.intent ?? null,
    language: chunk.language,
    questionVariants: chunk.questionVariants ?? [],
    sourceFile: chunk.sourceFile,
    sourceRowRef: chunk.sourceRowRef,
    status: 'active',
    text: chunk.text,
  };

  const rows = [
    {
      ...base,
      chunkId: chunk.chunkId,
      parentChunkId: chunk.chunkId,
      isVariant: false,
      embeddingText: chunk.text,
    },
  ];

  (chunk.questionVariants ?? []).forEach((variant, i) => {
    rows.push({
      ...base,
      chunkId: `${chunk.chunkId}_v${i + 1}`,
      parentChunkId: chunk.chunkId,
      isVariant: true,
      embeddingText: variant,
      language: 'hinglish', // the variant text itself is what's Hinglish, regardless of the parent's detected language
    });
  });

  return rows;
}

async function main() {
  const processedPath = path.join(__dirname, '..', 'data', 'processed', 'knowledgeChunks.json');
  const raw = await readFile(processedPath, 'utf8').catch(() => {
    throw new Error(`Could not read ${processedPath} — run "npm run ingest" first.`);
  });
  const chunks = JSON.parse(raw);
  const activeChunks = chunks.filter((c) => c.status === 'active');
  const rows = activeChunks.flatMap(toEmbeddingRows);
  const variantRowCount = rows.length - activeChunks.length;

  console.log(
    `\n  ${activeChunks.length} active chunks -> ${rows.length} embedding rows (${activeChunks.length} primary + ${variantRowCount} Hinglish variant)`
  );

  if (isDryRun) {
    console.log('  dry run — nothing sent to NVIDIA or MongoDB.\n');
    return;
  }

  if (!env.NVIDIA_API_KEY) {
    throw new Error(
      'NVIDIA_API_KEY is not set in server/.env — get one from https://build.nvidia.com'
    );
  }
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set in server/.env.');
  }

  const embedder = createNvidiaEmbedder({
    apiKey: env.NVIDIA_API_KEY,
    model: env.NVIDIA_EMBEDDING_MODEL,
    dimensions: env.EMBEDDING_DIMENSIONS,
  });

  console.log(`  embedding with ${env.NVIDIA_EMBEDDING_MODEL} ...`);
  const texts = rows.map((r) => r.embeddingText);
  // Everything embedded here is corpus content being indexed, never a
  // citizen's live query, so input_type is always 'passage' (docs/11-decisions.md D15).
  const vectors = await embedder.embedTexts(texts, {
    inputType: 'passage',
    onBatchComplete: ({ completed, total }) =>
      process.stdout.write(`\r  embedded ${completed}/${total}`),
  });
  console.log('');

  const actualDimensions = vectors[0].length;
  if (actualDimensions !== env.EMBEDDING_DIMENSIONS) {
    console.log(
      `\n  ! ${env.NVIDIA_EMBEDDING_MODEL} returned ${actualDimensions}-dimensional vectors, but EMBEDDING_DIMENSIONS in .env says ${env.EMBEDDING_DIMENSIONS}.`
    );
    console.log(
      `    Update EMBEDDING_DIMENSIONS=${actualDimensions} in server/.env, and make sure the Atlas Vector Search index's numDimensions is also ${actualDimensions} — not 768 — or vector search will reject every document.\n`
    );
  }

  const embeddedAt = new Date();
  const withEmbeddings = rows.map((row, i) => ({
    ...row,
    embedding: vectors[i],
    embeddingModel: env.NVIDIA_EMBEDDING_MODEL,
    embeddingDimensions: actualDimensions,
    embeddedAt,
  }));

  await connectDatabase();
  const result = await bulkUpsertKnowledgeChunks(withEmbeddings);
  const removed = await deleteKnowledgeChunksNotIn(withEmbeddings.map((r) => r.chunkId));
  await disconnectDatabase();

  console.log(
    `  upserted ${result.upsertedCount ?? 0} new, updated ${result.modifiedCount ?? 0} existing, removed ${removed.deletedCount} stale row(s)`
  );
  console.log(
    `  done — ${withEmbeddings.length} vectors in the knowledgechunks collection at ${actualDimensions} dimensions.\n`
  );
}

main().catch((err) => {
  console.error('\nembed failed:', err.message);
  process.exitCode = 1;
});
