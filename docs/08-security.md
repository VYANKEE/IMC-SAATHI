# PART 12 — Security Architecture

## Authentication

**Firebase Authentication** for citizens. Recommended methods:

| Method               | Recommendation        | Reasoning                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phone / OTP**      | **Primary**           | Nearly every Indian citizen has a mobile number; many have no email. Your own documents make the phone number central — `complaint_procedure.docx` says complaints generally cannot be anonymous because a reachable number is needed for field verification. Phone auth aligns the identity with the thing the process actually requires. Cost: SMS is billed per message, so quota-cap it and monitor. |
| **Google Sign-In**   | Secondary             | Free, one tap, good for desktop users.                                                                                                                                                                                                                                                                                                                                                                   |
| **Email / password** | **Skip for citizens** | You would own password reset, verification email and credential-stuffing defence for a population that mostly won't use it. Keep it available for staff/admin only, where the population is small and provisioned.                                                                                                                                                                                       |
| **Anonymous auth**   | No                    | The assistant is usable without any login; complaints need an identity.                                                                                                                                                                                                                                                                                                                                  |

**Token verification.** Every protected request carries
`Authorization: Bearer <Firebase ID token>`; the backend calls
`firebase-admin.auth().verifyIdToken()`. The Firebase **service account key never
leaves the server** — it lives in an env var, never in the repo, never in the
client bundle.

**Role is read from MongoDB on every request**, not from a Firebase custom claim.
Claims only refresh when the client's token rotates (up to an hour), so a
deactivated staff account would keep working. Mirror the role into a claim if you
want fast optimistic UI, but the authorization decision reads the database.

## Authorization

Three layers, each independently sufficient for its own scope:

1. **Route middleware** — `requireAuth`, `requireRole('admin')`.
2. **Service layer** — ownership and scope checks
   (`complaint.userId === req.user.id`, `complaint.departmentId ===
req.user.departmentId`).
3. **Repository layer** — citizen-scoped queries embed `userId` **in the filter
   itself**, so a forgotten check in a controller still cannot return another
   citizen's row.

Layer 3 is what makes the invariant real. Write the integration test that asserts
citizen B receives **404** (not 403) for citizen A's complaint, and treat it as a
release gate.

## Input validation

Zod schemas on every endpoint — body, params and query. Types are inferred from
the schemas so the validator and the TypeScript type cannot drift apart.
Reject unknown keys (`.strict()`) so a client cannot smuggle `role` or
`departmentId` into a profile update.

## File upload

```
Multer memory storage (never disk — Render's filesystem is ephemeral)
  → ≤5 files, ≤5 MB each
  → MIME allow-list: image/jpeg, image/png, image/webp
  → MAGIC-BYTE check (file-type) — a .exe renamed to .jpg passes a MIME check
  → strip EXIF (removes GPS from the photo; the app captures location explicitly
    and with consent — a hidden GPS tag in an uploaded image is not consent)
  → Cloudinary upload, type: "authenticated", folder complaints/<referenceId>
  → store publicId, never a public URL
Serving: authorize the viewer → mint a short-lived signed URL → 302
```

Storing a public URL would mean anyone with the link can see a citizen's photo
forever, including after the complaint is closed. Your brief's §20 is explicit:
_"Do NOT expose private media publicly unless required."_

## Transport & headers

`helmet()` with a real CSP · HTTPS enforced (Vercel and Render both terminate
TLS) · HSTS · `X-Content-Type-Options: nosniff` · no `X-Powered-By`.

## CORS

A strict allow-list from `ALLOWED_ORIGINS`, credentials enabled. Never `origin:
"*"` with credentials — it is both a security hole and silently broken.

## Rate limiting

| Scope                  | Limit                 | Why                        |
| ---------------------- | --------------------- | -------------------------- |
| `/api/chat`            | 20/min per user or IP | each call costs LLM tokens |
| `/api/complaints` POST | 5/hour per user       | spam prevention            |
| `/api/auth/*`          | 10 / 15 min per IP    | brute force                |
| Global                 | 100/min per IP        | baseline                   |

## Secrets

`.env` git-ignored from the first commit · `.env.example` with keys and no
values, committed · secrets set in the Render/Vercel dashboards · **only
`VITE_`-prefixed variables reach the browser bundle**, so nothing sensitive may
ever carry that prefix. Firebase _client_ config is public by design (it is not a
secret); the Firebase _admin_ service account is the one that must never leak.

If a key is ever committed, rotating it is the fix — deleting the commit is not,
because the value is already in the reflog and in anyone's clone.

## Database

Atlas IP allow-list (Render's egress) · a dedicated app user with least
privilege, not the Atlas admin · connection string in an env var only · no
`$where`, no unsanitised `$regex` from user input · Mongoose schemas with
`strict: true` to blunt operator-injection.

## LLM-specific

Retrieved context delimited and declared as data, not instructions · JSON-mode
output constrains what an injected instruction can achieve · the post-generation
fact validator catches injected phone numbers regardless of origin · a per-user
token budget so one abusive session cannot burn the quota · **API keys are
server-side only** — the browser never talks to Gemini.

## Audit logging

Every privileged mutation writes an `auditLog`: role change, complaint status
change, assignment, knowledge document publish or quarantine, user deactivation.
Records actor, role, before/after, IP, requestId.

## Privacy

Citizens see only their own complaints. Staff see only their department. Complaint
images are access-controlled and expiring. **PII is never written to logs** — log
`userId`, never phone or address. Chat messages carry a 90-day TTL; anonymous
sessions 7 days. Collect only what the grievance process needs — which is
precisely what `IMC_Saath_sanitation1.docx` promises citizens the bot will do,
"stated upfront, not buried."

## Error handling

One error middleware, one envelope, coded messages. `NODE_ENV=production` never
returns a stack trace, a Mongo error string, or an internal ID. Unhandled
rejections are logged with a request ID and return a generic 500.

## Explicitly out of scope for v1

CAPTCHA, WAF, penetration testing, SOC2, encryption at rest beyond Atlas's
default, MFA for staff. Named here so "we didn't do it" is a decision rather
than an oversight — and so you can say so in a review.
