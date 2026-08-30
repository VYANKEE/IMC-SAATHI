import { randomUUID } from 'node:crypto';

/**
 * Give every request an ID and echo it back in a header.
 *
 * Why it matters here: a bad chatbot answer is reported by a citizen hours
 * later. The request ID is how you find that exact request's log line — which
 * chunks were retrieved, what scores, which prompt version. Without it you are
 * guessing. See docs/03-rag.md.
 */
export function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
