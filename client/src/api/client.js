/**
 * One place that knows how to talk to the API.
 *
 * Every component calls this, never fetch() directly. When Phase 8 adds the
 * Firebase token header, it gets added HERE — once — instead of in twenty
 * components.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

export async function apiGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await res.json().catch(() => null);

  // The server always returns { success, data } or { success, message, code }.
  // See docs/05-api.md.
  if (!res.ok || !body?.success) {
    const error = new Error(body?.message || `Request failed (${res.status})`);
    error.code = body?.code || 'NETWORK_ERROR';
    throw error;
  }

  return body.data;
}
