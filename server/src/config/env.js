import 'dotenv/config';
import { z } from 'zod';

/**
 * Validate environment variables ONCE, at boot.
 *
 * Why: if MONGODB_URI is missing we want the server to refuse to start with a
 * clear message — not to crash at 2am on the first database query. Fail loud,
 * fail early, fail in one place.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),

  // Added in later phases. Optional now so Phase 1 boots on an empty .env.
  MONGODB_URI: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
