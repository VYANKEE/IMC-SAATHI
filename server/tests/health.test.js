import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with the success envelope', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('imc-saathi-api');
  });

  it('sets a request id header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('unknown routes', () => {
  it('returns the error envelope, not an HTML stack trace', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
