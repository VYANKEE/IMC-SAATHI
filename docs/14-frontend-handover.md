# Frontend Handover — Backend API Guide (Phase 9 starting point)

**Backend owner:** Vyankatesh Kulkarni. **Status:** Phases 0–7 complete and
tested (119/119 tests passing). **Phase 8 (authentication) is explicitly not
built** — every route below is open, unauthenticated. Don't add auth headers
or expect 401s; if you need auth, talk to Vyankatesh first, it's a separate
phase with its own design.

## 1. Getting the backend running locally

```bash
git pull                                  # get latest main
npm install                               # installs both workspaces (root)
cp server/.env.example server/.env        # then fill in real values — see below
cp client/.env.example client/.env        # VITE_API_BASE_URL=http://localhost:5000/api is enough to start
npm run dev --workspace server            # starts the API on :5000
```

`server/.env` needs two real secrets to actually answer questions:
`MONGODB_URI` and `NVIDIA_API_KEY`. **Do not** expect these in git —
`.env.example` only documents variable names. Ask Vyankatesh for the real
values (shared via password manager / direct message, never over
git/Slack/email in plain text) so you're pointed at the same Atlas
database and NVIDIA account the backend was built and tested against. The
knowledge base is already ingested + embedded + seeded in that database —
you do **not** need to run `npm run ingest`/`embed`/`seed` yourself unless
you're deliberately setting up a fresh, empty database.

Without those two values the server still boots (they're optional in the
env schema so `npm run lint`/`npm test` work with no credentials), but
`/api/chat` will fail at the point of use.

## 2. See it working before you build your own UI

`http://localhost:5000/` serves a minimal reference implementation
(`server/public/demo.html` + `demo.js`) — no build step, plain DOM — showing
the intended flow: pick a department → real suggested-question chips →
free-form chat always available. Run it once locally to see the actual
request/response shapes live, not just read about them.

## 3. The API contract

The authoritative, currently-accurate contract is the big comment block at
the top of `server/public/demo.js` — it documents `GET /api/departments`,
`GET /api/departments/:slug/suggested-questions`, and `POST /api/chat`
(including all four response `route` values: `grounded`, `out_of_scope`,
`non_imc`, `non_imc_unresolved`) with exact response shapes.

`docs/05-api.md` describes the _original planned_ contract from early
design and has drifted in a few places since — prefer `demo.js`'s comment
when the two disagree. `docs/11-decisions.md` has the full history/reasoning
if you want the "why" behind anything.

Every response is wrapped: `{ success, data? }` on the happy path,
`{ success: false, code, message, requestId }` on errors — `message` is
always safe to show a user as-is.

## 4. Questions

Ping Vyankatesh for: real `.env` values, anything the API contract doesn't
answer, or before touching Phase 8 auth.
