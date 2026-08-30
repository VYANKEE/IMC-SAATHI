# PART 8 — Database Design (MongoDB Atlas)

## Collections — and an evaluation of the ones you proposed

Your brief listed 10 candidate collections and asked me to judge each. Verdict:

| Your candidate                  | Verdict                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`                         | **Keep.**                                                                                                                                                                                                                                                          |
| `departments`                   | **Keep** — and it becomes far more important than a name lookup; it carries the coverage tier that decides what the bot may say.                                                                                                                                   |
| `services`                      | **Keep**, but slimmer than you'd think — most "services" are complaint categories.                                                                                                                                                                                 |
| `complaintCategories`           | **Keep.** Drives both the selector and the classifier's label space.                                                                                                                                                                                               |
| `complaints`                    | **Keep.**                                                                                                                                                                                                                                                          |
| `complaintStatusHistory`        | **Replace** with `complaintEvents` — a broader append-only log covering status changes, assignments, remarks and reopens in one ordered stream. A status-only table forces you to invent a second table for remarks, and then the two can disagree about ordering. |
| `knowledgeDocuments`            | **Keep.**                                                                                                                                                                                                                                                          |
| `chatSessions` / `chatMessages` | **Keep**, with retention (see below).                                                                                                                                                                                                                              |
| `auditLogs`                     | **Keep.**                                                                                                                                                                                                                                                          |
| —                               | **Add `knowledgeChunks`** — you didn't list it, and it's where the vector index lives.                                                                                                                                                                             |
| —                               | **Add `contacts`** — `KB.pdf` §6 explicitly requires a separately updateable contact table, and the whole no-hallucinated-numbers guarantee depends on it.                                                                                                         |
| —                               | **Add `zones`** — 22 verified zones with the ward mapping. Enables "ward 47 → Zone 09 → this number", which is a multi-hop answer RAG alone cannot reliably produce.                                                                                               |
| —                               | **Add `externalAuthorities`** — Discom 1912, NFSA, police/fire/ambulance. Makes non-IMC routing a data lookup instead of prompt trivia.                                                                                                                            |
| —                               | **Add `rateNotices`** — date-bounded fee/rate tables, so a stale rupee figure can never be served (see data quality item 9).                                                                                                                                       |

Final count: **14 collections.**

---

## Schemas

### `users`

```js
{ _id, firebaseUid: String,      // unique, indexed
  role: "citizen"|"staff"|"admin", // SOURCE OF TRUTH for authorization
  name, phone, email,
  preferredLanguage: "en"|"hi",
  departmentId: ObjectId,        // staff only
  wardNumber: Number,            // optional, enables zone auto-fill
  isActive: Boolean, createdAt, updatedAt }
```

Indexes: `{firebaseUid:1}` unique · `{role:1, departmentId:1}` · `{phone:1}` sparse.

### `departments`

```js
{ _id, code: "ELECTRICAL",  slug: "electrical-mechanical",
  name: { en: "Electrical & Mechanical", hi: "विद्युत एवं यांत्रिकी" },
  description: { en, hi },
  responsibilities: [String],
  coverageTier: "A"|"B"|"C",     // ← drives what the assistant may say
  officeTiming: { days, from, to },
  isActive: Boolean, displayOrder: Number,
  sourceDocuments: [String] }
```

`coverageTier` is the mechanism that stops Tier-B departments (contact-only)
from getting invented procedures: the prompt builder reads it and switches to a
contact-only answer template. Tier C is excluded from the selector entirely.

### `zones`

```js
{ _id, zoneNumber: 1..22,
  name: { en: "Dr. Hedgewar (Kila Maidan) Zone", hi },
  wards: [7, 9, 10, 16],
  officePhone: "0731-2410120",
  zonalOfficer:      { name, mobile },
  csiHealth:         { mobile },
  asstRevenueOfficer:{ name, mobile },
  verified: Boolean, verificationNote: String }
```

Indexes: `{zoneNumber:1}` unique · **`{wards:1}`** — the multikey index that makes
ward→zone an O(1) lookup. Seeded from `Zonal_Offices…docx`; wards 1–85 complete.

### `contacts`

```js
{ _id, departmentId, scope: "department"|"zone"|"helpline",
  name, designation, mobile: String,   // normalised 10 digits
  altName, altDesignation, altMobile,
  officePhone, officeAddress,
  isPrimary: Boolean, verified: Boolean,
  sourceDocument: String, lastVerified: Date }
```

**Never embedded.** Joined at answer time. `verified:false` entries are visible
to admins but never injected into an answer.

### `externalAuthorities`

```js
{ _id, key: "DISCOM_POWER_CUT",
  name: { en: "MPPKVVCL / West Discom", hi },
  handles: ["power cut","live wire","electricity supply","meter"],
  phone: "1912", altPhone: "0731-2421414",
  note: { en, hi }, sourceDocument }
```

### `complaintCategories`

```js
{ _id, departmentId, code: "STREET_LIGHT_NOT_WORKING",
  name: { en, hi },
  requiredFields: ["location","photo","wardNumber"],
  slaHours: Number|null,          // null where the documents don't state one
  priority: "normal"|"high"|"critical",
  keywords: { en: [], hi: [], hinglish: [] },
  isActive: Boolean }
```

`slaHours` is `null` for almost everything — only street lights are documented
(24 h arterial, 48–72 h internal). Modelling the gap as `null` rather than
inventing a default keeps the honesty requirement intact.

### `complaints`

```js
{ _id,
  referenceId: "IMC-2026-K7M2QX4",   // unique, public, NON-SEQUENTIAL
  userId, departmentId, categoryId,
  title, description,
  location: { text, wardNumber, zoneNumber,
              geo: { type:"Point", coordinates:[lng,lat] } },
  images: [{ publicId, format, bytes, uploadedAt }],  // publicId, NOT a URL
  status: "SUBMITTED"|"ACKNOWLEDGED"|"ASSIGNED"|"IN_PROGRESS"
        |"RESOLVED"|"CLOSED"|"REOPENED"|"REJECTED",
  priority, assignedTo: ObjectId,
  source: "web"|"chat",  chatSessionId,
  slaDueAt: Date, resolvedAt, closedAt,
  citizenSatisfied: Boolean|null,
  createdAt, updatedAt }
```

Indexes:
`{referenceId:1}` unique ·
**`{userId:1, createdAt:-1}`** (citizen dashboard — the query that runs most) ·
**`{departmentId:1, status:1, createdAt:-1}`** (staff queue) ·
`{status:1, slaDueAt:1}` (SLA sweep) ·
`{assignedTo:1, status:1}` ·
`{location.geo:"2dsphere"}` (duplicate detection, v2).

Every index is here because a named query needs it, which is the "do not add
indexes blindly" test: dashboard, queue, SLA job, assignment, geo-dedupe.

### `complaintEvents` (replaces `complaintStatusHistory`)

```js
{ _id, complaintId,
  type: "CREATED"|"STATUS_CHANGED"|"ASSIGNED"|"REMARK_ADDED"
      |"IMAGE_ADDED"|"REOPENED"|"ESCALATED",
  fromStatus, toStatus,
  actorId, actorRole, remark, metadata, createdAt }
```

Append-only; never updated or deleted. One ordered stream = one timeline query
for the citizen and one audit trail for staff. Index `{complaintId:1, createdAt:1}`.

### `knowledgeDocuments`

```js
{ _id, title, fileName, documentType: "docx"|"csv"|"pdf"|"xlsx",
  departmentId, contentHash: String,   // idempotency
  sourceUrl, authority: "IMC"|"MP State"|"External",
  version: Number, effectiveFrom, supersededBy: ObjectId,
  status: "active"|"superseded"|"quarantined",
  uploadedBy, uploadedAt,
  ingestion: { status, chunkCount, warnings:[], errors:[], lastRunAt } }
```

`status: "quarantined"` is where the Housing/Makronia content and the 2024-25
rate table live until verified — present, tracked, not served.

### `knowledgeChunks` — the vector collection

```js
{ _id, documentId, chunkIndex,
  text: String,                 // with the "[Dept | Category | Intent]" header
  embedding: [Number],          // 768 floats
  variantOf: ObjectId|null,     // Hinglish variant vectors point at the parent
  meta: { departmentId, departmentCode, category, intent,
          documentName, documentType, sourceUrl, section, page,
          language: "en"|"hi"|"hinglish",   // DETECTED, not from the source column
          authority, lastVerified, stale: Boolean },
  status: "active"|"quarantined",
  tokenCount, createdAt }
```

Atlas Search index `knowledge_vector_index`:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 768, "similarity": "cosine" },
    { "type": "filter", "path": "meta.departmentId" },
    { "type": "filter", "path": "meta.language" },
    { "type": "filter", "path": "status" }
  ]
}
```

768 dimensions, not 3072: `gemini-embedding-001` supports Matryoshka truncation,
and at ~500 chunks the retrieval difference is negligible while the index is 4×
smaller — which matters on Atlas M0.

### `rateNotices`

```js
{ _id, title: "IMC 2024-25 Revised Rate List — Property Tax & SBM Fee",
  departmentId, effectiveFrom: ISODate("2024-04-01"), effectiveTo: ISODate("2025-03-31"),
  sourceUrl, rows: [{ category, zone, residential, nonResidential }],
  isCurrent: Boolean }
```

`isCurrent` is computed, not typed by hand. If nothing is current, the assistant
answers with the "check the latest notification" line — never a number.

### `chatSessions` / `chatMessages`

```js
chatSessions:  { _id, userId|null, anonymousId, language, departmentId,
                 title, messageCount, startedAt, lastMessageAt, expiresAt }
chatMessages:  { _id, sessionId, role:"user"|"assistant", content,
                 structured: {...},          // the JSON answer object
                 retrieval: { chunkIds:[], scores:[], topScore,
                              filterApplied, classifiedDepartmentId,
                              classificationConfidence },
                 model, promptVersion, tokensIn, tokensOut, latencyMs,
                 groundingViolations: [], createdAt }
```

**Should chat history be stored at all?** Yes, but narrowly. It is required for
follow-up questions (FR-B13), and the `retrieval` block is what makes a bad
answer debuggable — without it you cannot tell whether a wrong answer was a
retrieval failure or a generation failure, and you will waste days guessing.

Retention: **TTL index on `expiresAt`, 90 days.** Anonymous sessions: 7 days.
Do not store name, phone or address inside message content for analytics
purposes — your brief's §54 requires this and it's the right call. Beyond 12
turns, summarise older turns into a running session summary rather than growing
the context window forever.

### `auditLogs`

```js
{
  (_id,
    actorId,
    actorRole,
    action,
    resourceType,
    resourceId,
    before,
    after,
    ip,
    userAgent,
    requestId,
    createdAt);
}
```

Written for every privileged mutation: role change, status change, assignment,
document publish/quarantine, user deactivation. TTL 2 years.

---

## Relationships

```
users ──1:N──► complaints ──1:N──► complaintEvents
  │                 │
  │                 └──N:1──► departments ──1:N──► complaintCategories
  │                                │
  │                                ├──1:N──► contacts
  │                                └──1:N──► knowledgeDocuments ──1:N──► knowledgeChunks
  │
  └──1:N──► chatSessions ──1:N──► chatMessages

zones ──(wards[] multikey)──► resolves wardNumber → zone → contacts
externalAuthorities ──(standalone routing table)
rateNotices ──N:1──► departments
```

MongoDB references (not embedding) for `complaints → user/department/category`,
because staff queues filter by department and citizens filter by user — both
need independent indexes. Embedding is used only for `complaints.images` and
`complaints.location`, which are always read with their parent and never queried
alone.

---

## Query patterns the indexes are designed for

| Query                                          | Index used                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Citizen dashboard: my complaints, newest first | `{userId:1, createdAt:-1}`                                          |
| Staff queue: open complaints in my department  | `{departmentId:1, status:1, createdAt:-1}`                          |
| Track by reference ID                          | `{referenceId:1}` unique                                            |
| Complaint timeline                             | `{complaintId:1, createdAt:1}`                                      |
| SLA sweep job                                  | `{status:1, slaDueAt:1}`                                            |
| Ward → zone → contact                          | `zones.{wards:1}` multikey                                          |
| Semantic retrieval, department-filtered        | Atlas `knowledge_vector_index`                                      |
| Admin analytics by department/status           | `{departmentId:1, status:1, createdAt:-1}` (covers the aggregation) |
