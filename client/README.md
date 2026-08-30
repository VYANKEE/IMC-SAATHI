# client/

React + Vite frontend for IMC Saathi.

**Phase 1 (now):** a connection check — proves the React build, the API call and
CORS all work. Not the real interface.

**Phase 9:** the real UI — Tailwind design system, i18n (English / हिंदी), the
chat interface with `AnswerCard` and source citations, complaint forms, and the
citizen / staff / admin dashboards. See `docs/06-frontend.md`.

## Run

```bash
npm run dev:client        # from the repo root
```

Runs on http://localhost:5173 and calls the API at `VITE_API_BASE_URL`
(default `http://localhost:5000/api`).

> Only `VITE_`-prefixed environment variables reach the browser bundle.
> Never put a secret behind that prefix — see `docs/08-security.md`.
