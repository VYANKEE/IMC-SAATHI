# PART 16 — Risk Register

Likelihood × Impact → **P1** address before launch · **P2** mitigate during
build · **P3** monitor.

---

## Product & data risks

### R1 — Complaints don't reach IMC's real system — **P1**

No official Indore 311 API exists in any document you provided. A complaint filed
here lands in your MongoDB. A citizen receiving `IMC-2026-K7M2QX4` may reasonably
believe IMC has been notified. They have not been.

_Mitigation:_ ask IMC for 311/CRM integration in week one. Failing that, label the
confirmation screen explicitly in both languages and deep-link to Indore 311. Do
not ship the filing flow without the label. **Raise this in your first review.**

### R2 — Stale municipal data served as current — **P1**

Property tax rates in `KB.pdf` are from the 2024-25 notice; FY 2026-27 is
current. Officers rotate; phone numbers change. `KB.pdf` warns about this itself.

_Mitigation:_ `rateNotices` with `effectiveFrom`/`effectiveTo` and a computed
`isCurrent`; never quote an expired figure. `lastVerified` on every chunk;
downweight anything over 12 months and surface it in the admin quality queue.
Contacts in a separately updateable table, per `KB.pdf` §6.

### R3 — Content describing other municipalities — **P1**

`Housing_and_Rental` cites Nagar Parishad **Makronia** and **Chhatarpur**
procedures. It reads as specific and authoritative and is neither, for Indore.

_Mitigation:_ quarantined until re-sourced from IMC's own pages. This is the
highest-risk content in the corpus precisely because it sounds right.

### R4 — Fabricated contacts and procedures — **P1**

The core failure mode of the entire product. A wrong number sends a citizen to
the wrong office; an invented procedure wastes their day.

_Mitigation:_ the D12 architecture — facts from the database, injected as
verified data, validated after generation, with a `groundingViolations` counter
per prompt version. This is designed in, not bolted on.

### R5 — Coverage gaps become hallucinations — **P1**

19 departments have contacts and no procedures. The UI mockup advertises Birth
Certificate and Trade License with no source content at all. Asked about them,
a model will confidently improvise.

_Mitigation:_ `coverageTier` on every department drives the answer template —
Tier B gets a contact-only response; Tier C is excluded from the selector and the
quick-action chips. Disable those two chips at v1.

### R6 — Misrouting to the wrong authority — **P1**

"Ghar ki light chali gayi" (Discom, 1912) versus "street light kharab hai"
(IMC Electrical) are near-identical utterances with different answers. Same for
ration card (NFSA, not IMC) and drainage-versus-PWD, which `KB.pdf` calls out
explicitly.

_Mitigation:_ `externalAuthorities` as a first-class routing table; a `isNonIMC`
branch in the classifier that exits before retrieval; these exact cases as a
named 8-question slice in the golden eval set.

---

## Technical risks

### R7 — Render cold starts kill the demo — **P2**

Free tier sleeps after 15 minutes; first request takes ~50 s. On a chat interface
that reads as broken.

_Mitigation:_ an external uptime pinger every 10 minutes during demo periods;
optimistic UI with an honest "waking up the server" state after 3 s; warm the
service before any live demonstration. If a paid Render instance is ever an
option, this is the first thing to spend on.

### R8 — Hindi/Hinglish retrieval underperforms — **P2**

Cross-lingual retrieval is an assumption until measured, and Hinglish is the
weakest case for any embedding model.

_Mitigation:_ Phase 5 measures it per language slice before anything depends on
it. The cheap win is already available: embed the bracketed Hinglish variants
sitting unused in your CSV questions as additional vectors. If Devanagari lags,
fall back to translating only the _query_.

### R9 — Atlas M0 limits — **P2**

512 MB storage, shared CPU, connection caps.

_Mitigation:_ 768-d embeddings (4× smaller than 3072), TTL on chat messages,
`publicId` references rather than images in the database. 500 chunks × 768 floats
is a few megabytes — M0 is comfortable. Monitor as the corpus grows.

### R10 — LLM cost or quota exhaustion — **P2**

Free-tier rate limits are per-minute and per-day; a demo or a loop can exhaust
them.

_Mitigation:_ rate limits (20/min), per-user token budgets, out-of-scope
detection **before** the expensive path, caching of identical queries, and
alerting on quota. Track cost per conversation from Phase 6 so the number exists
when someone asks.

### R11 — Prompt injection via uploaded documents — **P2**

Low today (you author every document) but real once FR-A7 lets admins upload.

_Mitigation:_ delimited context declared as data; JSON-mode output; the fact
validator catches an injected phone number regardless of how it arrived; admin
uploads are quarantined for review before publication.

### R12 — Broken access control — **P1**

The classic dashboard bug: `?departmentId=` in a query string trusted on a staff
route, or a missing ownership check on a complaint read.

_Mitigation:_ scope always from the token, never the request; citizen scoping
enforced at the repository layer; 404 not 403 on cross-tenant reads; integration
tests as release gates.

### R13 — PII in complaint photos — **P2**

Citizens photograph documents, house numbers, faces, and phone screens.

_Mitigation:_ authenticated Cloudinary storage with short-lived signed URLs; EXIF
stripped on upload; images never public; retention policy documented.

### R14 — Firebase phone-auth SMS cost — **P3**

SMS is billed per message and is abusable.

_Mitigation:_ Firebase App Check, per-IP rate limits on auth, quota alerts.
Google sign-in offered as the free path.

---

## Project risks

### R15 — Scope is very large for an internship — **P2**

Two products, a RAG pipeline, three roles, an eval framework and deployment.

_Mitigation:_ the milestone plan is ordered so that **Phase 7 is already a
demonstrable product** — a working grounded multilingual assistant. If time runs
short, ship phases 0–9 well rather than 0–14 badly. A working, honest,
well-evaluated assistant beats a half-finished platform, and it is a better
interview story.

### R16 — Learning goals lost to delivery pressure — **P3**

Your §75 golden rule is that you must be able to explain every component.

_Mitigation:_ every milestone ends with a written note of what is not yet
production-ready, and §74's question list is the acceptance test for Phase 14.
If you cannot answer one, that is the next thing to study — not the next feature
to build.
