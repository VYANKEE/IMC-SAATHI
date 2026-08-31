/**
 * scripts/inspect-gpt-oss.js
 *
 * One-off diagnostic. test-nvidia-chat-models.js found that
 * openai/gpt-oss-120b is the one model this account can currently invoke,
 * but message.content came back empty under guided_json -- printing the
 * FULL raw response (once with guided_json, once without) to see where the
 * actual text landed, before assuming this model is unusable.
 */
import { env } from '../src/config/env.js';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = 'openai/gpt-oss-120b';

const TEST_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

async function call(label, body) {
  const res = await fetch(NVIDIA_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`\n--- ${label} (status ${res.status}) ---`);
  console.log(text);
}

async function main() {
  if (!env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set.');
    process.exit(1);
  }

  await call('WITH guided_json', {
    model: MODEL,
    messages: [{ role: 'user', content: 'Reply with {"ok": true} and nothing else.' }],
    temperature: 0,
    max_tokens: 200,
    nvext: { guided_json: TEST_SCHEMA },
  });

  await call('WITHOUT guided_json (plain prompt)', {
    model: MODEL,
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
    temperature: 0,
    max_tokens: 200,
  });

  await call('WITH response_format json_object (OpenAI-standard, no nvext)', {
    model: MODEL,
    messages: [
      { role: 'system', content: 'Respond only with JSON: {"ok": true}' },
      { role: 'user', content: 'Reply with {"ok": true} and nothing else.' },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: 'json_object' },
  });
}

main();
