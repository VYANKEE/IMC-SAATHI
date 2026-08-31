import { z } from 'zod';

/**
 * The chat endpoint's whole request contract. Kept deliberately tiny — this
 * is the Phase 7 "thin harness" the roadmap calls for, not a chat-history /
 * session API. One turn in, one answer out.
 */
export const chatBody = z.object({
  query: z
    .string()
    .trim()
    .min(2, 'query must be at least 2 characters')
    .max(1000, 'query must be at most 1000 characters'),
});
