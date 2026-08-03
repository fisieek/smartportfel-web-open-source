import { Router } from 'express';
import { submitFeedback, cronReconcileBalances, cronRefreshPrices } from '../controllers/systemController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.post('/feedback', authenticateToken, submitFeedback);
// Zadania okresowe — autoryzacja nagłówkiem Bearer CRON_SECRET wewnątrz handlera
router.get('/cron/reconcile-balances', cronReconcileBalances);
router.get('/cron/refresh-prices', cronRefreshPrices);

export default router;
