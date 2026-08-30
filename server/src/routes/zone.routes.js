import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { langQuery, wardParam } from '../validators/common.validator.js';
import { listZones, getZoneByWard } from '../controllers/zone.controller.js';

const router = Router();

router.get('/', validate(langQuery.passthrough(), 'query'), listZones);
router.get('/by-ward/:wardNumber', validate(wardParam, 'params'), validate(langQuery.passthrough(), 'query'), getZoneByWard);

export default router;
