import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAnswer,
  getGroundingViolations,
  _resetGroundingViolationsForTests,
} from '../src/ai/validate/validateAnswer.js';

const FALLBACK = "I don't have verified information to answer that.";

function baseResponse(overrides = {}) {
  return {
    answer: 'Contact the Electrical department for a street light complaint.',
    procedureSteps: [],
    requiredDocuments: [],
    requiredInformation: [],
    sources: [{ chunkId: 'CHUNK_1', document: 'kb.pdf', section: '', url: '' }],
    confidence: 'high',
    ...overrides,
  };
}

describe('validateAnswer', () => {
  beforeEach(() => {
    _resetGroundingViolationsForTests();
  });

  it('leaves a fully grounded answer untouched', () => {
    const result = validateAnswer(baseResponse(), {
      phones: ['9876543210'],
      urls: ['https://imcindore.mp.gov.in/'],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toEqual([]);
    expect(result.answer).toBe(baseResponse().answer);
    expect(result.sources).toHaveLength(1);
  });

  it('redacts a phone number not present in verifiedFacts.phones (step 1)', () => {
    const response = baseResponse({ answer: 'Call 9999999999 for help.' });
    const result = validateAnswer(response, {
      phones: ['9876543210'],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('unverified_phone_number');
    expect(result.answer).not.toContain('9999999999');
  });

  it('keeps a phone number that IS in verifiedFacts.phones', () => {
    const response = baseResponse({ answer: 'Call 9876543210 for help.' });
    const result = validateAnswer(response, {
      phones: ['9876543210'],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).not.toContain('unverified_phone_number');
    expect(result.answer).toContain('9876543210');
  });

  it('redacts a URL not present in verifiedFacts.urls (step 2)', () => {
    const response = baseResponse({ answer: 'Apply at https://fake-imc-scam.example/.' });
    const result = validateAnswer(response, {
      urls: ['https://imcindore.mp.gov.in/'],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('unverified_url');
    expect(result.answer).not.toContain('fake-imc-scam');
  });

  it('drops a cited chunkId that was not actually retrieved (step 3)', () => {
    const response = baseResponse({
      sources: [
        { chunkId: 'CHUNK_1', document: 'kb.pdf' },
        { chunkId: 'CHUNK_INVENTED', document: 'kb.pdf' },
      ],
    });
    const result = validateAnswer(response, {
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('invented_citation');
    expect(result.sources).toEqual([{ chunkId: 'CHUNK_1', document: 'kb.pdf' }]);
  });

  it('forces the fallback answer when sources end up empty (step 4)', () => {
    const response = baseResponse({ sources: [] });
    const result = validateAnswer(response, {
      retrievedChunkIds: [],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('empty_sources_not_fallback');
    expect(result.answer).toBe(FALLBACK);
    expect(result.confidence).toBe('low');
  });

  it('does not double-flag when the model already gave the fallback with empty sources', () => {
    const response = baseResponse({ answer: FALLBACK, sources: [] });
    const result = validateAnswer(response, {
      retrievedChunkIds: [],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).not.toContain('empty_sources_not_fallback');
    expect(result.answer).toBe(FALLBACK);
  });

  it('strips an unverified rupee amount from fees (step 5)', () => {
    const response = baseResponse({ fees: 'The fee is ₹500.' });
    const result = validateAnswer(response, {
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('unverified_fee_amount');
    expect(result.fees).not.toContain('500');
  });

  it('strips an unverified rupee amount from the answer text too', () => {
    const response = baseResponse({ answer: 'The fee is Rs. 1,200 payable online.' });
    const result = validateAnswer(response, {
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v1',
    });
    expect(result.groundingViolations).toContain('unverified_fee_amount_in_answer');
    expect(result.answer).not.toContain('1,200');
  });

  it('logs every intervention to the per-prompt-version groundingViolations counter (step 6)', () => {
    const response = baseResponse({ answer: 'Call 9999999999 now.' });
    validateAnswer(response, {
      phones: [],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v-test-1',
    });
    validateAnswer(response, {
      phones: [],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v-test-1',
    });
    expect(getGroundingViolations('v-test-1')).toBe(2);
    expect(getGroundingViolations('v-nonexistent')).toBe(0);
  });

  it('does not bump the counter when nothing was wrong', () => {
    validateAnswer(baseResponse(), {
      phones: ['9876543210'],
      retrievedChunkIds: ['CHUNK_1'],
      fallbackText: FALLBACK,
      promptVersion: 'v-clean',
    });
    expect(getGroundingViolations('v-clean')).toBe(0);
  });
});
