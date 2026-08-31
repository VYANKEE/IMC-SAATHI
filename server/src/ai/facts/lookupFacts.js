/**
 * lookupFacts.js
 *
 * The "database supplies the facts" half of docs/03-rag.md's central split.
 * Given a department code (from the classifier) and an optional ward number
 * (parsed out of the raw query for multi-hop questions), assembles:
 *
 *   - `text`   the VERIFIED FACTS block injected into answer.grounded.md
 *   - `phones` a flat allow-list the post-generation validator checks the
 *              model's answer against (validate/validateAnswer.js step 1)
 *   - `urls`   same, for URLs (step 2)
 *
 * Every DB read here goes through a repository (department.repository.js /
 * zone.repository.js), never a model directly -- see src/models/index.js's
 * own comment on why DB access is repository-only.
 */
import {
  findDepartmentByCode,
  findContactsForDepartment,
} from '../../repositories/department.repository.js';
import { findZoneByWard } from '../../repositories/zone.repository.js';
import { OFFICIAL_PORTAL_URLS } from './knownUrls.js';

function formatContact(contact) {
  const parts = [contact.name];
  if (contact.designation) parts.push(contact.designation);
  const phones = [contact.mobile, contact.officePhone].filter(Boolean);
  if (phones.length) parts.push(phones.join(' / '));
  if (contact.officeAddress) parts.push(contact.officeAddress);
  return parts.join(' — ');
}

function formatZone(zone) {
  const lines = [
    `Zone ${zone.zoneNumber} (${zone.name.en}) — office: ${zone.officePhone || 'not on file'}`,
  ];
  if (zone.zonalOfficer?.name) {
    const mobile = zone.zonalOfficer.mobile ? ` — ${zone.zonalOfficer.mobile}` : '';
    lines.push(`Zonal officer: ${zone.zonalOfficer.name}${mobile}`);
  }
  return lines.join('\n');
}

/**
 * @param {object} [opts]
 * @param {string} [opts.departmentCode] - e.g. 'ELECTRICAL', from the classifier's departmentId.
 * @param {number} [opts.wardNumber] - parsed from the query, for ward -> zone -> contact.
 * @returns {Promise<{department: object|null, zone: object|null, contacts: object[], text: string, phones: string[], urls: string[]}>}
 */
export async function lookupFacts({ departmentCode, wardNumber } = {}) {
  const [department, zone] = await Promise.all([
    departmentCode ? findDepartmentByCode(departmentCode) : null,
    wardNumber ? findZoneByWard(wardNumber) : null,
  ]);

  const contacts = department ? await findContactsForDepartment(department._id) : [];

  const phones = [];
  const sections = [];

  if (department) {
    sections.push(
      `Department: ${department.name.en} (${department.code}), coverage tier ${department.coverageTier}.`
    );
    if (department.officeTiming?.days) {
      const from = department.officeTiming.from || '?';
      const to = department.officeTiming.to || '?';
      sections.push(`Office timing: ${department.officeTiming.days}, ${from}–${to}.`);
    }
  } else if (departmentCode) {
    sections.push(`Department code "${departmentCode}" not found in the department directory.`);
  }

  if (contacts.length) {
    sections.push('Contacts:\n' + contacts.map(formatContact).join('\n'));
    for (const c of contacts) {
      if (c.mobile) phones.push(c.mobile);
      if (c.officePhone) phones.push(c.officePhone);
    }
  } else if (department) {
    sections.push('Contacts: none verified for this department yet.');
  }

  if (zone) {
    sections.push(formatZone(zone));
    if (zone.officePhone) phones.push(zone.officePhone);
    if (zone.zonalOfficer?.mobile) phones.push(zone.zonalOfficer.mobile);
  } else if (wardNumber) {
    sections.push(`Ward ${wardNumber}: no zone found for this ward number.`);
  }

  if (sections.length === 0) {
    sections.push('No verified department or zone facts available for this query.');
  }

  return {
    department,
    zone,
    contacts,
    text: sections.join('\n\n'),
    phones: [...new Set(phones)],
    urls: [...OFFICIAL_PORTAL_URLS],
  };
}
