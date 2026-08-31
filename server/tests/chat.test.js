import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

/**
 * Route-level tests for the Phase 7 "thin harness" chat endpoint, mocked at
 * the generator boundary (src/ai/generate/generateAnswer.js) -- same
 * approach as tests/api.test.js's repository mocks: exercise validate
 * middleware, controller, service and error handler without a real NVIDIA
 * or MongoDB call.
 */
const mockGenerateAnswer = vi.fn();
vi.mock('../src/ai/generate/generateAnswer.js', () => ({
  createGenerator: () => ({ generateAnswer: mockGenerateAnswer }),
}));

const { createApp } = await import('../src/app.js');
const app = createApp();

beforeEach(() => {
  mockGenerateAnswer.mockReset();
});

describe('POST /api/chat', () => {
  it('rejects a query that is too short before calling the generator', async () => {
    const res = await request(app).post('/api/chat').send({ query: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('rejects a missing query', async () => {
    const res = await request(app).post('/api/chat').send({});
    expect(res.status).toBe(400);
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('rejects a query over the length limit', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'a'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(mockGenerateAnswer).not.toHaveBeenCalled();
  });

  it('returns the generator result inside the success envelope', async () => {
    mockGenerateAnswer.mockResolvedValue({
      route: 'grounded',
      answer: 'Contact PWD for a pothole complaint.',
      sources: [{ chunkId: 'CHUNK_1' }],
      confidence: 'high',
    });

    const res = await request(app)
      .post('/api/chat')
      .send({ query: 'Sadak me gaddha hai, kya karu?' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.route).toBe('grounded');
    expect(mockGenerateAnswer).toHaveBeenCalledWith('Sadak me gaddha hai, kya karu?');
  });

  it('never leaks an internal error to the citizen when generation fails', async () => {
    mockGenerateAnswer.mockRejectedValue(new Error('NVIDIA chat completion failed (500): boom'));

    const res = await request(app).post('/api/chat').send({ query: 'street light kharab hai' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(res.body.message).toBe('Unable to process your request');
    expect(JSON.stringify(res.body)).not.toContain('boom');
  });
});
