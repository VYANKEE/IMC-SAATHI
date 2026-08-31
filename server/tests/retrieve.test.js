import { describe, it, expect } from 'vitest';
import { passesConfidenceGate } from '../src/ai/retrieval/retrieve.js';

describe('passesConfidenceGate', () => {
  it('passes when the top result clears the threshold', () => {
    expect(passesConfidenceGate([{ score: 0.82 }, { score: 0.5 }], 0.7)).toBe(true);
  });

  it('fails when the top result is below the threshold, even if others are above', () => {
    expect(passesConfidenceGate([{ score: 0.6 }, { score: 0.9 }], 0.7)).toBe(false);
  });

  it('fails on no results at all', () => {
    expect(passesConfidenceGate([], 0.7)).toBe(false);
  });

  it('passes at the exact threshold (inclusive)', () => {
    expect(passesConfidenceGate([{ score: 0.7 }], 0.7)).toBe(true);
  });
});
