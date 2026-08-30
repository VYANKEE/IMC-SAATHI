import { useEffect, useState } from 'react';
import { apiGet } from './api/client.js';

/**
 * Phase 1 connection check.
 *
 * This is NOT the real UI — that is Phase 9 (design system, i18n, chat,
 * complaint forms). Right now its only job is to prove three things work:
 * the React build, the API call, and CORS between two different origins.
 */
export default function App() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    apiGet('/health')
      .then((data) => setState({ status: 'ok', data }))
      .catch((err) => setState({ status: 'error', message: err.message }));
  }, []);

  return (
    <main className="page">
      <header>
        <p className="eyebrow">Indore Municipal Corporation</p>
        <h1>IMC Saathi</h1>
        <p className="sub">AI Citizen Service &amp; Complaint Assistant</p>
      </header>

      <section className="card">
        <h2>Backend connection</h2>

        {state.status === 'loading' && <p className="muted">Checking the API…</p>}

        {state.status === 'error' && (
          <>
            <p className="bad">Could not reach the API — {state.message}</p>
            <p className="muted">
              Is the server running? Try <code>npm run dev:server</code> in another terminal.
            </p>
          </>
        )}

        {state.status === 'ok' && (
          <dl>
            <dt>Status</dt>
            <dd className="good">{state.data.status}</dd>
            <dt>Service</dt>
            <dd>{state.data.service}</dd>
            <dt>Environment</dt>
            <dd>{state.data.environment}</dd>
            <dt>Uptime</dt>
            <dd>{state.data.uptimeSeconds}s</dd>
            <dt>Database</dt>
            <dd className="muted">{state.data.dependencies.database}</dd>
            <dt>Vector index</dt>
            <dd className="muted">{state.data.dependencies.vectorIndex}</dd>
            <dt>LLM</dt>
            <dd className="muted">{state.data.dependencies.llm}</dd>
          </dl>
        )}
      </section>

      <p className="footnote">
        Phase 1 of 14 — repository foundation. The real interface is built in Phase 9.
      </p>
    </main>
  );
}
