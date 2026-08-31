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
  // Includes localhost:5000 (this server's own default PORT) alongside the
  // Vite client's 5173 -- the single-page demo (public/demo.html) is served
  // by this same Express app, and browsers send an Origin header even on a
  // same-origin POST fetch, so the demo's own origin has to be allow-listed
  // too or its /api/chat calls 403 with CORS_NOT_ALLOWED.
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5000')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    ),

  // Added in later phases. Optional now so Phase 1 boots on an empty .env.
  MONGODB_URI: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_CHAT_MODEL: z.string().default('gemini-2.5-flash'),

  // Embeddings moved to NVIDIA NIM — docs/11-decisions.md D15.
  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_EMBEDDING_MODEL: z.string().default('nvidia/nemotron-3-embed-1b'),
  NVIDIA_CHAT_MODEL: z.string().default('openai/gpt-oss-120b'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
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
