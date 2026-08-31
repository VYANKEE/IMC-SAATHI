import mongoose from 'mongoose';

/**
 * One retrievable unit of RAG content — a Q/A pair, a narrative section, or
 * a numbered KB.pdf FAQ, produced by the Phase 3 ingestion pipeline
 * (server/src/ingestion/) and embedded by Phase 4 (server/scripts/embed.js).
 *
 * Two kinds of row live in this collection, distinguished by `isVariant`:
 *
 *   - a **primary** row: `parentChunkId === chunkId`, `embeddingText` is the
 *     full chunk text (with its `[Department | category | intent]` header).
 *   - a **variant** row: one per Hinglish transliteration parsed out of a
 *     source question (data-quality-register.md #13 — "Fire NOC kaise apply
 *     karu?"). `embeddingText` is just that short phrase; `text` is
 *     identical to its parent's — a variant exists purely so the *vector*
 *     for a Hinglish query can match, but retrieval always returns the same
 *     procedural content docs/03-rag.md's "highest-value, lowest-effort
 *     retrieval win": index the Hinglish phrasing you already have instead
 *     of translating the whole corpus.
 *
 * Never confuse `embeddingText` (what got embedded, used only to produce the
 * vector) with `text` (what gets injected into the LLM prompt when this row
 * is retrieved) — they differ on every variant row by design.
 *
 * `embedding` is left unset by the ingestion pipeline and populated only by
 * the embed script — a document with no `embedding` yet is a normal,
 * expected state (embedding hasn't run, or this row was quarantined and
 * intentionally never will be), not a bug.
 */
const knowledgeChunkSchema = new mongoose.Schema(
  {
    chunkId: { type: String, required: true, trim: true, unique: true },
    parentChunkId: { type: String, required: true, trim: true },
    isVariant: { type: Boolean, default: false },

    embeddingText: { type: String, required: true },
    text: { type: String, required: true },

    department: { type: String, required: true, uppercase: true, trim: true },
    category: { type: String, required: true, trim: true },
    intent: { type: String, trim: true },
    language: { type: String, enum: ['en', 'hi', 'hinglish'], required: true },
    questionVariants: [{ type: String, trim: true }],

    sourceFile: { type: String, required: true, trim: true },
    sourceRowRef: { type: String, required: true, trim: true },

    // Mirrors the ingestion report's status. Only 'active' rows are ever
    // written by the embed script — kept as an enum (not a boolean) so a
    // future re-embed run can tell at a glance why a row is here at all.
    status: { type: String, enum: ['active'], required: true },

    embedding: { type: [Number], default: undefined },
    embeddingModel: { type: String, trim: true },
    embeddingDimensions: { type: Number },
    embeddedAt: { type: Date },
  },
  { timestamps: true }
);

// Re-running the embed script must upsert on chunkId, never duplicate.
knowledgeChunkSchema.index({ parentChunkId: 1 });
knowledgeChunkSchema.index({ department: 1, status: 1 });

export const KnowledgeChunk = mongoose.model('KnowledgeChunk', knowledgeChunkSchema);
