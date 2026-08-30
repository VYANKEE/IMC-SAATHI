import { ok } from '../utils/respond.js';
import * as service from '../services/zone.service.js';

export async function listZones(req, res) {
  const data = await service.listZones(req.query.lang);
  return ok(res, { zones: data, count: data.length });
}

export async function getZoneByWard(req, res) {
  const data = await service.getZoneByWard(req.params.wardNumber, req.query.lang);
  return ok(res, data);
}
