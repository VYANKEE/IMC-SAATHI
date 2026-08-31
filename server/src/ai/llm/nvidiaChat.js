/**
 * nvidiaChat.js
 *
 * The one place any code calls NVIDIA's chat completions API
 * (docs/11-decisions.md D16 + Addendum 1 — openai/gpt-oss-120b; the
 * nemotron-family instruct models D16 originally picked all 404 "Function
 * not found for account" on this NVIDIA account despite being listed in
 * /v1/models — see the addendum for the full diagnosis).
 * Hand-written fetch(), same reasoning as nvidiaEmbedder.js: no JS
 * LangChain package for NVIDIA's endpoints.
 *
 * Structured JSON output uses NVIDIA NIM's `nvext.guided_json` extension,
 * NOT the plain OpenAI `response_format: {type: "json_object"}` — NVIDIA's
 * own docs warn that plain json_object mode "permits the model to produce
 * any valid JSON, including empty objects," which is exactly the failure
 * mode docs/03-rag.md's grounding rules are trying to prevent.
 * `guided_json` constrains generation to an actual JSON Schema. Verified
 * gpt-oss-120b honours it correctly (see Addendum 1).
 *
 * gpt-oss-120b is a *reasoning* model: it writes a hidden chain-of-thought
 * into `message.reasoning_content` before writing the final answer into
 * `message.content` — both draw from the same `max_tokens` budget. Too low
 * a budget truncates generation mid-reasoning, before any `content` is ever
 * written, which reads as an empty response, not a JSON-parse error. That
 * is why `maxTokens` below defaults higher than a non-reasoning model would
 * need — see Addendum 1 for how this was actually observed happening.
 */
const NVIDIA_CHAT_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createNvidiaChat({ apiKey, model }) {
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not set — cannot create a chat client.');
  }

  /**
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} jsonSchema - a JSON Schema the response must satisfy.
   * @param {object} [opts]
   * @returns {Promise<object>} the parsed JSON response body.
   */
  async function completeJson(messages, jsonSchema, { temperature = 0.2, maxTokens = 2048 } = {}) {
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const res = await fetch(NVIDIA_CHAT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          nvext: { guided_json: jsonSchema },
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const content = body.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error('NVIDIA chat completion returned no message content.');
        }
        try {
          return JSON.parse(content);
        } catch {
          throw new Error(
            `NVIDIA chat completion did not return valid JSON despite guided_json: ${content.slice(0, 300)}`
          );
        }
      }

      const errorText = await res.text();
      const isRetryable = res.status === 429 || res.status >= 500;
      if (!isRetryable || attempt >= MAX_RETRIES) {
        throw new Error(
          `NVIDIA chat completion failed (${res.status}): ${errorText.slice(0, 300)}`
        );
      }
      await sleep(2000 * attempt);
    }
  }

  return { completeJson };
}
