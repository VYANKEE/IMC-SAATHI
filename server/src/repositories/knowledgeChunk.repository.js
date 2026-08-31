import { KnowledgeChunk } from '../models/index.js';

/**
 * All database access for the vector-indexed RAG corpus. Only the Phase 4
 * embed script (server/scripts/embed.js) writes here; Phase 5's retrieval
 * layer will only ever read.
 */

/**
 * Upserts a batch of embedded rows keyed on `chunkId`, exactly like
 * scripts/seed.js does for departments/zones/contacts — safe to re-run the
 * embed script after a source document changes without creating duplicates
 * or needing to drop the collection first.
 */
export function bulkUpsertKnowledgeChunks(rows) {
  if (rows.length === 0) return Promise.resolve({ upsertedCount: 0, modifiedCount: 0 });
  return KnowledgeChunk.bulkWrite(
    rows.map((row) => ({
      updateOne: {
        filter: { chunkId: row.chunkId },
        update: { $set: row },
        upsert: true,
      },
    }))
  );
}

/** Removes rows whose chunkId is no longer produced by the current
 *  ingestion output — otherwise a chunk that gets deleted or quarantined
 *  in a later ingestion run stays retrievable forever. */
export function deleteKnowledgeChunksNotIn(chunkIds) {
  return KnowledgeChunk.deleteMany({ chunkId: { $nin: chunkIds } });
}

export function countKnowledgeChunks() {
  return KnowledgeChunk.countDocuments();
}
