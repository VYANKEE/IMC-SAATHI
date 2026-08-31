import * as repo from '../repositories/department.repository.js';
import { ApiError } from '../utils/ApiError.js';
import { getSuggestedQuestions } from './suggestedQuestions.service.js';

/**
 * Pick the caller's language out of a { en, hi } object.
 * Falls back to English so a missing Hindi string shows *something* rather
 * than an empty label.
 */
const pick = (obj, lang) => (obj ? (obj[lang] ?? obj.en ?? null) : null);

function toListItem(d, lang) {
  return {
    id: d._id,
    code: d.code,
    slug: d.slug,
    name: pick(d.name, lang),
    description: pick(d.description, lang),
    coverageTier: d.coverageTier,
    isSelectable: d.isSelectable,
  };
}

/**
 * Departments a citizen may pick in the selector.
 *
 * Only tier A and only selectable ones. Tier B departments have a contact but
 * no procedural content — offering them in a selector would invite the
 * assistant to invent a procedure. See docs/00-discovery.md.
 */
export async function listSelectableDepartments(lang = 'en') {
  const rows = await repo.findSelectableDepartments();
  return rows.map((d) => toListItem(d, lang));
}

export async function listAllDepartments(lang = 'en') {
  const rows = await repo.findAllDepartments();
  return rows.map((d) => toListItem(d, lang));
}

export async function getDepartmentBySlug(slug, lang = 'en') {
  const d = await repo.findDepartmentBySlug(slug);
  if (!d) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');

  const contacts = await repo.findContactsForDepartment(d._id);

  return {
    ...toListItem(d, lang),
    responsibilities: pick(d.responsibilities, lang) ?? [],
    officeTiming: d.officeTiming ?? null,
    contacts: contacts.map((c) => ({
      name: c.name,
      designation: c.designation ?? null,
      mobile: c.mobile ?? null,
      isPrimary: c.isPrimary,
    })),
    sourceDocuments: d.sourceDocuments ?? [],
  };
}

/**
 * Real, corpus-grounded example questions for a department -- what the chat
 * demo's "suggested questions" step (public/demo.js) shows after a citizen
 * picks a department. See suggestedQuestions.service.js for why these are
 * derived from actual KB content rather than hand-written.
 */
export async function getSuggestedQuestionsForDepartment(slug, limit = 5) {
  const d = await repo.findDepartmentBySlug(slug);
  if (!d) throw ApiError.notFound('Department not found', 'DEPARTMENT_NOT_FOUND');

  const questions = await getSuggestedQuestions(d.code, limit);
  return { departmentId: d.code, slug: d.slug, questions };
}
