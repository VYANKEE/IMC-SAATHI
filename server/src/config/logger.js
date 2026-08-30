import pino from 'pino';
import { env, isProd } from './env.js';

/**
 * Structured JSON logging.
 *
 * In production we emit JSON so a log platform can search it.
 * In development we pipe through pino-pretty so it is readable in the terminal.
 *
 * Rule from docs/08-security.md: never log PII. Log userId, not phone numbers.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.phone',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss' },
        },
      }),
});
