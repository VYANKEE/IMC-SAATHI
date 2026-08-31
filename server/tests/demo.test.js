import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('static demo page', () => {
  it('serves public/demo.html at the root', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('IMC Saathi');
  });

  it('serves public/demo.js', async () => {
    const res = await request(app).get('/demo.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('does not shadow the API -- /api/health still resolves', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe("CORS allow-list includes the demo page's own origin", () => {
  it('accepts a request with Origin: http://localhost:5000 (same origin the demo is served from)', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5000');
    expect(res.status).toBe(200);
  });

  it('still rejects an origin that was never allow-listed', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CORS_NOT_ALLOWED');
  });
});
