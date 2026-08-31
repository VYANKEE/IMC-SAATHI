import { createHash } from 'node:crypto';

/** Stable content hash — used for both whole-file byte dedup (register #2)
 *  and chunk-text dedup (defensive: catches the same Q/A appearing twice
 *  across two different source files). */
export function contentHash(bufferOrString) {
  return createHash('sha256').update(bufferOrString).digest('hex');
}
