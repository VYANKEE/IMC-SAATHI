/**
 * qaPair.chunker.js
 *
 * One Q/A pair (a CSV row, or a row of the 66-record wide FAQ dataset) =
 * one chunk. This is the "natively atomic" case from docs/03-rag.md — no
 * splitting logic needed, just careful extraction of what goes IN the
 * embedded text versus what stays OUT of it.
 *
 * Critically: contact names, mobiles, office phones and addresses are
 * NEVER placed in `text` (the string that gets embedded). Register #11:
 * "Officer names and phone numbers are dynamic... stripped out of the
 * embedded chunk text so a contact change never requires re-embedding."
 * They are preserved on the chunk as `sourceFacts` purely for traceability
 * / cross-checking against the Phase 2 contacts collection — the API
 * never serves them from here.
 */
import { detectLanguage, checkLanguageMismatch } from '../language.js';
import { clean } from '../cleaner.js';

/**
 * "What is fire NOC? Is it important?(Fire NOC kya hota hai...?" — the
 * source CSVs glue a Hinglish transliteration onto the English question
 * inside an (often unclosed) parenthesis. Register #13: parse it out into
 * a separate variant instead of leaving it glued on, so it becomes usable
 * retrieval signal rather than noise on the primary question.
 */
export function parseQuestionVariants(rawQuestion) {
  const text = (rawQuestion ?? '').trim();
  const openIdx = text.indexOf('(');
  if (openIdx === -1) {
    return { primaryQuestion: text, variants: [] };
  }
  const primaryQuestion = text.slice(0, openIdx).trim();
  let variant = text.slice(openIdx + 1).trim();
  if (variant.endsWith(')')) variant = variant.slice(0, -1).trim();
  return {
    primaryQuestion: primaryQuestion || text, // never return an empty primary
    variants: variant ? [variant] : [],
  };
}

function slugify(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function buildEmbeddedText({
  departmentLabel,
  category,
  intent,
  question,
  answer,
  requiredInformation,
}) {
  const header = `[${departmentLabel} | ${category} | ${intent}]`;
  const parts = [`Q: ${question}`, `A: ${answer}`];
  if (
    requiredInformation &&
    requiredInformation.trim() &&
    !/^none/i.test(requiredInformation.trim())
  ) {
    parts.push(`Required information: ${requiredInformation.trim()}`);
  }
  return [header, ...parts].join('\n');
}

/**
 * Chunk one row of a simple "Section,Question,Answer" (or "Category,...")
 * topic CSV. `topic` comes from topicMap.js — department/category are fixed
 * for the whole file.
 */
export function chunkSimpleQaRow(row, { topic, sourceFile, rowIndex, departmentLabel }) {
  const sectionLabel = row.Section ?? row.Category ?? row.section ?? row.category ?? '';
  const rawQuestion = row.Question ?? row.question ?? '';
  const rawAnswer = clean(row.Answer ?? row.answer ?? '');
  const { primaryQuestion, variants } = parseQuestionVariants(rawQuestion);
  const question = clean(primaryQuestion);
  const intent = slugify(question) || `row_${rowIndex}`;

  const text = buildEmbeddedText({
    departmentLabel,
    category: topic.category,
    intent,
    question,
    answer: rawAnswer,
  });

  const detectedLanguage = detectLanguage(`${question} ${rawAnswer} ${variants.join(' ')}`);

  return {
    text,
    department: topic.department,
    category: topic.category,
    intent,
    language: detectedLanguage,
    questionVariants: variants,
    sourceFile,
    sourceRowRef: `row_${rowIndex}`,
    sectionLabel: clean(sectionLabel), // informational only — register #12: never used as metadata directly
    needsReview: Boolean(topic.needsReview),
    needsReviewReason: topic.needsReviewReason ?? null,
    sourceFacts: {}, // simple topic CSVs carry no per-row contact data
  };
}

/**
 * Chunk one row of the 66-record wide FAQ dataset. Department/category come
 * from the row's own columns rather than topicMap. Contact/phone columns
 * are captured into `sourceFacts` and deliberately excluded from `text`.
 */
export function chunkWideDatasetRow(row, { sourceFile, rowIndex, departmentLabelFor }) {
  const department = (row.department ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  const category = (row.category ?? 'general').trim();
  const intent = (row.intent ?? '').trim() || slugify(row.question) || `row_${rowIndex}`;
  const rawQuestion = row.question ?? '';
  const rawAnswer = clean(row.answer ?? '');
  const { primaryQuestion, variants } = parseQuestionVariants(rawQuestion);
  const question = clean(primaryQuestion);

  const text = buildEmbeddedText({
    departmentLabel: departmentLabelFor(department) ?? department,
    category,
    intent,
    question,
    answer: rawAnswer,
    requiredInformation: row.required_information,
  });

  const languageCheck = checkLanguageMismatch(
    row.language,
    detectLanguage(`${question} ${rawAnswer}`)
  );

  return {
    text,
    department,
    category,
    intent,
    language: languageCheck.detected,
    languageMismatch: languageCheck.mismatch ? languageCheck : null,
    questionVariants: variants,
    sourceFile,
    sourceRowRef: row.faq_id || `row_${rowIndex}`,
    needsReview: false,
    needsReviewReason: null,
    sourceFacts: {
      contactPerson: row.contact_person || null,
      contactDesignation: row.contact_designation || null,
      contactMobile: row.contact_mobile || null,
      altContactPerson: row.alt_contact_person || null,
      altContactMobile: row.alt_contact_mobile || null,
      officeAddress: row.office_address || null,
      officePhone: row.office_phone || null,
      escalationHelpline: row.escalation_helpline || null,
      sourceUrl: row.source_url || null,
      sourceUrl2: row.source_url_2 || null,
      website: row.website || null,
      lastVerified: row.last_verified || null,
    },
  };
}
