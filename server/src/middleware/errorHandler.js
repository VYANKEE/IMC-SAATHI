import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * The single place errors turn into HTTP responses.
 *
 * Express 5 forwards rejected promises from async handlers here automatically,
 * so route code does not need try/catch just to report an error. That matters a
 * lot in this project — almost every handler awaits a database or an LLM call.
 *
 * Internal error text NEVER goes into the response body, not even in
 * development. An earlier version attached `err.message` in dev, and a test
 * caught it leaking a MongoDB Atlas hostname. The full error is already in the
 * logs with the request id; the response carries that id so you can find it.
 * One rule, all environments — that is how you avoid the leak that only shows
 * up in production.
 */
export function errorHandler(err, req, res, _next) {
  const known = err instanceof ApiError;

  const statusCode = known ? err.statusCode : 500;
  const code = known ? err.code : 'INTERNAL_ERROR';
  const message = known ? err.message : 'Unable to process your request';

  const log = { requestId: req.id, statusCode, code, err: err.message };
  if (statusCode >= 500) logger.error({ ...log, stack: err.stack }, 'request failed');
  else logger.warn(log, 'request rejected');

  return res.status(statusCode).json({ success: false, code, message, requestId: req.id });
}
