import { describe, it, expect } from 'vitest';
import {
  extractQuestion,
  pickSuggestedQuestions,
} from '../src/services/suggestedQuestions.service.js';

describe('extractQuestion', () => {
  it('extracts from a "Q: ... A: ..." chunk with a [Dept | category | intent] header', () => {
    const text =
      '[Electrical & Mechanical | street_light | is_not_working]\nQ: Street light is not working, what do I do?\nA: File a complaint via the Indore 311 app.';
    expect(extractQuestion(text)).toBe('Street light is not working, what do I do?');
  });

  it('extracts a numbered bare question (KB.pdf style), stripping the number', () => {
    const text = '3. How can I pay my property tax online?\nLog in to the e-Nagar Palika portal...';
    expect(extractQuestion(text)).toBe('How can I pay my property tax online?');
  });

  it('returns null for narrative content with no question at all', () => {
    const text =
      '[PWD | Roads | policy]\nRoad maintenance is scheduled quarterly across all 22 zones.';
    expect(extractQuestion(text)).toBeNull();
  });

  it('returns null when the first line is a statement, not a question', () => {
    const text = 'The office is open Monday to Friday.';
    expect(extractQuestion(text)).toBeNull();
  });
});

describe('pickSuggestedQuestions', () => {
  it('dedupes case-insensitively and preserves fetch order', () => {
    const chunks = [
      { text: 'Q: How do I file a complaint?\nA: ...' },
      { text: 'Q: how do I FILE a complaint?\nA: duplicate of the above' },
      { text: 'Q: What documents are required?\nA: ...' },
    ];
    expect(pickSuggestedQuestions(chunks, 5)).toEqual([
      'How do I file a complaint?',
      'What documents are required?',
    ]);
  });

  it('caps at limit even when more questions are available', () => {
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      text: `Q: Question number ${i}?\nA: ...`,
    }));
    expect(pickSuggestedQuestions(chunks, 3)).toHaveLength(3);
  });

  it('skips chunks with no extractable question instead of stopping', () => {
    const chunks = [
      { text: 'Narrative text with no question.' },
      { text: 'Q: A real question here?\nA: ...' },
    ];
    expect(pickSuggestedQuestions(chunks, 5)).toEqual(['A real question here?']);
  });

  it('returns an empty array when nothing is extractable', () => {
    expect(pickSuggestedQuestions([{ text: 'Just narrative.' }], 5)).toEqual([]);
  });
});
