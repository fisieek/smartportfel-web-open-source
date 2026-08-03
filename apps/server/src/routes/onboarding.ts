import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { getStatus, updateStatus } from '../controllers/onboardingController';

const router = Router();

router.get('/status', authenticateToken, getStatus);
router.post('/status', authenticateToken, updateStatus);

export default router;
