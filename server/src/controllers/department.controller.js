import { ok } from '../utils/respond.js';
import * as service from '../services/department.service.js';

export async function listDepartments(req, res) {
  const { lang } = req.query;
  const all = req.query.all === 'true';
  const data = all
    ? await service.listAllDepartments(lang)
    : await service.listSelectableDepartments(lang);
  return ok(res, { departments: data, count: data.length });
}

export async function getDepartment(req, res) {
  const data = await service.getDepartmentBySlug(req.params.slug, req.query.lang);
  return ok(res, data);
}
