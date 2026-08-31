/**
 * Barrel export for the Mongoose models.
 *
 * Nothing outside src/repositories/ should import these. Repositories own all
 * database access — that is what makes the citizen-scoping invariant
 * enforceable in one place. See docs/09-repo-structure.md.
 */
export { Department } from './Department.js';
export { Zone } from './Zone.js';
export { Contact } from './Contact.js';
export { ExternalAuthority } from './ExternalAuthority.js';
export { KnowledgeChunk } from './KnowledgeChunk.js';
export { localizedString, localizedStringOptional } from './localizedString.js';
