import { Zone } from '../models/index.js';

export function findAllZones() {
  return Zone.find({}).sort({ zoneNumber: 1 }).lean();
}

export function findZoneByNumber(zoneNumber) {
  return Zone.findOne({ zoneNumber }).lean();
}

/**
 * Ward -> zone. Uses the multikey index on `wards`.
 *
 * This one query is what turns "ward 47 mein garbage van nahi aa raha" into a
 * real office phone number, instead of a language model trying to remember one.
 */
export function findZoneByWard(wardNumber) {
  return Zone.findOne({ wards: wardNumber }).lean();
}
