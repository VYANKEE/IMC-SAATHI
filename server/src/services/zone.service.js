import * as repo from '../repositories/zone.repository.js';
import { ApiError } from '../utils/ApiError.js';

const pick = (obj, lang) => (obj ? (obj[lang] ?? obj.en ?? null) : null);

/**
 * A zone's office phone is only returned when it passed seed-time validation.
 * Zones 10 and 13 in the source document have malformed numbers — those come
 * back as null with a note, never as a number a citizen might dial.
 */
function toZone(z, lang) {
  return {
    zoneNumber: z.zoneNumber,
    name: pick(z.name, lang),
    wards: z.wards,
    officePhone: z.verified ? (z.officePhone ?? null) : null,
    phoneUnverified: !z.verified,
    zonalOfficer: z.zonalOfficer?.name ? z.zonalOfficer : null,
    asstRevenueOfficer: z.asstRevenueOfficer?.name ? z.asstRevenueOfficer : null,
    csiHealth: z.csiHealth?.mobile ? z.csiHealth : null,
  };
}

export async function listZones(lang = 'en') {
  const rows = await repo.findAllZones();
  return rows.map((z) => toZone(z, lang));
}

export async function getZoneByWard(wardNumber, lang = 'en') {
  const z = await repo.findZoneByWard(wardNumber);
  if (!z) {
    throw ApiError.notFound(
      `No zone found for ward ${wardNumber}. IMC wards run from 1 to 85.`,
      'WARD_NOT_FOUND'
    );
  }
  return toZone(z, lang);
}
