# PART 17 — Final Build Plan

The immediate, concrete steps. Nothing here is code — that starts once you
approve the architecture, per your §71.

## Before writing any code

1. **Read `data-quality-register.md` and decide the S1 items.** Specifically:
   quarantine the Makronia/Chhatarpur housing content? disable the Birth
   Certificate and Trade License chips? Both are yes from me; you own the call.
2. **Ask your IMC mentor three questions.** (a) Is there any Indore 311 / CRM API,
   webhook or export? — this determines R1. (b) Can you get the current FY 2026-27
   property tax rate notice? (c) Can you get source documents for Birth & Death
   Registration and Market & License, or should those be dropped from v1?
3. **Create accounts:** GitHub repo, MongoDB Atlas (M0, region `ap-south-1` —
   Mumbai, lowest latency to Indore), Firebase project, Cloudinary, Google AI
   Studio key.
4. **Confirm the department taxonomy** in `00-discovery.md` §PART 3 with your
   mentor. Everything downstream — the selector, the classifier's label space,
   the chunk metadata — keys off it, so a change later is expensive.

## Phase 1 — Repository & foundation

Scaffold `server/` and `client/`. `.gitignore` and `.env.example` in the **first
commit** — a leaked key on commit two is a rotation, not a revert. Express app
with Helmet, CORS, JSON parsing, request-ID middleware, structured logger, error
handler, `/api/health`. Zod-validated env at boot so a missing variable fails
loudly at startup rather than mysteriously at 2 a.m. ESLint + Prettier + the
`no-restricted-imports` rule that keeps the Gemini SDK inside `ai/llm/`.
CI: lint + test on PR.
→ `feat(setup): initialise repository with express skeleton and tooling`

## Phase 2 — Database & seeds

All 14 Mongoose models. `scripts/createIndexes.js`. `scripts/seed.js` loading
`data/seeds/*.json`: 22 zones with the verified ward mapping, ~35 contacts,
departments with `coverageTier`, complaint categories, 13 helplines, external
authorities. Verify: ward 47 → Zone 09 → Dr. Bhimrao Ambedkar → 0731-4986513.
→ `feat(db): add mongoose models, indexes and seed data`

## Phase 3 — Ingestion pipeline

Loaders per format. Cleaner (whitespace, brackets, tracking params, float→string
phones). Structure detection (Q/A pairs vs narrative). Taxonomy classifier.
Q/A and section chunkers with contextual headers. Hinglish variant extraction
from the bracketed CSV text. Language detection. The validation gate from the
data quality register. `npm run ingest` with `--dry-run` and `--only`.
**Acceptance:** all source documents ingest, the report reproduces every known
defect, and a second run creates zero duplicates.
→ `feat(rag): add document ingestion pipeline with validation`

## Phase 4 — Embeddings & vector store

Gemini embedding adapter with batching and retry. Populate `knowledgeChunks`.
Create the Atlas vector index (768-d, cosine, filters on `departmentId`,
`language`, `status`).
→ `feat(rag): generate embeddings and create atlas vector index`

## Phase 5 — Retrieval & evaluation ⭐

`$vectorSearch` with conditional metadata filtering, the confidence gate, and
deterministic fact lookup. Then **write the 80-question golden set from your real
documents** and `npm run eval`. Tune `MIN_SCORE` against it. Write the numbers
down — this is the phase that tells you whether the project works.
→ `feat(rag): add vector retrieval and evaluation harness`

## Phase 6 — LLM layer & grounded generation

Provider interface, Gemini adapter, the five prompt templates, JSON-mode
structured output, and the post-generation fact validator with the
`groundingViolations` counter. Re-run the eval for groundedness and refusal
accuracy.
→ `feat(ai): add llm provider abstraction and grounded answer generation`

## Phase 7 — Chat API & test harness

`POST /api/chat` orchestrating the 14-step pipeline. Session and message
persistence with full retrieval traces. Out-of-scope and non-IMC early exits. A
one-page HTML harness to type questions into.
**Acceptance:** all five examples from your brief §1 return correct, cited
answers in the right language.
→ `feat(chat): add chat api with rag pipeline orchestration`

## Phases 8–14

Proceed per `10-roadmap.md`. Each ends with tests, docs, a tagged PR, and a
written note of what is not yet production-ready.

---

## How I will work with you from here

Per your §63 and §72, every implementation step arrives in this shape:

```
# Step X — Module Name
1. What are we building?      2. Why?              3. Architecture
4. Files involved             5. Implementation    6. Code explanation
7. How to run                 8. How to test       9. Common mistakes
10. Git commit               11. What you should understand before moving on
```

Explanations in Hinglish, technical terms in English. One meaningful milestone at
a time — no 5,000-line dumps. When something breaks, we diagnose before we
rewrite: understand the error, find the file, find the line, make the smallest
fix, explain why it works.

And I will not tell you something is production-ready because it runs locally.
Each milestone gets an honest split: what is ready, what is assumed, what is
untested, what needs hardening.

---

## Your decision

Approve or amend:

1. **The department taxonomy** (`00-discovery.md` PART 3) — Tier A launches, Tier
   B is contact-only, Tier C is disabled.
2. **Facts-from-database, not from RAG** (D12) — the core anti-hallucination
   design.
3. **No KB translation; multilingual embeddings** (`03-rag.md`).
4. **Atlas Vector Search over a separate vector DB** (D3).
5. **Evaluation at Phase 5, not Phase 16** — my main change to your sequence.
6. **The three questions for your IMC mentor**, especially the 311 API.

Once you approve, we start Phase 1 and I will teach it as we build it.
