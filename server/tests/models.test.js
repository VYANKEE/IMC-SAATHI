import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';
import { Department, Zone, Contact, KnowledgeChunk } from '../src/models/index.js';
import '../src/models/ExternalAuthority.js';

/**
 * Schema tests — no database connection needed.
 *
 * Mongoose can validate a document in memory, so these run in milliseconds and
 * catch the mistakes that actually happen: a required field that isn't
 * required, an enum that accepts anything, a phone number that isn't checked.
 */
describe('Department schema', () => {
  it('requires a coverage tier', () => {
    const err = new Department({ code: 'ELECTRICAL', slug: 'electrical' }).validateSync();
    expect(err.errors.coverageTier).toBeDefined();
  });

  it('rejects a coverage tier outside A, B, C', () => {
    const err = new Department({ coverageTier: 'Z' }).validateSync();
    expect(err.errors.coverageTier).toBeDefined();
  });

  it('requires both English and Hindi names', () => {
    const err = new Department({ coverageTier: 'A', name: { en: 'Electrical' } }).validateSync();
    expect(err.errors['name.hi']).toBeDefined();
  });

  it('accepts a valid department', () => {
    const err = new Department({
      code: 'ELECTRICAL',
      slug: 'electrical-mechanical',
      coverageTier: 'A',
      name: { en: 'Electrical & Mechanical', hi: 'विद्युत एवं यांत्रिकी' },
    }).validateSync();
    expect(err).toBeUndefined();
  });
});

describe('Zone schema', () => {
  it('rejects a zone number above 22 — IMC has exactly 22 zones', () => {
    const err = new Zone({ zoneNumber: 23, name: { en: 'x', hi: 'x' } }).validateSync();
    expect(err.errors.zoneNumber).toBeDefined();
  });

  it('accepts zone 9 with its real ward list', () => {
    const err = new Zone({
      zoneNumber: 9,
      name: { en: 'Dr. Bhimrao Ambedkar Zone', hi: 'डॉ. भीमराव अंबेडकर ज़ोन' },
      wards: [26, 44, 45, 46, 47],
    }).validateSync();
    expect(err).toBeUndefined();
  });
});

describe('Contact schema', () => {
  it('rejects a malformed mobile number', () => {
    // Data quality register #10: the source dataset stored these as floats,
    // e.g. "7974162847.0". Anything not exactly 10 digits must be caught.
    const err = new Contact({ name: 'Test', mobile: '7974162847.0' }).validateSync();
    expect(err.errors.mobile).toBeDefined();
  });

  it('accepts a real 10-digit mobile', () => {
    const err = new Contact({ name: 'Mr. Srikant Kate', mobile: '7974162847' }).validateSync();
    expect(err).toBeUndefined();
  });

  it('requires a name', () => {
    const err = new Contact({ mobile: '7974162847' }).validateSync();
    expect(err.errors.name).toBeDefined();
  });
});

describe('KnowledgeChunk schema', () => {
  const valid = {
    chunkId: 'abc123',
    parentChunkId: 'abc123',
    embeddingText:
      '[Fire Department | fire_noc | what_is_fire_noc]\nQ: What is fire NOC?\nA: A certificate.',
    text: '[Fire Department | fire_noc | what_is_fire_noc]\nQ: What is fire NOC?\nA: A certificate.',
    department: 'FIRE',
    category: 'fire_noc',
    language: 'en',
    sourceFile: 'Fire_NOC.csv',
    sourceRowRef: 'row_0',
    status: 'active',
  };

  it('accepts a valid primary chunk', () => {
    const err = new KnowledgeChunk(valid).validateSync();
    expect(err).toBeUndefined();
  });

  it('requires embeddingText separately from text', () => {
    const { embeddingText: _drop, ...rest } = valid;
    const err = new KnowledgeChunk(rest).validateSync();
    expect(err.errors.embeddingText).toBeDefined();
  });

  it('rejects a language outside en/hi/hinglish', () => {
    const err = new KnowledgeChunk({ ...valid, language: 'fr' }).validateSync();
    expect(err.errors.language).toBeDefined();
  });

  it('rejects status values other than active — quarantined rows never reach this collection', () => {
    const err = new KnowledgeChunk({ ...valid, status: 'quarantined' }).validateSync();
    expect(err.errors.status).toBeDefined();
  });

  it('allows embedding to be unset (before the embed script has run)', () => {
    const err = new KnowledgeChunk(valid).validateSync();
    expect(err).toBeUndefined();
  });

  it('accepts a variant row whose embeddingText differs from its parent text', () => {
    const variant = {
      ...valid,
      chunkId: 'abc123_v1',
      isVariant: true,
      embeddingText: 'Fire NOC kaise apply karu?',
    };
    const err = new KnowledgeChunk(variant).validateSync();
    expect(err).toBeUndefined();
  });
});

describe('model registry', () => {
  it('registers exactly the models we have defined so far', () => {
    // This test is deliberately strict. When it fails after you add a model,
    // that is the reminder to also add its seed data, its repository and its
    // schema tests — not just the schema file.
    expect(mongoose.modelNames().sort()).toEqual([
      'Contact',
      'Department',
      'ExternalAuthority',
      'KnowledgeChunk',
      'Zone',
    ]);
  });
});
