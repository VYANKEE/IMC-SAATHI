/**
 * knownUrls.js
 *
 * Static allow-list of official IMC URLs the post-generation fact validator
 * (validate/validateAnswer.js) accepts in a generated answer. docs/03-rag.md's
 * validator step 2 also wants a URL to trace back to "a cited chunk's
 * sourceUrl" -- KnowledgeChunk does not persist a per-chunk sourceUrl today
 * (see src/models/KnowledgeChunk.js), only sourceFile/sourceRowRef, so this
 * list is deliberately the single source of truth for "which URLs are real"
 * rather than a check that gets silently skipped.
 */

export const OFFICIAL_PORTAL_URLS = ['https://imcindore.mp.gov.in/'];

export const ALLOWED_URL_HOSTS = ['imcindore.mp.gov.in', 'www.imcindore.mp.gov.in'];
