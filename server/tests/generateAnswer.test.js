import { describe, it, expect } from 'vitest';
import { extractWardNumber } from '../src/ai/generate/generateAnswer.js';

describe('extractWardNumber', () => {
  it('extracts a plain "ward 47"', () => {
    expect(extractWardNumber('Ward 47 mein garbage van nahi aa raha')).toBe(47);
  });

  it('extracts "ward no. 12"', () => {
    expect(extractWardNumber('complaint for ward no. 12 please')).toBe(12);
  });

  it('is case-insensitive', () => {
    expect(extractWardNumber('WARD 5 street light issue')).toBe(5);
  });

  it('returns undefined when there is no ward mention', () => {
    expect(extractWardNumber('street light nahi jal raha hai')).toBeUndefined();
  });

  it('returns undefined for an out-of-range ward number', () => {
    expect(extractWardNumber('ward 199 kuch problem hai')).toBeUndefined();
  });

  it('returns undefined for non-string input', () => {
    expect(extractWardNumber(undefined)).toBeUndefined();
  });
});
