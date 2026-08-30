/**
 * An error we deliberately throw and are happy to show a citizen.
 *
 * Anything that is NOT an ApiError is treated as an unexpected bug by the
 * error handler and becomes a generic 500 — so a stack trace or a Mongo error
 * string can never leak to a user. See docs/08-security.md.
 */
export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message, code = 'VALIDATION_ERROR') {
    return new ApiError(400, code, message);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }
  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }
  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new ApiError(429, code, message);
  }
}
