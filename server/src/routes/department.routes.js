import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { langQuery, slugParam } from '../validators/common.validator.js';
import {
  listDepartments,
  getDepartment,
  getSuggestedQuestions,
} from '../controllers/department.controller.js';

const router = Router();

router.get('/', validate(langQuery.extend({}).passthrough(), 'query'), listDepartments);
router.get(
  '/:slug',
  validate(slugParam, 'params'),
  validate(langQuery.passthrough(), 'query'),
  getDepartment
);
router.get('/:slug/suggested-questions', validate(slugParam, 'params'), getSuggestedQuestions);

export default router;
