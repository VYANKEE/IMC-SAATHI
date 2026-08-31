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

// department and contact are DELIBERATELY not part of this schema. Both are
// 100% deterministic facts already available from facts/lookupFacts.js (the
// database), and asking the LLM to reproduce them was exactly what broke —
// see docs/11-decisions.md D16 Addendum 2: on this hosted model, guided_json
// does not reliably enforce nested-object shape, and department/contact
// came back as an invented, differently-shaped string/object. generateAnswer.js
// attaches both directly from `facts` after generation, never from the LLM.
export const GROUNDED_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    procedureSteps: { type: 'array', items: { type: 'string' } },
    requiredDocuments: { type: 'array', items: { type: 'string' } },
    requiredInformation: { type: 'array', items: { type: 'string' } },
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
