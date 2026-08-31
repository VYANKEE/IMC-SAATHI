/**
 * topicMap.js
 *
 * The classifier needs to know, for each *known* raw source file, which
 * department it belongs to and how it should be processed. This is not
 * something you can reliably infer from file content alone (a CSV of
 * Q/A pairs doesn't say "I am about Fire NOC" in a machine-readable way),
 * so — same spirit as server/data/seeds/*.json — we hand-maintain a small
 * lookup table instead of guessing.
 *
 * `topicKey` groups files that cover the *same* subject in different
 * formats (e.g. Fire_NOC.csv and Fire_NOC.docx). When more than one file
 * shares a topicKey, the ingestion pipeline keeps only the highest-priority
 * format (see FORMAT_PRIORITY below) and records the rest as
 * "superseded" in the ingestion report — this is what stops the same FAQ
 * being embedded twice under two different wordings.
 *
 * kind:
 *   'facts'        — contacts/zones/helplines. Already served by the
 *                     Phase 2 database layer (Department/Zone/Contact
 *                     repositories). Never chunked, never embedded.
 *   'structured_qa'— a Section/Question/Answer (or similar) table. One
 *                     row = one retrievable unit. Easiest, least error-prone
 *                     shape to chunk.
 *   'wide_dataset' — the 66-row enriched FAQ dataset. Structured like
 *                     structured_qa but department/category/contact come
 *                     from columns on each row rather than this map.
 *   'narrative'    — prose document organised by headings. Needs the
 *                     section chunker, not the Q/A chunker.
 */

// Filenames are matched after normalising: strip extension, lowercase,
// collapse "_(2)"/" (2)" duplicate-export suffixes, apply the alias below.
const FILENAME_ALIASES = {
  // Genuine spelling inconsistency in the source folder — same document.
  imc_saath_sanitation1: 'imc_saathi_sanitation1',
};

export const FORMAT_PRIORITY = ['csv', 'pdf', 'docx'];

export const TOPICS = {
  department_head_contact_details: { kind: 'facts' },
  'zonal_offices(ward_wise)_and_contact_details': { kind: 'facts' },
  helpline_numbers: { kind: 'facts' },

  electrical_and_mechanical_dept_final: {
    kind: 'narrative',
    department: 'ELECTRICAL',
    category: 'street_light_and_electrical',
  },

  fire_noc: {
    kind: 'structured_qa',
    department: 'FIRE',
    category: 'fire_noc',
  },

  housing_and_rental: {
    kind: 'structured_qa',
    department: 'HOUSING',
    category: 'housing_rental',
    // Data quality register #6 — this content describes OTHER municipalities'
    // portals (Nagar Parishad Makronia / Chhatarpur), generalised into IMC
    // procedure. It must not be served as verified IMC process until a human
    // re-sources it or approves the hedge. The validation gate quarantines it.
    needsReview: true,
    needsReviewReason:
      'Source document cites other municipalities (Nagar Parishad Makronia, Chhatarpur) as if IMC procedure — data-quality-register.md #6',
  },

  imc_saathi_sanitation1: {
    kind: 'structured_qa',
    department: 'SANITATION',
    category: 'sanitation',
  },

  complaint_procedure: {
    kind: 'structured_qa',
    department: 'COMPLAINT_PROCEDURE',
    category: 'complaint_procedure',
  },

  // water_supply.csv originally lumped four unrelated sections (A2 Water
  // Supply, A3 Roads/Streetlights/Potholes, A4 Sewerage & Drainage) into one
  // file mapped wholly to WATER_WORKS. That silently gave WATER_WORKS two
  // other departments' content and left SEWERAGE (a real, coverageTier A,
  // isSelectable department per seeds/departments.json) with ZERO chunks
  // ever ingested, despite the classifier being able to route queries to it
  // by name (see classify.department.md's own drainage example) — see
  // docs/11-decisions.md D17. Split into one file per destination department;
  // this file now only holds the genuine A2 Water Supply rows.
  water_supply: {
    kind: 'structured_qa',
    department: 'WATER_WORKS',
    category: 'water_supply',
  },

  sewerage_drainage: {
    kind: 'structured_qa',
    department: 'SEWERAGE',
    category: 'sewer_overflow_and_drainage',
  },

  roads_potholes: {
    kind: 'structured_qa',
    department: 'PWD',
    category: 'roads_potholes',
  },

  streetlight_routing: {
    kind: 'structured_qa',
    department: 'ELECTRICAL',
    category: 'street_light_and_electrical',
  },

  imc_pwd_revenue_chatbot_faq_dataset_updated: {
    kind: 'wide_dataset',
    // department/category come from each row's own columns, not from here.
  },

  imc_pwd_revenue_chatbot_faq_knowledge_base: {
    kind: 'narrative',
    department: null, // mixed PWD/Revenue — left for the classifier to infer per-section
    category: 'pwd_revenue_routing',
  },
};

/**
 * Normalise a raw filename (with extension) down to a topicKey used to
 * detect same-subject / different-format duplicates.
 */
export function topicKeyFor(filename) {
  const stem = filename
    .replace(/\.[^.]+$/, '') // drop extension
    .toLowerCase()
    .replace(/[\s_]*\(1\)$/, '') // "(1)" byte-duplicate exports, not a format dup
    .replace(/[\s_]*\(2\)$/, '') // "_(2)" duplicate-export suffix
    .trim();
  return FILENAME_ALIASES[stem] ?? stem;
}

export function topicFor(filename) {
  const key = topicKeyFor(filename);
  const topic = TOPICS[key];
  if (!topic) {
    return { kind: 'unknown', topicKey: key };
  }
  return { ...topic, topicKey: key };
}
