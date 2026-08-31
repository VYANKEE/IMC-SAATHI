# IMC Saathi

AI Citizen Service & Complaint Assistant for the **Indore Municipal Corporation**.

A multilingual (English / हिंदी / Hinglish) assistant that tells a citizen which
IMC department handles their problem and what to do about it — answering only
from official IMC source documents, with citations — plus a complaint portal
that turns that answer into a tracked grievance.

> **Status:** Backend phases 0–7 done — DB + seeds, ingestion pipeline,
> retrieval, grounded generation, and `POST /api/chat` all work end to end
> against real MongoDB Atlas + NVIDIA NIM. Phase 8 (auth) is explicitly
> deferred. Phase 9 (the real frontend) is separate, in-progress work — see
> [`server/public/demo.html`](server/public/demo.html) below for what the
> backend currently supports and the exact API shapes to build against.
> Full plan in [`docs/10-roadmap.md`](docs/10-roadmap.md), what changed
> along the way in [`docs/11-decisions.md`](docs/11-decisions.md).

---

## The core design idea

**RAG retrieves the _procedure_. The database supplies the _facts_.**

Contact numbers, office addresses, ward→zone mappings, helplines and rates are
never embedded and never retrieved semantically. They are looked up
deterministically, injected into the prompt as verified data, and re-checked
against the model's output after generation.

That turns "never invent a phone number" from a prompt instruction — which
models violate — into a structural property they cannot. In a municipal system a
wrong number sends a real citizen to the wrong office, so this is the property
the whole architecture is organised around.

Details: [`docs/03-rag.md`](docs/03-rag.md)

---

## Tech stack

| Layer            | Choice                                   | Why                                               |
| ---------------- | ---------------------------------------- | ------------------------------------------------- |
| Frontend         | React + Vite + Tailwind + TanStack Query | [`docs/11-decisions.md`](docs/11-decisions.md) D7 |
| Backend          | Node + Express 5                         | D4                                                |
| Database         | MongoDB Atlas                            | D5                                                |
| Vector search    | Atlas Vector Search                      | D3 — zero extra infrastructure                    |
| LLM + embeddings | NVIDIA NIM (chat + embeddings)           | D1, D2, D15, D16                                  |
| Auth             | Firebase (phone OTP primary)             | D6                                                |
| Media            | Cloudinary, authenticated uploads        | D8                                                |
| Deploy           | Vercel + Render + Atlas                  | D9                                                |

---

## Getting started

```bash
# 1. install (npm workspaces installs server + client together)
npm install

# 2. create your local env files — one per workspace, not a shared root one
cp server/.env.example server/.env    # Windows: copy server\.env.example server\.env
cp client/.env.example client/.env    # Windows: copy client\.env.example client\.env
# then fill in server/.env: MONGODB_URI and NVIDIA_API_KEY at minimum —
# see server/.env.example's own comments for what each variable is for.

# 3. (first time only, needs the credentials from step 2) build the
#    knowledge base: turn server/data/raw/* into embedded, searchable
#    chunks and seed departments/zones/contacts into Mongo.
npm run ingest --workspace server   # local only, no network/credentials needed
npm run embed --workspace server    # calls NVIDIA + writes to MongoDB
npm run seed --workspace server     # writes departments/zones/contacts to MongoDB

# 4. run the API
npm run dev:server

# 5. check it
curl http://localhost:5000/api/health
# and see the working reference chat flow at http://localhost:5000/
# (server/public/demo.html — see "Handover to the frontend team" below)
```

Expected health-check response:

```json
{ "success": true, "data": { "status": "ok", "service": "imc-saathi-api", "...": "..." } }
```

Other commands:

```bash
npm run dev          # API + client together (client is an empty Vite scaffold today)
npm run dev:server   # API only
npm run dev:client   # client only
npm test             # test suites in both workspaces
npm run lint         # eslint across both workspaces
npm run format       # prettier, write
npm run build        # production build of the client
npm run verify       # lint + test + build — run this before you push
```

---

## Handover to the frontend team

The backend (phases 0–7) is done and working against real MongoDB Atlas +
NVIDIA NIM — `POST /api/chat`, `GET /api/departments`, and
`GET /api/departments/:slug[/suggested-questions]` are the three endpoints a
real frontend needs. [`server/public/demo.js`](server/public/demo.js) is a
deliberately minimal, heavily-commented reference client — no framework, no
build step — written specifically so it's easy to read the exact request/
response shapes off of rather than reverse-engineering them from the route
handlers. Its top-of-file comment block **is** the API contract: every
route, every field, every response shape for all four chat routes
(`grounded`/`out_of_scope`/`non_imc`/`non_imc_unresolved`). Start there.

[`docs/05-api.md`](docs/05-api.md) has the original planned contract;
`demo.js`'s comment block reflects what's actually implemented today, which
is the more current of the two where they differ.

Auth (Phase 8) is intentionally not built — every route above is open,
unauthenticated. Do not assume a request is a specific citizen; there is no
session/user concept yet.

---

## Repository layout

```
imc-saathi/
├── client/               React + Vite frontend        → deploys to Vercel
│   ├── .env.example      VITE_ vars only (public!)
│   └── src/
│       ├── api/          the only place that calls the API
│       ├── components/   ui/ · layout/ · chat/ · complaint/
│       └── pages/        one folder per route
│
├── server/               Express API                  → deploys to Render
│   ├── .env.example      secrets live here, never in client/
│   ├── public/           demo.html + demo.js — the reference chat client,
│   │                     see "Handover to the frontend team" above
│   ├── data/
│   │   ├── raw/          official IMC source documents (committed)
│   │   ├── seeds/        departments, zones, contacts, external authorities
│   │   └── processed/    ingestion output (git-ignored, `npm run ingest` writes it)
│   ├── scripts/          ingest · embed · seed · eval · a few one-off
│   │                     diagnostic scripts kept for docs/11-decisions.md's record
│   ├── tests/
│   └── src/
│       ├── routes/       path → controller. No logic.
│       ├── controllers/  HTTP in, HTTP out.
│       ├── services/     business rules.
│       ├── repositories/ all database access — nothing else touches Mongo.
│       ├── models/       mongoose schemas
│       ├── middleware/   validate · errorHandler · notFound · requestId
│       │                 (no auth, no rate limiting yet — Phase 8 / Phase 14)
│       ├── ingestion/    raw files -> chunks: loaders/ · chunkers/ · classifier · validate
│       └── ai/           the RAG + LLM layer: classify/ · retrieval/ · facts/ ·
│                         generate/ · llm/ · prompts/ · validate/ · schemas/
│
├── docs/                 architecture, decisions, risks
└── .github/workflows/    CI
```

**Two deployable folders, on purpose.** `client/` and `server/` are the only
things that ship. Vercel is pointed at `client/`, Render at `server/` — each has
its own `package.json`, its own `.env`, and no knowledge of the other beyond the
API URL. `data/` lives inside `server/` because the ingestion and seed scripts
read it and Render needs it at runtime.

**Environment variables are split per workspace on purpose too.** `server/.env`
holds real secrets and is read by Node. `client/.env` holds only `VITE_` values,
and **every one of them is compiled into the browser bundle** where anyone can
read it. A single shared `.env` at the root makes it far too easy to leak a
server secret into the client build.

Why each backend layer exists: [`docs/09-repo-structure.md`](docs/09-repo-structure.md)

---

## Documentation

| Doc                                                         | Contents                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| [`00-discovery.md`](docs/00-discovery.md)                   | Source document analysis + IMC department map                |
| [`data-quality-register.md`](docs/data-quality-register.md) | 18 defects found in the source data and what each one forces |
| [`01-requirements.md`](docs/01-requirements.md)             | Functional / non-functional requirements, user roles         |
| [`02-architecture.md`](docs/02-architecture.md)             | System architecture and request flows                        |
| [`03-rag.md`](docs/03-rag.md)                               | RAG pipeline, multilingual strategy, evaluation              |
| [`04-database.md`](docs/04-database.md)                     | Collections, indexes, relationships                          |
| [`05-api.md`](docs/05-api.md)                               | API contract                                                 |
| [`06-frontend.md`](docs/06-frontend.md)                     | Pages, state, components, i18n                               |
| [`07-complaint-workflow.md`](docs/07-complaint-workflow.md) | Status lifecycle, reference IDs, SLA                         |
| [`08-security.md`](docs/08-security.md)                     | Auth, authorization, uploads, secrets                        |
| [`10-roadmap.md`](docs/10-roadmap.md)                       | 14 milestones with acceptance criteria                       |
| [`11-decisions.md`](docs/11-decisions.md)                   | Why each technology, and what would change the choice        |
| [`12-risks.md`](docs/12-risks.md)                           | Risk register                                                |

---

## Data sources

Everything the assistant says traces back to an official IMC document in
`data/raw/`. Where the documents are silent, the assistant says so rather than
filling the gap — see the data quality register for the 18 known defects and
gaps in the current source set.

## License

MIT — see [LICENSE](LICENSE).
