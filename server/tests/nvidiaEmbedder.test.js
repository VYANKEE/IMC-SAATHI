import { describe, it, expect } from 'vitest';
import { truncateEmbedding, createNvidiaEmbedder } from '../src/ai/embeddings/nvidiaEmbedder.js';

describe('truncateEmbedding (Matryoshka client-side truncation)', () => {
  it('slices to the requested dimension and re-normalizes to unit length', () => {
    const result = truncateEmbedding([3, 4, 0, 0, 0], 2);
    expect(result).toEqual([0.6, 0.8]);
    const norm = Math.sqrt(result.reduce((sum, x) => sum + x * x, 0));
    expect(norm).toBeCloseTo(1, 10);
  });

  it('is a no-op when the requested dimension is >= the vector length', () => {
    expect(truncateEmbedding([1, 2, 3], 5)).toEqual([1, 2, 3]);
    expect(truncateEmbedding([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it('is a no-op when dimensions is falsy (no truncation requested)', () => {
    expect(truncateEmbedding([1, 2, 3], undefined)).toEqual([1, 2, 3]);
    expect(truncateEmbedding([1, 2, 3], 0)).toEqual([1, 2, 3]);
  });

  it('does not divide by zero on an all-zero vector', () => {
    expect(truncateEmbedding([0, 0, 0, 0], 2)).toEqual([0, 0]);
  });
});

describe('createNvidiaEmbedder', () => {
  it('throws immediately when no API key is provided, before ever calling fetch', () => {
    expect(() => createNvidiaEmbedder({ apiKey: '', model: 'nvidia/nemotron-3-embed-1b' })).toThrow(
      /NVIDIA_API_KEY/
    );
  });
});
