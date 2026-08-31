#!/usr/bin/env node
/**
 * scripts/list-nvidia-models.js
 *
 * One-off diagnostic — NOT part of the Phase 4 pipeline, not wired into
 * package.json. We guessed two embedding model names from NVIDIA's public
 * docs (`llama-3.2-nv-embedqa-1b-v2`, then `llama-nemotron-embed-1b-v2`) and
 * BOTH came back 410 Gone/end-of-life — the docs/search results lag behind
 * what NVIDIA's catalog actually serves. Rather than guess a third name,
 * ask NVIDIA directly: this hits the OpenAI-compatible /v1/models endpoint
 * with our real key and lists whatever this account can currently reach.
 * Safe to delete once embed.js is pointed at a working model.
 */
import { env } from '../src/config/env.js';

if (!env.NVIDIA_API_KEY) {
  throw new Error('NVIDIA_API_KEY is not set in server/.env.');
}

const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
  headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}` },
});

const body = await res.json();

if (!res.ok) {
  console.error(`\nrequest failed (${res.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}

const allIds = body.data.map((m) => m.id).sort();
const embedIds = allIds.filter((id) => /embed/i.test(id));

console.log(`\nThis key can currently see ${allIds.length} model(s) total.\n`);
console.log(`Embedding-related models (${embedIds.length}):`);
embedIds.forEach((id) => console.log('  -', id));

if (embedIds.length === 0) {
  console.log(
    '\n(none matched /embed/i — printing all model ids instead, in case naming is different)'
  );
  allIds.forEach((id) => console.log('  -', id));
}
console.log('');
