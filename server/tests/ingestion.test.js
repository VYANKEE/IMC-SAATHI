import { describe, it, expect, beforeAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestion } from '../src/ingestion/index.js';
import { classifyFiles } from '../src/ingestion/classifier.js';
import { detectLanguage, checkLanguageMismatch } from '../src/ingestion/language.js';
import { parseQuestionVariants } from '../src/ingestion/chunkers/qaPair.chunker.js';
import { redactContacts, looksLikeContactCard } from '../src/ingestion/redact.js';
import { extractNumberedFaqs } from '../src/ingestion/chunkers/numberedFaq.chunker.js';

/**
 * These tests run the real ingestion pipeline against the real files in
 * server/data/raw — no mocks, no fixtures. Same philosophy as
 * tests/seed-data.test.js: the raw documents are content, and content
 * rots, so the numbers below are a tripwire. If a raw file changes and a
 * count here breaks, that's the test doing its job — go look at why.
 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(ROOT, '..', 'data', 'raw');
const SEEDS_DIR = path.join(ROOT, '..', 'data', 'seeds');

let chunks, report;

beforeAll(async () => {
  ({ chunks, report } = await runIngestion({ rawDir: RAW_DIR, seedsDir: SEEDS_DIR }));
}, 30_000);

describe('language detection', () => {
  it('detects Devanagari as hi', () => {
    expect(detectLanguage('मेरे इलाके में स्ट्रीट लाइट खराब है')).toBe('hi');
  });

  it('detects common Hinglish tokens', () => {
    expect(detectLanguage('Fire NOC kaise apply karu, mujhe kya karna hoga')).toBe('hinglish');
  });

  it('detects plain English as en', () => {
    expect(detectLanguage('Where should I complain about a damaged road?')).toBe('en');
  });

  it('flags a declared language column that is not actually a language (register #1)', () => {
    const result = checkLanguageMismatch('Complaint', 'en');
    expect(result.mismatch).toBe(true);
    expect(result.declaredLooksCorrupted).toBe(true);
  });
});

describe('question variant parsing (register #13)', () => {
  it('splits an unclosed parenthetical Hinglish variant off the primary question', () => {
    const { primaryQuestion, variants } = parseQuestionVariants(
      'What is fire NOC? Is it important?(Fire NOC kya hota hai aur mujhe chahiye kya?'
    );
    expect(primaryQuestion).toBe('What is fire NOC? Is it important?');
    expect(variants).toEqual(['Fire NOC kya hota hai aur mujhe chahiye kya?']);
  });

  it('returns no variant when there is no parenthesis', () => {
    const { primaryQuestion, variants } = parseQuestionVariants(
      'Where should I complain about a damaged road?'
    );
    expect(primaryQuestion).toBe('Where should I complain about a damaged road?');
    expect(variants).toEqual([]);
  });
});

describe('contact redaction', () => {
  it('redacts an Indore landline embedded in prose and counts it', () => {
    const { text, redactionCount } = redactContacts(
      'Call the IMC helpline at 0731-4071717 for help.'
    );
    expect(text).not.toContain('4071717');
    expect(redactionCount).toBe(1);
  });

  it('recognises a Name/Designation/Mobile No. contact card', () => {
    expect(
      looksLikeContactCard(
        'Name: Mr. Test Designation: Additional Commissioner Mobile No.: 9425920720'
      )
    ).toBe(true);
  });

  it('does not flag ordinary procedural prose as a contact card', () => {
    expect(
      looksLikeContactCard('Open the Indore 311 App and select the Street Light category.')
    ).toBe(false);
  });
});

describe('file classifier — duplicate resolution', () => {
  it('prefers the structured CSV over a narrative DOCX covering the same topic', () => {
    const decisions = classifyFiles(['Fire_NOC.csv', 'Fire_NOC.docx']);
    const csv = decisions.find((d) => d.filename === 'Fire_NOC.csv');
    const docx = decisions.find((d) => d.filename === 'Fire_NOC.docx');
    expect(csv.action).toBe('process');
    expect(docx.action).toBe('superseded');
  });

  it('collapses byte-identical duplicate exports (register #2)', () => {
    const filenames = [
      'IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated.csv',
      'IMC_PWD_Revenue_Chatbot_FAQ_Dataset_Updated (1).csv',
    ];
    const hashes = new Map(filenames.map((f) => [f, 'same-hash']));
    const decisions = classifyFiles(filenames, hashes);
    expect(decisions.filter((d) => d.action === 'process')).toHaveLength(1);
    expect(decisions.filter((d) => d.action === 'superseded')).toHaveLength(1);
  });

  it('flags a same-topic, same-format conflict instead of silently picking one', () => {
    const filenames = ['Fire_NOC.csv', 'Fire_NOC.csv'.replace('.csv', '_(2).csv')];
    const hashes = new Map([
      [filenames[0], 'hash-a'],
      [filenames[1], 'hash-b'],
    ]);
    const decisions = classifyFiles(filenames, hashes);
    expect(decisions.every((d) => d.action === 'conflict')).toBe(true);
  });
});

describe('numbered FAQ extraction (KB.pdf)', () => {
  it('does not let one FAQ answer swallow the next section header or a repeated page header', () => {
    const fullText =
      'PWD-001. What? Answer one. IMC PWD & Revenue Chatbot FAQ - verified 18 Aug 2026 Page 4 3. Revenue Department — FAQ intro text REV-001. What? Answer two.';
    const faqs = extractNumberedFaqs(fullText);
    expect(faqs.map((f) => f.code)).toEqual(['PWD-001', 'REV-001']);
    expect(faqs[0].answer).not.toContain('Revenue Department');
    expect(faqs[0].answer).not.toContain('Page 4');
  });
});

describe('full pipeline against the real raw corpus', () => {
  it('produces a stable, non-trivial chunk set', () => {
    expect(chunks.length).toBeGreaterThan(150);
  });

  it('never embeds a phone number in an active chunk', () => {
    const phonePattern = /\b(?:0731[-\s]?\d{6,8}|\d{10})\b/;
    for (const chunk of chunks) {
      if (chunk.status !== 'active') continue;
      expect(
        phonePattern.test(chunk.text),
        `${chunk.sourceFile}#${chunk.sourceRowRef} leaks a phone number`
      ).toBe(false);
    }
  });

  it('quarantines every Housing_and_Rental chunk pending human review (register #6)', () => {
    const housing = chunks.filter((c) => c.department === 'HOUSING');
    expect(housing.length).toBeGreaterThan(0);
    expect(housing.every((c) => c.status === 'quarantined')).toBe(true);
  });

  it('supersedes every narrative .docx that has a structured .csv twin', () => {
    const superseded = report.files.superseded.map((f) => f.filename);
    for (const f of [
      'Fire_NOC.docx',
      'Housing_and_Rental.docx',
      'IMC_Saath_sanitation1.docx',
      'complaint_procedure.docx',
      'water_supply.docx',
    ]) {
      expect(superseded, `${f} should have been superseded by its CSV twin`).toContain(f);
    }
  });

  it('never chunks a facts-only document (contacts/zones/helplines)', () => {
    const factsFiles = [
      'Department_Head_Contact_Details.docx',
      'Zonal_Offices(Ward_Wise)_and_Contact_Details.docx',
      'Helpline_numbers.docx',
    ];
    for (const chunk of chunks) {
      expect(
        factsFiles,
        `${chunk.sourceFile} produced a chunk but is a facts-only document`
      ).not.toContain(chunk.sourceFile);
    }
  });

  it('detects the corrupted language column across most of the wide dataset (register #1)', () => {
    const mismatches = report.nonBlockingFlagBreakdown.language_column_mismatch ?? 0;
    expect(mismatches).toBeGreaterThan(40);
  });

  it('flags the known-bad office_phone value carried by every wide-dataset row (register #3)', () => {
    expect(report.nonBlockingFlagBreakdown.known_bad_helpline).toBeGreaterThan(50);
  });

  it('has no unrecognised files and no unresolved conflicts', () => {
    expect(report.files.skippedUnknown).toEqual([]);
    expect(report.files.conflict).toEqual([]);
  });
});
