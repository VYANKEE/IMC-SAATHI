/**
 * scripts/inspect-grounded-schema.js
 *
 * One-off diagnostic. The first real /api/chat call returned a JSON shape
 * that does NOT match GROUNDED_ANSWER_SCHEMA (schemas/index.js) at all --
 * "procedure" instead of "procedureSteps", "department" as a plain string
 * instead of {id,name}, "contact.position" instead of "contact.designation"
 * -- even though the SAME nvext.guided_json mechanism enforced CLASSIFY_SCHEMA
 * (a flat schema, no nested objects) perfectly in the same request run.
 * This calls the real API with the real GROUNDED_ANSWER_SCHEMA and a
 * minimal prompt to see exactly what comes back, isolating whether nested
 * objects/arrays-of-objects are what breaks guided_json enforcement on
 * gpt-oss-120b, before deciding how to fix it.
 */
import { env } from '../src/config/env.js';
import { GROUNDED_ANSWER_SCHEMA, CLASSIFY_SCHEMA } from '../src/ai/schemas/index.js';

const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MODEL = env.NVIDIA_CHAT_MODEL;

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
  console.log(text.slice(0, 4000));
}

async function main() {
  if (!env.NVIDIA_API_KEY) {
    console.error('NVIDIA_API_KEY is not set.');
    process.exit(1);
  }

  const prompt =
    'Respond with ONLY a JSON object matching the required schema. ' +
    'answer: "Contact the Electrical department.", sources: [], confidence: "low".';

  await call('GROUNDED_ANSWER_SCHEMA (full, as used in production)', {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 2048,
    reasoning_effort: 'low',
    nvext: { guided_json: GROUNDED_ANSWER_SCHEMA },
  });

  // Isolate: is it nested objects (department/contact) or arrays-of-objects
  // (sources/suggestedActions) that break enforcement? Test with only the
  // top-level scalar/array-of-string fields, no nested object properties.
  const FLAT_ONLY_SCHEMA = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      procedureSteps: { type: 'array', items: { type: 'string' } },
      officeTiming: { type: ['string', 'null'] },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['answer', 'confidence'],
  };
  await call('FLAT_ONLY_SCHEMA (no nested objects, no arrays-of-objects)', {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_effort: 'low',
    nvext: { guided_json: FLAT_ONLY_SCHEMA },
  });

  // One nested object only (no arrays-of-objects).
  const ONE_NESTED_OBJECT_SCHEMA = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      department: {
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' } },
        required: ['id', 'name'],
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['answer', 'confidence'],
  };
  await call('ONE_NESTED_OBJECT_SCHEMA (department only)', {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_effort: 'low',
    nvext: { guided_json: ONE_NESTED_OBJECT_SCHEMA },
  });

  // Array of objects only (sources), no other nested objects.
  const ARRAY_OF_OBJECTS_SCHEMA = {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: { chunkId: { type: 'string' }, document: { type: 'string' } },
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['answer', 'confidence'],
  };
  await call('ARRAY_OF_OBJECTS_SCHEMA (sources only)', {
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_effort: 'low',
    nvext: { guided_json: ARRAY_OF_OBJECTS_SCHEMA },
  });

  // Sanity control: re-confirm CLASSIFY_SCHEMA still works in this same run.
  await call('CLASSIFY_SCHEMA (control -- known to work)', {
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: 'Classify: "street light nahi jal raha hai". Respond with ONLY the JSON.',
      },
    ],
    temperature: 0.2,
    max_tokens: 1024,
    reasoning_effort: 'low',
    nvext: { guided_json: CLASSIFY_SCHEMA },
  });
}

main();
