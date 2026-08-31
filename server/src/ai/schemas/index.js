/**
 * schemas/index.js
 *
 * JSON Schemas passed to NVIDIA's `nvext.guided_json` (nvidiaChat.js) —
 * these are the actual generation-time contract, not just documentation.
 * Kept separate from the prompt .md files because a schema is code
 * (referenced by both the classifier and the generator) while a prompt is
 * prose; docs/03-rag.md's schema tables are the human-readable version of
 * these.
 */

export const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    departmentId: { type: ['string', 'null'] },
    categoryId: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    alternatives: { type: 'array', items: { type: 'string' }, maxItems: 2 },
    isOutOfScope: { type: 'boolean' },
    isNonIMC: { type: 'boolean' },
    nonImcAuthorityKey: { type: ['string', 'null'] },
  },
  required: [
    'departmentId',
    'confidence',
    'alternatives',
    'isOutOfScope',
    'isNonIMC',
    'nonImcAuthorityKey',
  ],
};

export const CLARIFY_SCHEMA = {
  type: 'object',
  properties: {
    question: { type: 'string' },
  },
  required: ['question'],
};

export const GROUNDED_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    procedureSteps: { type: 'array', items: { type: 'string' } },
    requiredDocuments: { type: 'array', items: { type: 'string' } },
    requiredInformation: { type: 'array', items: { type: 'string' } },
    department: {
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id', 'name'],
    },
    contact: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        designation: { type: 'string' },
        phone: { type: 'string' },
        office: { type: 'string' },
      },
    },
    officeTiming: { type: ['string', 'null'] },
    fees: { type: ['string', 'null'] },
    escalation: { type: ['string', 'null'] },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chunkId: { type: 'string' },
          document: { type: 'string' },
          section: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    suggestedActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          departmentId: { type: 'string' },
          categoryId: { type: 'string' },
        },
      },
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['answer', 'sources', 'confidence'],
};
