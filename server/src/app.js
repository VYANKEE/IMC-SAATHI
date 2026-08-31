import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { requestId } from './middleware/requestId.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { ApiError } from './utils/ApiError.js';
import routes from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

/**
 * Builds the Express app but does NOT listen.
 *
 * Why split app.js and index.js: tests can import the app and fire requests at
 * it with supertest without ever opening a port. If app.js called listen(),
 * every test run would try to bind port 5000.
 */
export function createApp() {
  const app = express();

  // Trust the proxy so req.ip is the real client IP behind Render/Vercel.
  app.set('trust proxy', 1);

  app.use(requestId);
  app.use(pinoHttp({ logger, genReqId: (req) => req.id }));

  app.use(helmet());

  // Strict allow-list. Never origin:'*' together with credentials —
  // that is both a security hole and silently broken in browsers.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // curl, Postman, server-to-server
        if (env.ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        // A plain Error here would surface as a generic 500. Throw an ApiError
        // so a blocked origin gets an honest 403 with a code the client can read.
        return callback(ApiError.forbidden(`Origin not allowed: ${origin}`, 'CORS_NOT_ALLOWED'));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // The single-page demo (public/demo.html + demo.js) -- NOT the Phase 9
  // frontend, see that directory's own comment. Served from this same app
  // (not the client/ workspace) so it needs no separate dev server and no
  // extra CORS origin beyond what's already allow-listed above. Mounted
  // before /api so demo.html/demo.js resolve first; falls through to the
  // API routes and then notFound for anything it doesn't have.
  app.use(express.static(publicDir));

  app.use('/api', routes);

  // Order matters: notFound catches unmatched routes, errorHandler is last.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
