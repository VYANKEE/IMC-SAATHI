# PART 13 — Repository Structure

Single repository, three top-level workspaces. Not a monorepo tool — just
folders, because npm workspaces would add configuration for no benefit at this
size.

```
imc-saathi/
├── README.md                    architecture summary, setup, screenshots
├── LICENSE                      MIT
├── .gitignore                   node_modules, .env, uploads, coverage, dist
├── .env.example                 every key, no values
├── .editorconfig
│
├── docs/
│   ├── 00-discovery.md          document analysis + department map
│   ├── 01-requirements.md       FR/NFR + roles
│   ├── 02-architecture.md       system architecture + flows
│   ├── 03-rag.md                RAG pipeline, multilingual, evaluation
│   ├── 04-database.md           collections, indexes, relationships
│   ├── 05-api.md                API contract
│   ├── 06-frontend.md           pages, state, components, i18n
│   ├── 07-complaint-workflow.md lifecycle, reference IDs, SLA
│   ├── 08-security.md           auth, authz, uploads, secrets
│   ├── 09-repo-structure.md     this file
│   ├── 10-roadmap.md            phases + acceptance criteria
│   ├── 11-decisions.md          ADRs — why each technology
│   ├── 12-risks.md              risk register
│   ├── 13-build-plan.md         step-by-step plan
│   ├── data-quality-register.md source defects and decisions
│   ├── testing.md
│   ├── deployment.md
│   └── diagrams/
│
├── data/
│   ├── raw/                     the source documents, unmodified, committed
│   ├── processed/               ingestion output (gitignored)
│   └── seeds/                   departments.json, zones.json, categories.json,
│                                contacts.json, helplines.json, externalAuthorities.json
│
├── server/
│   ├── package.json
│   ├── src/
│   │   ├── index.js             entry — listen only
│   │   ├── app.js               express app — middleware + routes, no listen
│   │   ├── config/              env.js (validated with Zod at boot), db.js,
│   │   │                        firebase.js, cloudinary.js, logger.js, constants.js
│   │   ├── routes/              thin — path → middleware → controller
│   │   ├── controllers/         HTTP in / HTTP out. No business logic.
│   │   ├── services/            business logic. chat, complaint, department,
│   │   │                        user, knowledge, analytics, audit
│   │   ├── repositories/        all database access. Nothing else touches Mongo.
│   │   ├── models/              Mongoose schemas
│   │   ├── middleware/          auth, requireRole, validate, rateLimit,
│   │   │                        errorHandler, requestId, upload
│   │   ├── validators/          Zod schemas per endpoint
│   │   ├── utils/               referenceId, phone, language-detect, pagination
│   │   │
│   │   ├── ai/                  ── LLM layer, isolated ──
│   │   │   ├── llm/             provider.interface.js, gemini.provider.js,
│   │   │   │                    openai.provider.js, anthropic.provider.js, index.js
│   │   │   ├── embeddings/      embedder.js, batch.js
│   │   │   ├── prompts/         system.base.md, classify.department.md,
│   │   │   │                    answer.grounded.md, complaint.extract.md, clarify.md
│   │   │   └── safety/          outputValidator.js, injectionGuard.js, scope.js
│   │   │
│   │   └── rag/                 ── retrieval layer, isolated ──
│   │       ├── ingestion/       loaders/{docx,csv,pdf,xlsx}.js, cleaner.js,
│   │       │                    structureDetector.js, classifier.js, validator.js
│   │       ├── chunking/        qaChunker.js, sectionChunker.js, enricher.js
│   │       ├── retrieval/       vectorSearch.js, factLookup.js, confidence.js
│   │       ├── reranking/       noop.reranker.js   ← seam for later
│   │       └── pipeline/        chatPipeline.js    ← orchestrates the 14 steps
│   │
│   ├── scripts/                 ingest.js, seed.js, createIndexes.js,
│   │                            createAdmin.js, eval.js
│   └── tests/                   unit/ · integration/ · fixtures/
│
├── client/
│   ├── package.json  vite.config.js  tailwind.config.js  index.html
│   └── src/
│       ├── main.jsx  App.jsx  routes.jsx
│       ├── api/                axios instance + one module per resource
│       ├── components/         ui/ · layout/ · chat/ · complaint/ · department/ · common/
│       ├── pages/              one folder per route
│       ├── context/            AuthContext, LanguageContext
│       ├── hooks/              useAuth, useChat, useComplaints, useDepartments
│       ├── locales/            en.json, hi.json
│       ├── lib/                firebase.js, queryClient.js, formatters.js
│       └── styles/
│
└── .github/workflows/ci.yml     lint + test on PR
```

## Why each backend layer exists

**routes** — URL to handler mapping and middleware order. No logic. Readable as a
table of contents for the API.

**controllers** — translate HTTP into a service call and a service result into
HTTP. A controller that contains an `if` about business rules is a bug. This is
what keeps services testable without spinning up Express.

**services** — the actual rules: what a legal status transition is, how a
reference ID is minted, what happens when retrieval confidence is low. This is
the layer you would keep if you rewrote the transport tomorrow.

**repositories** — every Mongo query, in one place. Two payoffs: the citizen-
scoping invariant is enforceable in a single file, and swapping or optimising a
query never touches business logic.

**ai/ and rag/ separated from everything else** — your brief requires this and it
is right. `services/chat.service.js` orchestrates; it does not know what an
embedding is. Concretely: nothing outside `ai/llm/` may import the Gemini SDK.
Enforce it with an ESLint `no-restricted-imports` rule so the boundary is
mechanical rather than aspirational.

**prompts as .md files, not string literals** — they get versioned, diffed and
reviewed like code. A prompt change that drops groundedness by 10% should be
visible in a pull request.

## `data/raw/` is committed

The source documents go into the repository. Reasons: the knowledge base is
reproducible by anyone who clones it; ingestion is diffable when a document
changes; and reviewers can trace any answer back to a file. These are public
municipal documents, so there is no privacy objection. Complaint images are the
opposite — never committed, never on disk.

## Branching

```
main          always deployable; protected; Vercel + Render deploy from it
  └── feat/<phase>-<slug>     e.g. feat/06-ingestion-pipeline
  └── fix/<slug>
```

Squash-merge via PR, one PR per phase. **No `develop` branch** — for a solo
project it is a second thing to keep in sync with no reviewer to benefit from
it. Tag each completed phase (`v0.6.0-ingestion`) so you can demo any point in
the history.

Commit convention: `feat:` `fix:` `docs:` `refactor:` `test:` `chore:`.
Example: `feat(rag): add Hinglish question variants to chunk embeddings`.

---

## Revision — 30 Aug 2026: two deployable roots

The tree above showed `data/` at the repository root. It now lives at
**`server/data/`**, and env files are split per workspace. Three reasons:

1. **Deployment.** Render is pointed at `server/` as its root directory. Seed
   and source files outside that folder would not exist at runtime.
2. **Ownership.** The ingestion CLI and the seed script are server code. Data
   they read belongs beside them.
3. **A real bug.** `dotenv` resolves `.env` from the process working directory,
   and `npm run dev --workspace server` runs with cwd = `server/`. A root
   `.env` was never being read at all. Vite likewise reads `client/.env`.
   Splitting them fixes this and creates a hard wall: secrets go in
   `server/.env`; `client/.env` holds only `VITE_` values, every one of which is
   compiled into the browser bundle and readable by anyone.

Top level is now `client/` and `server/` — the two things that deploy — plus
`docs/`, `.github/` (GitHub requires it there) and config files.
