import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { getGamification, postSeen } from '../controllers/gamificationController';

const router = Router();

router.get('/', authenticateToken, getGamification);
router.post('/seen', authenticateToken, postSeen);

export default router;
