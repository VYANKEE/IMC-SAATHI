# PART 14 — Development Roadmap

Your brief proposed 20 phases and invited a better sequence. I am proposing
**14 milestones** with two substantive reorderings.

## What I changed, and why

**1. Evaluation moves from Phase 16 → Phase 5, immediately after retrieval.**
This is the important one. Every decision after retrieval — chunk size, the
confidence threshold, whether you need a reranker, whether Hinglish works, which
prompt wording is better — is a coin flip without measurement. Building the eval
harness at the end means you spent twelve phases guessing and then discovered the
guesses were wrong with no time to fix them. Build the golden set from your real
documents _before_ the LLM is wired up, and every later phase gets a number
attached to it.

**2. Full frontend splits into a thin harness (Phase 7) and the real UI (Phase 9).**
You need _a_ way to type a question and see an answer as soon as the chat API
exists — but you do not need Tailwind theming, i18n and a sidebar to get it. A
one-page test harness costs an hour and unblocks the whole AI half of the project;
the polished UI comes once the answers are worth showing.

**3. Knowledge base and ingestion come before authentication.** Auth is
well-trodden and low-risk. Ingestion and retrieval are where this project can
actually fail. Do the risky thing while you still have time to change course.

---

## Milestones

| #      | Milestone                                | Delivers                                                                                                                                                                 | Done when                                                                                                                           |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **0**  | **Discovery** ✅                         | This documentation set, department taxonomy, data quality register                                                                                                       | You can explain the department map and the top 5 data risks without notes                                                           |
| **1**  | **Repo & foundation**                    | Repo, folder structure, `.env.example`, Express skeleton, health endpoint, error middleware, structured logging, ESLint/Prettier, CI                                     | `GET /api/health` returns 200 locally and CI is green                                                                               |
| **2**  | **Database & seeds**                     | Mongoose models for all 14 collections, index creation script, seed script loading departments, zones (22), contacts, categories, helplines, external authorities        | `npm run seed` populates Atlas; ward 47 → Zone 09 resolves                                                                          |
| **3**  | **Ingestion pipeline**                   | Loaders (docx/csv/pdf/xlsx), cleaner, structure detection, classifier, chunkers, language detection, validation gate, `npm run ingest`                                   | All source documents ingest; ingestion report lists every issue from the data quality register; re-running produces zero duplicates |
| **4**  | **Embeddings & vector store**            | Gemini embedding adapter, batching, `knowledgeChunks` populated, Atlas vector index created, Hinglish variant vectors                                                    | ~400–600 chunks embedded; index queryable from a script                                                                             |
| **5**  | **Retrieval + evaluation harness** ⭐    | `$vectorSearch` with metadata filtering, confidence gate, fact lookup, **golden set of ~80 questions**, `npm run eval` reporting Recall@k / Precision@k per language     | Recall@5 ≥ 0.90 English, ≥ 0.80 Hindi and Hinglish. **Numbers written down.**                                                       |
| **6**  | **LLM layer & grounded generation**      | Provider interface + Gemini adapter, five prompt templates, JSON-mode structured output, post-generation fact validator                                                  | Groundedness ≥ 95% on the golden set; **zero fabricated phone numbers**; refusal accuracy 100% on the unanswerable slice            |
| **7**  | **Chat API + thin test harness**         | `POST /api/chat`, session and message persistence with retrieval traces, classification, out-of-scope and non-IMC routing, one-page HTML harness                         | All five examples from your brief return correct, cited answers                                                                     |
| **8**  | **Authentication & authorization**       | Firebase phone + Google, token verification, user upsert, roles from Mongo, middleware, admin bootstrap script                                                           | Citizen/staff/admin tokens hit the right walls; **the cross-tenant 404 test passes**                                                |
| **9**  | **Frontend foundation & chat UI**        | Vite + Tailwind + Router + TanStack Query, i18n (en/hi), design system components, home page, department directory, full chat UI with `AnswerCard` and citations         | Your mockup is reproduced; Hindi renders correctly on mobile                                                                        |
| **10** | **Complaint system**                     | Create/read/track/reopen, reference ID generation, status machine with server-enforced transitions, event log, citizen dashboard                                         | File → receive `IMC-2026-XXXXXXX` → track it publicly → reopen it                                                                   |
| **11** | **Image upload**                         | Multer memory, magic-byte + EXIF handling, Cloudinary authenticated upload, signed serving, mobile camera capture, client compression                                    | A photo taken on a phone appears in the staff view and is unreachable without authorization                                         |
| **12** | **Chat → complaint integration**         | `suggestedActions`, complaint draft extraction, pre-filled form, `chatSessionId` linkage                                                                                 | "Street light kharab hai" → File a Complaint → form pre-filled → citizen confirms                                                   |
| **13** | **Staff & admin dashboards**             | Department-scoped queue, status updates with remarks, admin analytics, assignment, knowledge management, data-quality queue, audit log view                              | Staff cannot see another department's complaints, verified by test                                                                  |
| **14** | **Hardening, testing, deployment, docs** | Rate limits, Helmet, CORS, secret audit, unit + integration + E2E tests, Vercel + Render + Atlas deployment, README with architecture and screenshots, final eval report | Deployed URLs work; test suite green; you can explain every question in §74 of your brief                                           |

⭐ = the phase that changes the outcome of the project.

## Milestone dependencies

```
0 ─► 1 ─► 2 ─► 3 ─► 4 ─► 5 ─► 6 ─► 7 ─┬─► 9 ─► 10 ─► 11 ─► 12 ─► 13 ─► 14
                                       │              ▲
                              8 ───────┴──────────────┘
```

Phase 8 (auth) is independent of the AI chain and can be built in parallel or
slotted into a low-energy day. Phases 10–13 all depend on it.

## Working agreement per milestone

Every milestone ends with: working code · error handling · input validation ·
tests where they earn their keep · updated docs · a conventional commit and a
tagged PR · and a short written note of what is **not** yet production-ready.
Your brief's §67 asks for exactly that honesty, and it is the habit that
separates "it runs on my laptop" from an engineering deliverable.
