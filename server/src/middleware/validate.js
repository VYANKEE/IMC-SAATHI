import { ApiError } from '../utils/ApiError.js';

/**
 * Validate one part of the request with a Zod schema and REPLACE it with the
 * parsed result — so downstream code gets coerced, typed values (a real number
 * for wardNumber, not the string "47") and nothing the schema did not allow.
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first.path.length ? `${first.path.join('.')}: ` : '';
      return next(ApiError.badRequest(`${where}${first.message}`));
    }
    // req.query and req.params are getter-only in Express 5.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    return next();
  };
}
