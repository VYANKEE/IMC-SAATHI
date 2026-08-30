# PART 6 — Complete System Architecture

## High-level view

```
                        ┌──────────────────────────┐
   Citizen (mobile/web) │  React + Vite + Tailwind │  → Vercel
                        │  i18n (en / hi)          │
                        └────────────┬─────────────┘
                                     │ HTTPS, Firebase ID token
                                     ▼
                        ┌──────────────────────────┐
                        │  Express API  (Render)   │
                        │  Helmet · CORS · Zod     │
                        │  rate limit · requestId  │
                        └────────────┬─────────────┘
                                     │
        ┌──────────────┬─────────────┼─────────────┬──────────────┐
        ▼              ▼             ▼             ▼              ▼
  ┌──────────┐  ┌────────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐
  │  Auth    │  │ Complaint  │ │   Chat   │ │  Admin    │ │  Media     │
  │ service  │  │  service   │ │ service  │ │  service  │ │  service   │
  └────┬─────┘  └─────┬──────┘ └────┬─────┘ └─────┬─────┘ └─────┬──────┘
       │              │             │             │             │
       ▼              ▼             ▼             ▼             ▼
 ┌──────────┐   ┌──────────────────────────────────────┐  ┌───────────┐
 │ Firebase │   │        MongoDB Atlas                 │  │Cloudinary │
 │   Auth   │   │  users · departments · zones ·       │  │  signed   │
 │ (verify  │   │  contacts · services · categories ·  │  │  uploads  │
 │  token)  │   │  complaints · complaintEvents ·      │  └───────────┘
 └──────────┘   │  chatSessions · chatMessages ·       │
                │  knowledgeDocuments · auditLogs ·    │
                │  knowledgeChunks  ← Atlas Vector     │
                │                     Search index     │
                └───────────────┬──────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   RAG pipeline (in-    │
                    │   process module)      │
                    │  classify → retrieve → │
                    │  assemble → generate → │
                    │  validate              │
                    └───────────┬────────────┘
                                ▼
                    ┌────────────────────────┐
                    │  LLMProvider interface │
                    │  ├─ GeminiProvider ◄── active
                    │  ├─ OpenAIProvider     │
                    │  └─ AnthropicProvider  │
                    └────────────────────────┘

  Offline / out of band:
  ┌───────────────────────────────────────────────────────────────┐
  │  ingestion CLI  →  load · clean · classify · chunk · embed ·  │
  │  validate · upsert  (npm run ingest)                          │
  └───────────────────────────────────────────────────────────────┘
```

## Why this shape

**Single Express service, not microservices.** One internship-scale codebase,
one deploy, one log stream. The _modules_ are separated cleanly (services,
repositories, an isolated `rag/` and `ai/` tree) so the seams exist if it ever
needs splitting — but splitting now would buy nothing and cost you a working
demo. Overengineering is explicitly called out as a failure mode in your brief.

**Ingestion is a CLI, not an API route.** It is slow, bursty, and must be
runnable and re-runnable from your laptop or CI without touching production
traffic. Your brief requires this ("the ingestion process should be separate
from the web application runtime") and it is right: an embedding job inside a
request handler will time out on Render's free tier.

**One database, two access patterns.** MongoDB Atlas holds both the operational
data and the vector index. That is the whole reason to pick Atlas Vector Search
over Qdrant/Chroma — see `11-decisions.md` D3.

**The LLM sits behind an interface with two methods** (`generate`, `embed`) and
nothing else in the codebase imports the Gemini SDK. Swapping to OpenAI is one
adapter file plus an env var.

---

## Request flows

### Chat flow

```
POST /api/chat  { sessionId?, message, language, departmentId? }
  │
  1. authOptional        → attach user if a token is present (chat works anonymously)
  2. rateLimit           → 20 req/min per user or IP
  3. validate (Zod)      → message 1..1000 chars, language ∈ {en,hi}
  4. loadSession         → last N turns for context (N=6, summarised beyond that)
  5. classify            → { departmentId, categoryId, confidence, alternatives[], isOutOfScope, isNonIMC }
       ├─ departmentId supplied by the user? skip the LLM, trust the user
       ├─ isOutOfScope   → decline, return early (no retrieval, no cost)
       └─ isNonIMC       → return the external-authority answer from `externalAuthorities`, return early
  6. embed query         → gemini-embedding-001, task_type=RETRIEVAL_QUERY, 768-d
  7. retrieve            → $vectorSearch, k=8, filter { departmentId } when confidence ≥ 0.6
  8. confidence gate     → top score < THRESHOLD → documented fallback, return early
  9. lookupFacts         → contacts/zones/office-hours for the resolved department (deterministic, from DB)
 10. buildPrompt         → system + grounding rules + fenced context + injected facts + history
 11. generate            → JSON-mode response
 12. validateOutput      → every phone/URL/officer name must appear in step 9's fact set, else strip + degrade
 13. persist             → chatMessages (+ retrieval trace: chunkIds, scores, model, tokens, latency)
 14. respond             → structured JSON for the UI to render as sections
```

Steps 5 and 8 are the two early exits that keep cost and hallucination down: an
out-of-scope question never reaches the LLM's answer path, and a
low-confidence retrieval never reaches generation at all.

### Complaint flow

```
POST /api/complaints  (multipart)
  authRequired → rateLimit(5/hr) → Zod validate → upload images to Cloudinary
  (signed, private, MIME + magic-byte + ≤5 MB each, ≤5 files)
  → generate reference ID (crypto random, collision-checked)
  → insert complaint { status: SUBMITTED }
  → insert complaintEvent { type: CREATED, actor: userId }
  → auditLog
  → 201 { referenceId }
```

### Auth flow

```
Client: Firebase phone OTP / Google  → ID token (JWT)
Every protected request: Authorization: Bearer <idToken>
Backend: firebase-admin verifyIdToken()  → uid
  → find or create users doc keyed by firebaseUid
  → read role FROM MONGODB (source of truth), not from the token
  → attach req.user { id, firebaseUid, role, departmentId }
```

Role is read from the database on every request rather than trusted from a
custom claim, because a claim is only refreshed when the client's token rotates
— a revoked staff account would keep working for up to an hour otherwise.

### Image flow

```
Client picks/takes photo → POST multipart → Multer memory storage
  → size + MIME + magic-byte check → Cloudinary upload (type: authenticated,
    folder: complaints/<referenceId>) → store publicId, not a raw URL
Serving: backend authorises the viewer, then mints a short-lived signed URL.
```

Storing the `publicId` rather than a URL is what makes the access check
possible; a stored public URL is a permanent leak of a citizen's photo.

### Ingestion flow

```
npm run ingest -- --source ./data/raw [--only water_supply.docx] [--dry-run]

 load        DOCX (mammoth) · CSV (csv-parse) · PDF (pdf-parse) · XLSX (xlsx)
 hash        skip if content hash already ingested
 clean       whitespace, unbalanced brackets, tracking params, float→string phones
 structure   detect Q/A pairs vs narrative sections
 classify    map to { department, category, intent } via the taxonomy table
 split       structured facts → typed collections ; prose → chunks
 chunk       1 Q/A pair = 1 chunk ; narrative = 1 heading section per chunk
 enrich      prepend "Department | Category | Intent" header to chunk text
 detectLang  Devanagari ratio + Hinglish heuristic (never trust the source column)
 validate    S1 rules block publication; S2/S3 warn into a report
 embed       batched, task_type=RETRIEVAL_DOCUMENT, 768-d
 upsert      knowledgeChunks, keyed by (documentId, chunkIndex)
 report      write ingestion-report.json + summary to stdout
```
