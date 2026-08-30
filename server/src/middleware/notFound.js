import { ApiError } from '../utils/ApiError.js';

// Any URL that matched no route falls through to here.
export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}
