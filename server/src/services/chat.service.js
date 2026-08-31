import { env } from '../config/env.js';
import { createGenerator } from '../ai/generate/generateAnswer.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * chat.service.js
 *
 * Builds the Phase 6 generator lazily (on first request), not at module
 * load. createNvidiaChat() throws immediately if NVIDIA_API_KEY is unset —
 * NVIDIA_API_KEY is intentionally optional in env.js so the whole server can
 * still boot (and every non-chat route still work) on a machine/CI run
 * without that key. A request to /api/chat is the right place for that
 * requirement to become a hard error, not server startup.
 */
let generator;

function getGenerator() {
  if (!env.NVIDIA_API_KEY) {
    throw new ApiError(
      503,
      'CHAT_UNAVAILABLE',
      'The chat assistant is not configured on this server.'
    );
  }
  if (!generator) {
    generator = createGenerator({
      apiKey: env.NVIDIA_API_KEY,
      embeddingModel: env.NVIDIA_EMBEDDING_MODEL,
      chatModel: env.NVIDIA_CHAT_MODEL,
      dimensions: env.EMBEDDING_DIMENSIONS,
    });
  }
  return generator;
}

export async function askChat(query) {
  return getGenerator().generateAnswer(query);
}
