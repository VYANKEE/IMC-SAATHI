import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

/**
 * The one scenario tests/chat.test.js can't exercise, because it mocks the
 * generator itself: what happens when NVIDIA_API_KEY genuinely isn't set
 * (a fresh clone, a CI box with no secrets). chat.service.js's getGenerator()
 * must fail with a clean 503, not crash the process or leak a stack trace --
 * see that file's own comment on why the key is checked per-request instead
 * of at server boot.
 */
vi.mock('../src/config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 5000,
    LOG_LEVEL: 'silent',
    ALLOWED_ORIGINS: ['http://localhost:5173'],
    MONGODB_URI: undefined,
    NVIDIA_API_KEY: undefined,
    NVIDIA_EMBEDDING_MODEL: 'nvidia/nemotron-3-embed-1b',
    NVIDIA_CHAT_MODEL: 'nvidia/llama-3.1-nemotron-70b-instruct',
    EMBEDDING_DIMENSIONS: 768,
  },
  isProd: false,
}));

const { createApp } = await import('../src/app.js');
const app = createApp();

describe('POST /api/chat when NVIDIA_API_KEY is not configured', () => {
  it('returns 503 with a clear code instead of crashing', async () => {
    const res = await request(app).post('/api/chat').send({ query: 'street light kharab hai' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('CHAT_UNAVAILABLE');
  });
});
