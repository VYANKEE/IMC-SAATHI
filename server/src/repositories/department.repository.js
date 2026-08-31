import { Department, Contact } from '../models/index.js';

/**
 * All database access for departments and their contacts.
 *
 * Nothing outside this folder touches Mongoose. That is what lets us enforce
 * rules like "never return an unverified contact" in exactly one place.
 */

export function findSelectableDepartments() {
  return Department.find({ isActive: true, isSelectable: true })
    .sort({ displayOrder: 1, 'name.en': 1 })
    .lean();
}

export function findAllDepartments() {
  return Department.find({ isActive: true }).sort({ coverageTier: 1, displayOrder: 1 }).lean();
}

export function findDepartmentBySlug(slug) {
  return Department.findOne({ slug, isActive: true }).lean();
}

/**
 * Contacts for a department.
 *
 * `verified: true` is NOT optional. An unverified row is one whose phone number
 * failed a validation rule at seed time (wrong STD code, wrong digit count, or
 * simply absent from the source document). Those exist for admins to fix — they
 * must never reach a citizen. This is the database half of the guarantee in
 * docs/03-rag.md.
 */
export function findContactsForDepartment(departmentId) {
  return Contact.find({ departmentId, verified: true }).sort({ isPrimary: -1, name: 1 }).lean();
}

/**
 * Lookup by the short code stored on KnowledgeChunk.department (e.g.
 * 'ELECTRICAL') and on validated classifier output — NOT the same as
 * `slug` (URL-friendly, used by the department selector API). This is the
 * join point between "the RAG layer said ELECTRICAL" and "here is that
 * department's real Mongo _id, so we can look up its verified contacts."
 */
export function findDepartmentByCode(code) {
  return Department.findOne({ code, isActive: true }).lean();
}
