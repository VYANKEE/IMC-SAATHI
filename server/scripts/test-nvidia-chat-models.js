/**
 * scripts/test-nvidia-chat-models.js
 *
 * One-off diagnostic (not wired into package.json), same purpose as
 * list-nvidia-chat-models.js but one step further: that script only proves a
 * model is LISTED in /v1/models, not that this API key/account can actually
 * invoke it. NVIDIA's chat completions endpoint returned a 404
 * "Function '...': Not found for account" for nvidia/llama-3.1-nemotron-70b-
 * instruct (D16's pick) even though it's still listed -- some hosted models
 * are access-gated per account separately from being listed at all. This
 * script sends a trivial guided_json request to a shortlist of candidates
 * with the SAME key, so we find out in one run whether the problem is
 * "this one model" or "this key/account" before changing anything.
 */
import { env } from '../src/config/env.js';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const CANDIDATES = [
  'nvidia/llama-3.1-nemotron-70b-instruct', // D16's original pick — control, expect this to fail again
  'nvidia/llama-3.1-nemotron-51b-instruct',
  'nvidia/nemotron-3-super-120b-a12b', // same nemotron-3 generation as the embedding model, which works fine
  'nvidia/mistral-nemo-minitron-8b-8k-instruct',
  'mistralai/mistral-7b-instruct-v0.3',
  'meta/llama2-70b',
  'openai/gpt-oss-120b',
];

const TEST_SCHEMA = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testModel(model) {
  const start = Date.now();
  try {
    const res = await fetch(NVIDIA_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.NVIDIA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with {"ok": true} and nothing else.' }],
        temperature: 0,
        max_tokens: 32,
        nvext: { guided_json: TEST_SCHEMA },
      }),
    });
    const ms = Date.now() - start;
    if (res.ok) {
      const body = await res.json();
      const content = body.choices?.[0]?.message?.content ?? '(no content)';
      console.log(`  PASS  ${model}  (${ms}ms)  -> ${content}`);
    } else {
      const text = await res.text();
      console.log(`  FAIL  ${model}  (${res.status}, ${ms}ms)  -> ${text.slice(0, 150)}`);
    }
  } catch (err) {
    console.log(`  ERROR ${model}  -> ${err.message}`);
  }
}

async function main() {
  if (!env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set in server/.env — cannot test.');
    process.exit(1);
  }
  console.log(
    `Testing ${CANDIDATES.length} candidate chat models against the real NVIDIA API...\n`
  );
  for (const model of CANDIDATES) {
    // eslint-disable-next-line no-await-in-loop
    await testModel(model);
    // eslint-disable-next-line no-await-in-loop
    await sleep(500);
  }
}

main();
