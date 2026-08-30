# PART 9 — API Contract

All responses use one envelope:

```jsonc
// success
{ "success": true, "data": { ... } }
// error — never a stack trace, never an internal id
{ "success": false, "message": "Unable to process your request", "code": "CHAT_SERVICE_ERROR" }
```

Auth column: **—** none · **opt** token used if present · **✓** required ·
**staff/admin** role-gated.

## Health & meta

| Method | Endpoint      | Auth | Notes                               |
| ------ | ------------- | ---- | ----------------------------------- |
| GET    | `/api/health` | —    | liveness + db + vector-index status |

## Auth & profile

| Method | Endpoint            | Auth | Notes                                                     |
| ------ | ------------------- | ---- | --------------------------------------------------------- |
| POST   | `/api/auth/session` | ✓    | verify Firebase token, upsert user, return profile + role |
| GET    | `/api/auth/me`      | ✓    | current profile                                           |
| PATCH  | `/api/auth/me`      | ✓    | name, preferredLanguage, wardNumber                       |

Firebase does the credential work; the backend never sees a password. `POST
/api/auth/session` exists so a first-time login creates the Mongo user document
and returns the authoritative role in one round trip.

## Taxonomy (public, drives the UI — no hard-coded department names in React)

| Method | Endpoint                          | Auth | Notes                                     |
| ------ | --------------------------------- | ---- | ----------------------------------------- |
| GET    | `/api/departments?lang=hi`        | —    | Tier A + B only; Tier C excluded          |
| GET    | `/api/departments/:id`            | —    | detail + responsibilities + office timing |
| GET    | `/api/departments/:id/categories` | —    | complaint categories                      |
| GET    | `/api/categories`                 | —    | flat list, filterable                     |
| GET    | `/api/zones`                      | —    | 22 zones                                  |
| GET    | `/api/zones/by-ward/:wardNumber`  | —    | ward → zone + contacts                    |
| GET    | `/api/helplines`                  | —    | helpline list                             |

## Chat

| Method | Endpoint                 | Auth | Notes                         |
| ------ | ------------------------ | ---- | ----------------------------- |
| POST   | `/api/chat`              | opt  | main endpoint                 |
| POST   | `/api/chat/stream`       | opt  | SSE variant (Phase 8+)        |
| GET    | `/api/chat/sessions`     | ✓    | my sessions                   |
| GET    | `/api/chat/sessions/:id` | ✓    | transcript, ownership-checked |
| DELETE | `/api/chat/sessions/:id` | ✓    | clear chat                    |

**`POST /api/chat`**

```jsonc
// request
{ "sessionId": "opt", "message": "Mere area mein street light kharab hai",
  "language": "hi", "departmentId": "opt" }

// 200
{ "success": true, "data": {
  "sessionId": "...", "messageId": "...",
  "answer": { /* the structured schema from 03-rag.md */ },
  "meta": { "confidence": "high", "departmentDetected": "ELECTRICAL",
            "classificationConfidence": 0.91, "latencyMs": 2840,
            "fallbackUsed": false } } }
```

Validation: `message` 1–1000 chars · `language` ∈ {en,hi} · `departmentId` must
exist. Rate limit 20/min. Errors: `400 VALIDATION_ERROR`, `429 RATE_LIMITED`,
`503 AI_PROVIDER_UNAVAILABLE`, `500 CHAT_SERVICE_ERROR`.

## Complaints

| Method | Endpoint                               | Auth | Notes                                                        |
| ------ | -------------------------------------- | ---- | ------------------------------------------------------------ |
| POST   | `/api/complaints`                      | ✓    | multipart; ≤5 images, ≤5 MB each                             |
| GET    | `/api/complaints/mine`                 | ✓    | paginated, own only                                          |
| GET    | `/api/complaints/:referenceId`         | ✓    | owner, dept staff, or admin                                  |
| GET    | `/api/complaints/track/:referenceId`   | —    | **status only** — no description, no images, no citizen name |
| GET    | `/api/complaints/:id/events`           | ✓    | timeline                                                     |
| POST   | `/api/complaints/:id/reopen`           | ✓    | owner only, RESOLVED/CLOSED → REOPENED                       |
| GET    | `/api/complaints/:id/images/:publicId` | ✓    | 302 → short-lived signed URL                                 |

`/track/:referenceId` is deliberately public but deliberately thin — your
documents say citizens track by reference number, and requiring login to check a
status would push people back to the phone. Returning only
`{status, departmentName, createdAt, lastUpdatedAt}` means a leaked or guessed
reference ID exposes nothing personal. This is also the second reason reference
IDs must not be sequential.

**`POST /api/complaints`** (multipart)

```
departmentId, categoryId, title (5-120), description (20-2000),
locationText (5-300), wardNumber?, lat?, lng?, chatSessionId?, images[]
→ 201 { referenceId, status: "SUBMITTED", slaDueAt }
```

## Staff

| Method | Endpoint                            | Auth  | Notes                                                                                              |
| ------ | ----------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| GET    | `/api/staff/complaints`             | staff | own department only — enforced server-side, `departmentId` is **never** read from the query string |
| GET    | `/api/staff/complaints/:id`         | staff | 404 if other department                                                                            |
| PATCH  | `/api/staff/complaints/:id/status`  | staff | `{ toStatus, remark }`, transition validated                                                       |
| POST   | `/api/staff/complaints/:id/remarks` | staff |                                                                                                    |

## Admin

| Method         | Endpoint                                               | Auth  | Notes                                |
| -------------- | ------------------------------------------------------ | ----- | ------------------------------------ |
| GET            | `/api/admin/complaints`                                | admin | all, filterable                      |
| PATCH          | `/api/admin/complaints/:id/assign`                     | admin |                                      |
| GET            | `/api/admin/analytics/summary`                         | admin | totals by status/department/category |
| GET/POST/PATCH | `/api/admin/departments`                               | admin |                                      |
| GET/POST/PATCH | `/api/admin/categories`                                | admin |                                      |
| GET            | `/api/admin/users` · PATCH `/api/admin/users/:id/role` | admin | audited                              |
| GET/POST       | `/api/admin/knowledge/documents`                       | admin | upload + list                        |
| POST           | `/api/admin/knowledge/documents/:id/ingest`            | admin | queue re-ingestion                   |
| PATCH          | `/api/admin/knowledge/documents/:id/status`            | admin | active / quarantined / superseded    |
| GET            | `/api/admin/knowledge/quality-report`                  | admin | unverified facts queue               |
| GET            | `/api/admin/audit-logs`                                | admin |                                      |

---

## Contract rules

1. **Scope is derived from the token, never from the request.** A staff endpoint
   reads `req.user.departmentId`. If `departmentId` arrives in a query string on
   a staff route, it is ignored. This is the single most common broken-access
   -control bug in dashboards like this.
2. **404, not 403, for cross-tenant reads.** Telling citizen B that complaint
   `IMC-2026-XXXX` exists but isn't theirs is an information leak.
3. **Validation at the edge with Zod**, one schema per endpoint, colocated with
   the route, inferred into TypeScript types.
4. **Idempotency on complaint creation** — accept an `Idempotency-Key` header so
   a double-tap on a flaky mobile connection doesn't file twice.
5. **Pagination everywhere** — `?page&limit` (limit ≤ 50), returning
   `{items, page, limit, total}`.
6. **Errors are coded, not free text**, so the frontend localises the message
   rather than displaying an English string to a Hindi user.
