# PART 15 — Technology Decisions (ADRs)

Format: decision · why · alternatives considered · why not them · what would
change my mind.

---

### D1 — LLM provider: **Gemini**, behind a provider interface

**Why.** You have Google AI Studio access, the free tier is usable for
development from India, Gemini handles Hindi and Hinglish well, and — decisively
— the _same vendor_ supplies `gemini-embedding-001`, so generation and
embeddings share one key, one SDK and one quota. Native JSON-mode output makes
the structured-answer contract enforceable rather than hopeful.

**Alternatives.** OpenAI (excellent, but paid from the first call and a second
vendor for embeddings if you want the best Hindi). Anthropic (strong generation,
**no embedding model**, so you'd still need a second provider). Self-hosted
open-weight (no GPU, no budget, no).

**Mitigation.** Nothing outside `src/ai/llm/` imports the Gemini SDK. Two
methods, `generate()` and `embed()`. Swapping providers is one adapter file plus
an env var — which is exactly what your brief's §8 demands.

**Would change my mind:** IMC providing a paid OpenAI/Azure key, or Gemini's
Hindi retrieval underperforming on the Phase 5 eval.

---

### D2 — Embeddings: **`gemini-embedding-001` at 768 dimensions**

**Why.** Genuinely multilingual — English, Devanagari Hindi and (adequately)
Hinglish land in one shared vector space, which is what makes the
no-translation, no-duplicate-index strategy work. It supports Matryoshka
truncation, so 768 dimensions is a supported operating point rather than a hack.

**Why 768 and not 3072.** Four times smaller index, four times less storage and
memory on Atlas M0, faster comparisons — and at ~500 chunks the recall difference
is inside the noise. Measure it in Phase 5 and revisit if the numbers disagree.

**Alternatives.** OpenAI `text-embedding-3-large` (excellent, second vendor,
paid). `multilingual-e5-large` self-hosted (free, but you'd host and scale an
inference service). Translate-then-embed-in-English (adds a lossy hop and
latency to every query — rejected in `03-rag.md`).

---

### D3 — Vector database: **MongoDB Atlas Vector Search**

**Why.** MongoDB Atlas is already in your stack. Using it for vectors means
**zero additional infrastructure** — no extra service to deploy, secure, monitor,
pay for or explain. Metadata filtering by `departmentId` and `language` is native
to `$vectorSearch`, which the department-filtering requirement needs directly.
Operational data and knowledge chunks live in one database with one connection
string and one backup story.

**Alternatives.** Qdrant (better pure vector engine — genuinely so — but another
deployed service, another set of credentials, another failure mode, for a 500-
chunk corpus). Pinecone (managed, but a paid third-party dependency and vendor
lock-in). Chroma (great locally, awkward to persist on Render's ephemeral
filesystem). pgvector (would mean adding Postgres alongside Mongo — two
databases, worst of both).

**The honest trade-off:** at 10 million chunks I would pick Qdrant. At 500,
picking it would be resume-driven architecture. Your brief says _"do not add
unnecessary complexity"_ — this is the clearest place to honour that.

**Would change my mind:** corpus growth past a few hundred thousand chunks, or a
need for hybrid BM25+vector search that Atlas cannot express.

---

### D4 — Backend: **Node.js + Express**

**Why.** One language across the stack, the largest ecosystem for exactly this
set of integrations (firebase-admin, mongoose, cloudinary, all first-class), and
it deploys on Render's free tier without ceremony. You already know it, and the
project's difficulty should live in the RAG design, not in learning a framework.

**Alternatives.** NestJS (better structure out of the box, but a large DI/decorator
learning curve on top of everything else you're learning). FastAPI (better ML
ecosystem, but a second language and a second deployment). Fastify (faster;
smaller ecosystem; performance is not your bottleneck — the LLM call is).

**Mitigation.** Express gives you no structure, so the layered architecture in
`09-repo-structure.md` supplies it deliberately.

---

### D5 — Database: **MongoDB Atlas**

**Why.** Your knowledge records are genuinely document-shaped and irregular —
24 columns in the dataset, free-form docx sections, per-category `requiredFields`
that differ by category. A flexible schema fits. The free M0 tier is sufficient,
and D3 depends on this choice.

**Alternatives.** PostgreSQL (better for the relational parts — complaints,
users, events — and pgvector is good; but you'd lose the free managed vector
search and gain a migration workflow). Firestore (pairs with Firebase Auth, but
weak querying and no vector search).

**The honest trade-off:** the complaint/event/user side of this schema is
relational and would be marginally cleaner in Postgres. The knowledge side and
the vector index are decisively better in Atlas. One database beats two.

---

### D6 — Auth: **Firebase Authentication**

**Why.** Phone OTP is effectively mandatory for Indian citizen services and is
genuinely hard to build well yourself (SMS provider, rate limiting, retry, fraud).
Firebase gives it, plus Google sign-in, plus token verification, in an afternoon.
Free tier is generous.

**Alternatives.** Roll-your-own JWT (you would own password reset, OTP delivery
and credential-stuffing defence — weeks of work and a real security surface).
Auth0/Clerk (excellent, paid at scale).

**Mitigation.** Firebase authenticates; **MongoDB authorizes**. Roles live in
your database, so migrating off Firebase later touches only the identity layer.

---

### D7 — Frontend: **React + Vite + Tailwind + TanStack Query**

**Why.** Vite for instant HMR and small builds. Tailwind for a consistent design
system without writing a CSS architecture — and it makes the "clean, trustworthy,
government-appropriate" brief easy to hit. TanStack Query removes most of the
reason people install Redux.

**Alternatives.** Next.js (SSR would help SEO for the department directory, but
adds a rendering model to learn and complicates the separate-backend design your
brief specifies). Redux Toolkit (ceremony for this size). CRA (deprecated).

---

### D8 — Media: **Cloudinary, authenticated uploads**

**Why.** Free tier, automatic optimisation and transformation (important — a
12 MP phone photo needs resizing), signed private delivery, simple Node SDK.
Render's filesystem is ephemeral, so local storage is not an option at all.

**Alternatives.** S3 (more control, more setup, and your brief says avoid AWS
unless justified). Firebase Storage (already in the Firebase project — a
reasonable second choice; Cloudinary wins on image transformation).

---

### D9 — Deployment: **Vercel (client) + Render (API) + Atlas (data)**

**Why.** All free-tier, all git-push-to-deploy, no Docker, no Kubernetes, no
Terraform — exactly as your brief instructs. Vercel's CDN suits a static SPA;
Render runs a persistent Node process, which an SSE streaming endpoint needs.

**Known cost.** Render's free tier sleeps after 15 minutes of inactivity and
takes ~50 seconds to wake. For a demo that is a real problem — see risk R7 and
its mitigation.

---

### D10 — No reranker at v1

**Why.** A cross-encoder adds a dependency and 200–500 ms to solve a precision
problem you have not yet demonstrated exists. At ~500 chunks with metadata
filtering, retrieval is likely already precise.

**Mitigation.** A no-op `Reranker` interface sits in the pipeline, so adding one
is an implementation, not a refactor.

**Would change my mind:** Phase 5 showing good Recall@8 but poor Precision@3.

---

### D11 — Structured JSON answers, not markdown prose

**Why.** Three payoffs. It matches your mockup's sectioned answer card exactly.
It makes the post-generation validator possible — you cannot reliably regex a
phone number out of free prose and know which field it belonged to. And it makes
`suggestedActions` a real, typed handoff into the complaint flow instead of the
model writing a link.

**Cost.** Slightly less natural-sounding answers, and JSON-mode occasionally
needs a retry. Both are worth it in a system where being wrong is the failure
mode that matters.

---

### D12 — Facts from the database, not from RAG

**Why.** The one decision that makes "never invent a phone number" enforceable.
Contacts, zones, office hours, helplines and rates are looked up deterministically
and injected; the output is then validated against that injected set. See
`03-rag.md`.

**Cost.** A little more plumbing than pure RAG, and the contacts table must be
maintained. `KB.pdf` §6 already tells you to maintain it separately, so this is
the architecture agreeing with your own source document.

---

### D13 — Use LangChain for the RAG plumbing (revised 30 Aug 2026)

**Decision.** LangChain.js is used for document loading, text splitting, the
embedding client, the Atlas vector store binding, prompt templates and
structured output parsing. It is **not** used for the parts that carry this
project's actual thesis.

**Why the change.** The original position was "no framework" — the pipeline is
mostly custom, the corpus is small, and the brief's §75 requires that the
developer can explain every component. That reasoning still holds on its own
terms, but it missed the decisive input: **Vyankatesh learned RAG through
LangChain.** Its abstractions are not a black box to him, they are his existing
mental model. Forcing a from-scratch implementation would mean learning a second
way to think about the same pipeline, mid-internship, while also learning
Express, Mongo, embeddings and evaluation. Familiarity is a real engineering
factor for a solo project on a deadline, and it outweighs the cost here.

**Scope — what LangChain does:**

| Concern                             | LangChain piece                                 |
| ----------------------------------- | ----------------------------------------------- |
| Loading DOCX / CSV / PDF / XLSX     | `@langchain/community` document loaders         |
| Splitting narrative sections        | `RecursiveCharacterTextSplitter`                |
| Embeddings                          | `GoogleGenerativeAIEmbeddings`                  |
| Vector store + retriever            | `MongoDBAtlasVectorSearch`                      |
| Prompt templates, structured output | `ChatPromptTemplate`, structured output parsers |
| Chat model                          | `ChatGoogleGenerativeAI`                        |

**Scope — what stays hand-written, and why.** These are the parts that make the
system safe, and none of them is LangChain-shaped:

- **Deterministic fact lookup and injection** (D12). Contacts, zones, office
  hours and rates come from typed collections, not from a retriever.
- **The post-generation output validator.** Phone numbers, URLs and citations
  are checked against the injected fact set. This is the mechanism behind
  "never invent a phone number" and it has no framework equivalent.
- **`coverageTier` gating.** Tier B departments get a contact-only answer
  template; Tier C is excluded entirely.
- **`isNonIMC` / `isOutOfScope` early exits** and the `externalAuthorities`
  routing table.
- **The Q/A-pair chunker.** The corpus is natively atomic; a generic splitter
  would cut a question away from its answer.

**Architecture is unchanged.** LangChain lives _inside_ `src/rag/` and
`src/ai/llm/`, behind the same interfaces. Nothing in `services/` or
`controllers/` imports it. The ESLint `no-restricted-imports` boundary is
extended to cover LangChain packages the same way it covers vendor SDKs, so the
framework stays swappable and the layering holds.

**The obligation this creates.** At every step I explain what LangChain is doing
underneath — what the splitter actually produced, what the retriever actually
queried, what the prompt actually became. §74 of the brief asks him to explain
chunking, embeddings and retrieval to an interviewer, and _"LangChain did it"_
is not an answer. Using the framework is fine; not knowing what it does is not.

**LangGraph: still not for v1.** LangGraph is for cyclic, stateful, agentic
flows — loops, branching, retries, human-in-the-loop. This pipeline is linear
with two early exits, which is an `if` statement, not a graph. It earns its
place the moment the assistant starts deciding for itself which tools to call or
looping to clarify. Revisit then.

**Would change my mind again:** LangChain.js introducing a breaking change that
costs more time than it saves, or its Atlas/Gemini integrations lagging behind
the underlying services.

## D14 — .numbers source files are converted to CSV once, outside the Node ingestion pipeline

**Context.** `IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated.numbers` (the 66-row
enriched FAQ dataset, 24 columns) is Apple Numbers' proprietary bundle format.
There is no maintained Node.js parser for it — the only real option
(`numbers-parser`) is Python-only.

**Decision.** Convert both `.numbers` files to CSV once, by hand (Python,
`numbers-parser`), and check the resulting CSVs into `server/data/raw/`
alongside the originals-in-spirit. `src/ingestion/loaders/` only ever has to
know csv/docx/pdf. This is the same judgement call a working engineer makes
constantly: don't write and maintain a bespoke parser for a proprietary
spreadsheet format inside a production pipeline when "export to CSV" is a
30-second, one-time step.

**What this bought for free.** The two `.numbers` files were byte-identical
except for filename (data-quality-register.md #2 — `dcd9cf1490891034087592b88f2cc443`).
Converting both independently and letting the pipeline's own classifier
(`src/ingestion/classifier.js`) content-hash and collapse them is a better
test of the dedup logic than hand-picking one file and pretending the
duplicate never existed — the duplicate is real, checked-in, and the
ingestion report (`data/processed/ingestion-report.json`) shows it being
caught, not swept away.

**Would change my mind:** a real Node `.numbers` reader appearing and being
worth the dependency, or Apple changing the format such that the CSV export
loses information the JSON columns need.
