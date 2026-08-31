#!/usr/bin/env node
/**
 * scripts/list-nvidia-chat-models.js
 *
 * Same reasoning as list-nvidia-models.js (Phase 4's embedding-model
 * deprecation saga, docs/11-decisions.md D15 addenda) -- ask NVIDIA's
 * live /v1/models endpoint what chat/instruct models this key can
 * currently reach, instead of picking a name from docs/memory that might
 * already be end-of-life. One-off diagnostic for Phase 6's LLM provider
 * decision, not wired into package.json.
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

const ids = body.data.map((m) => m.id).sort();
const chatty = ids.filter(
  (id) =>
    /llama|nemotron|mistral|mixtral|instruct|chat|gpt|qwen|deepseek/i.test(id) &&
    !/embed|rerank|guard|vision|vlm/i.test(id)
);

console.log(`\nThis key can currently see ${ids.length} model(s) total.\n`);
console.log(`Candidate text chat/instruct models (${chatty.length}):`);
chatty.forEach((id) => console.log('  -', id));
console.log('');
