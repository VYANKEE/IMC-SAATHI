import { ExternalAuthority } from '../models/index.js';

/**
 * Non-IMC authorities (docs/00-discovery.md, docs/03-rag.md). The
 * classifier picks a `key` from this table's `handles` phrases; the answer
 * pipeline then returns this row's phone/note directly — never generates
 * an LLM answer for a non-IMC query, per ExternalAuthority.js's own header
 * comment ("the pipeline answers from here — before retrieval, before the
 * LLM writes anything").
 */
export function findAllExternalAuthorities() {
  return ExternalAuthority.find({ isActive: true }).lean();
}

export function findExternalAuthorityByKey(key) {
  return ExternalAuthority.findOne({ key, isActive: true }).lean();
}
