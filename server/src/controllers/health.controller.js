import { ok } from '../utils/respond.js';
import { env } from '../config/env.js';
import { databaseStatus } from '../config/db.js';

/**
 * Controllers translate HTTP in, HTTP out. No business logic here.
 * A controller containing an `if` about business rules is a bug —
 * that belongs in a service. See docs/09-repo-structure.md.
 */
export function getHealth(req, res) {
  return ok(res, {
    status: 'ok',
    service: 'imc-saathi-api',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies: {
      database: databaseStatus(),
      vectorIndex: 'not_configured', // Phase 4
      llm: 'not_configured', // Phase 6
    },
  });
}
