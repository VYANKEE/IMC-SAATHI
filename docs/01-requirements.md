# PART 4–5 — Requirements & User Roles

## PART 4 — Functional requirements

IDs are stable and referenced by the roadmap and the test plan. **MoSCoW**:
M = must have for v1, S = should have, C = could have, W = won't have in v1.

### FR-A — Knowledge & ingestion

| ID    | Requirement                                                                                                                                         | Pri |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-A1 | Ingest DOCX, CSV, PDF, XLSX/Numbers-exported and plain text into a normalised knowledge record                                                      | M   |
| FR-A2 | Ingestion is **idempotent** — re-running over unchanged documents produces no duplicate chunks (content hashing)                                    | M   |
| FR-A3 | Every chunk carries `department, category, intent, documentName, documentType, sourceUrl, page/section, language, lastVerified, authority, version` | M   |
| FR-A4 | Structured facts (contacts, zones, wards, helplines, rate notices) are loaded into **typed collections**, not embedded as vectors                   | M   |
| FR-A5 | Ingestion runs as a standalone script, independent of the web runtime                                                                               | M   |
| FR-A6 | Ingestion emits a validation report (rules in `data-quality-register.md`) and refuses to publish a chunk that fails an S1 rule                      | M   |
| FR-A7 | Admin can add / replace / retire a knowledge document and trigger re-ingestion from the dashboard                                                   | S   |
| FR-A8 | Document versioning with `effectiveFrom` / `supersededBy`                                                                                           | S   |

### FR-B — Retrieval & assistant

| ID     | Requirement                                                                                                                                                                                                                                       | Pri                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| FR-B1  | Citizen selects a language (English / हिंदी) before or during chat; the whole UI follows it                                                                                                                                                       | M                                       |
| FR-B2  | Citizen may select a department, or leave it unset for automatic detection                                                                                                                                                                        | M                                       |
| FR-B3  | Semantic retrieval over the knowledge base with **metadata filtering** by department when one is selected                                                                                                                                         | M                                       |
| FR-B4  | Hindi and Hinglish queries retrieve English source chunks correctly (shared multilingual embedding space)                                                                                                                                         | M                                       |
| FR-B5  | Automatic department classification returns department + confidence + alternatives; low confidence triggers a clarifying question rather than a guess                                                                                             | M                                       |
| FR-B6  | Answers are generated **only** from retrieved context; the model is instructed and structurally constrained to refuse otherwise                                                                                                                   | M                                       |
| FR-B7  | Below the retrieval confidence threshold, respond with the documented fallback and offer helpline / ward office contact                                                                                                                           | M                                       |
| FR-B8  | Every answer returns machine-readable `sources[]` (document, section/page, url) that the UI renders                                                                                                                                               | M                                       |
| FR-B9  | Answers are returned as **structured JSON** — `answer, procedureSteps[], requiredDocuments[], department, contact, officeTiming, fees, sources[], suggestedActions[], confidence` — and rendered as sections (per your mockup), not free markdown | M                                       |
| FR-B10 | **Post-generation validator**: any phone number, URL or officer name in the output must exist in the structured contacts data, else it is stripped and the answer is regenerated or degraded                                                      | M                                       |
| FR-B11 | Out-of-scope queries (cricket scores, general chat) are declined with an on-brand message                                                                                                                                                         | M                                       |
| FR-B12 | Non-IMC issues (ration card, power cut, police/fire emergency) are routed out with the correct authority and number                                                                                                                               | M                                       |
| FR-B13 | Follow-up questions work within a session (conversational context)                                                                                                                                                                                | M                                       |
| FR-B14 | Multi-turn slot filling: bot asks for ward/zone, location, photo when the category requires them                                                                                                                                                  | S                                       |
| FR-B15 | Streaming responses                                                                                                                                                                                                                               | S                                       |
| FR-B16 | Voice input (mic icon appears in your mockup)                                                                                                                                                                                                     | C                                       |
| FR-B17 | Image-based issue classification                                                                                                                                                                                                                  | W (v2 — architecture must not block it) |

### FR-C — Complaints

| ID     | Requirement                                                                                                                              | Pri |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-C1  | Authenticated citizen creates a complaint: department, category, title, description, location text, optional geo-coordinates, 0–5 photos | M   |
| FR-C2  | Every complaint gets a **non-sequential public reference ID** (`IMC-2026-XXXXXXX`)                                                       | M   |
| FR-C3  | Status lifecycle with **server-enforced legal transitions** — an invalid transition is rejected, not just hidden in the UI               | M   |
| FR-C4  | Every status change, assignment and remark is written to an append-only event log with actor, timestamp and reason                       | M   |
| FR-C5  | Citizen views only their own complaints, and can track by reference ID                                                                   | M   |
| FR-C6  | Department staff see only complaints for their own department                                                                            | M   |
| FR-C7  | Staff update status and add remarks; admin assigns and reassigns                                                                         | M   |
| FR-C8  | Chat → complaint handoff pre-fills department, category and a draft description; **never auto-submits**                                  | M   |
| FR-C9  | Citizen can mark a resolved complaint "not satisfied", which reopens it (documented in `complaint_procedure.docx`)                       | S   |
| FR-C10 | Escalation surfaced automatically once a complaint exceeds its SLA                                                                       | S   |
| FR-C11 | Duplicate detection — nearby open complaints in the same category                                                                        | C   |
| FR-C12 | SMS / email notifications on status change                                                                                               | C   |

### FR-D — Accounts & access

| ID    | Requirement                                                                                                     | Pri |
| ----- | --------------------------------------------------------------------------------------------------------------- | --- |
| FR-D1 | Citizen registration and login via Firebase (phone OTP primary, Google secondary)                               | M   |
| FR-D2 | Backend verifies the Firebase ID token on **every** protected request                                           | M   |
| FR-D3 | Roles: `citizen`, `staff`, `admin`; staff/admin accounts are **provisioned by an admin**, never self-registered | M   |
| FR-D4 | Authorization enforced in backend middleware; frontend route guards are UX only                                 | M   |
| FR-D5 | Assistant is usable **without login**; login is required only to file or track a complaint                      | M   |
| FR-D6 | Profile: name, phone, preferred language, ward/zone                                                             | S   |

### FR-E — Dashboards & admin

| ID    | Requirement                                                                              | Pri |
| ----- | ---------------------------------------------------------------------------------------- | --- |
| FR-E1 | Citizen dashboard: my complaints, statuses, history                                      | M   |
| FR-E2 | Staff dashboard: department queue, complaint detail with images, status update, remarks  | M   |
| FR-E3 | Admin dashboard: totals by status / department / category, recent complaints, assignment | M   |
| FR-E4 | Admin manages departments, categories and knowledge documents                            | S   |
| FR-E5 | Admin views audit logs                                                                   | S   |
| FR-E6 | Admin sees the **data quality / unverified facts** queue from ingestion                  | S   |

### FR-F — Evaluation

| ID    | Requirement                                                                                                                                                                           | Pri |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| FR-F1 | A committed golden evaluation set built from the real documents, covering English, Hindi, Hinglish, ambiguous, out-of-scope, missing-information, multi-hop and adversarial questions | M   |
| FR-F2 | Repeatable eval script reporting Recall@k, Precision@k, groundedness, citation correctness and refusal accuracy                                                                       | M   |
| FR-F3 | Eval runs before every knowledge-base change is published                                                                                                                             | S   |

---

## PART 5 — Non-functional requirements

| Area                | Requirement                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accuracy**        | Groundedness ≥ 95% on the golden set; **zero** fabricated phone numbers or URLs (hard gate, enforced by FR-B10)                                                                                                                                          |
| **Latency**         | Non-streaming chat p95 < 6 s; first token < 2 s when streaming; complaint create < 1.5 s; retrieval alone < 400 ms                                                                                                                                       |
| **Availability**    | Best-effort on free hosting tiers. Cold starts are a known constraint — see R7                                                                                                                                                                           |
| **Scalability**     | Corpus ~400–600 chunks today; design must hold to ~50k without re-architecture (Atlas Vector Search covers this comfortably)                                                                                                                             |
| **Security**        | Firebase token verification server-side; Helmet; strict CORS allow-list; rate limits (chat 20/min/user, complaints 5/hour/user, auth 10/15min/IP); Zod validation on every input; MIME + magic-byte + size validation on uploads; no secrets client-side |
| **Privacy**         | Citizens see only their own complaints. Staff see only their department. Complaint photos are **not public** — signed, expiring URLs. PII is never written to logs                                                                                       |
| **Maintainability** | Layered backend (routes → controllers → services → repositories); AI/RAG code isolated behind interfaces; prompts versioned as files                                                                                                                     |
| **Accessibility**   | Keyboard navigable, labelled controls, WCAG AA contrast, 44px touch targets, Devanagari-capable font stack (Noto Sans Devanagari)                                                                                                                        |
| **Responsiveness**  | Mobile-first. The complaint flow especially — citizens photograph the problem on the spot                                                                                                                                                                |
| **Observability**   | Structured JSON logs with request ID; per-request record of retrieved chunk IDs, scores, model, token count and latency — this is what makes bad answers debuggable                                                                                      |
| **i18n**            | Full interface localisation, not button translation. Locale files, not inline strings                                                                                                                                                                    |
| **Error handling**  | Uniform `{success, message, code}` envelope. Never leak stack traces or internal identifiers to citizens                                                                                                                                                 |

---

## User roles & permission matrix

**Citizen** — register/login, use the assistant (also anonymously), select
language and department, create complaints, upload photos, view/track **own**
complaints, reopen an unsatisfactory resolution.

**Department Staff** — login, view complaints **assigned to their own
department**, view evidence images, update status within the legal lifecycle,
add remarks. Cannot see other departments, cannot delete, cannot touch the
knowledge base.

**Admin** — manage users and role assignment, departments, categories and
statuses; manage knowledge documents and trigger ingestion; view and assign all
complaints; view analytics and audit logs.

| Action                          | Citizen |     Staff     | Admin |
| ------------------------------- | :-----: | :-----------: | :---: |
| Ask the assistant               |   ✅    |      ✅       |  ✅   |
| Create complaint                |   ✅    |       —       |  ✅   |
| Read own complaint              |   ✅    |       —       |  ✅   |
| Read **any** complaint          |   ❌    | own dept only |  ✅   |
| Update complaint status         |   ❌    | own dept only |  ✅   |
| Assign complaint                |   ❌    |      ❌       |  ✅   |
| Manage departments / categories |   ❌    |      ❌       |  ✅   |
| Manage knowledge base           |   ❌    |      ❌       |  ✅   |
| Trigger ingestion               |   ❌    |      ❌       |  ✅   |
| View audit logs                 |   ❌    |      ❌       |  ✅   |
| Manage users & roles            |   ❌    |      ❌       |  ✅   |

**The rule that must never be violated:** a citizen must never be able to read
another citizen's complaint. This is enforced at the **repository layer** — every
citizen-scoped query carries `userId` in the filter itself, so a missing check in
a controller cannot leak data. Add an integration test that asserts citizen B
gets 404 (not 403 — don't confirm existence) on citizen A's complaint.
