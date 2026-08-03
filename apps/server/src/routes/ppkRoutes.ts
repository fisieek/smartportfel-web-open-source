import { Router } from 'express';
import {
    setupPPK,
    getPPKSummary,
    getPPKTransactions,
    getPendingSuggestion,
    confirmSuggestion,
    updatePPKConfig
} from '../controllers/ppkController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

// All PPK routes require authentication
router.use(authenticateToken);

router.post('/setup', setupPPK);
router.put('/config', updatePPKConfig);
router.get('/summary', getPPKSummary);
router.get('/transactions', getPPKTransactions);
router.get('/pending-suggestion', getPendingSuggestion);
router.post('/confirm-suggestion', confirmSuggestion);

export default router;
