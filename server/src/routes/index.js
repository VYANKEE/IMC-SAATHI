import { Router } from 'express';
import healthRoutes from './health.routes.js';
import departmentRoutes from './department.routes.js';
import zoneRoutes from './zone.routes.js';

/**
 * Routes are a table of contents for the API — path, middleware order,
 * controller. No logic. As phases land, each new router is mounted here.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/departments', departmentRoutes);
router.use('/zones', zoneRoutes);

// Phase 7 : router.use('/chat', chatRoutes);
// Phase 8 : router.use('/auth', authRoutes);
// Phase 10: router.use('/complaints', complaintRoutes);

export default router;
