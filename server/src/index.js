import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';

/**
 * Connect the database first, then start listening.
 *
 * The order matters: a server that accepts requests before its database is up
 * answers them with confusing errors. If MONGODB_URI is not set at all we log a
 * warning and start anyway, so Phase 1 endpoints stay usable.
 */
await connectDatabase();

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `IMC Saathi API listening on http://localhost:${env.PORT}`
  );
});

/**
 * Graceful shutdown: stop accepting new connections, let in-flight requests
 * finish, close the database, then exit. Render sends SIGTERM on every
 * redeploy — without this, a citizen mid-request gets a dropped connection.
 */
function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await disconnectDatabase();
    logger.info('http server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});
