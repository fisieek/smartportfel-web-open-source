import { Router } from 'express';
import { getMonthlyPlan, togglePlanItem, markItemAsPaid, linkTransactionToItem, unlinkItem, updatePlanItem, deletePlanItem, createAdhocPlanItem } from '../controllers/planningController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/monthly-plan', getMonthlyPlan);
router.post('/toggle-item/:id', togglePlanItem);
router.post('/mark-paid/:id', markItemAsPaid);
router.post('/link-transaction/:id', linkTransactionToItem);
router.post('/unlink-item/:id', unlinkItem);
router.post('/update-item/:id', updatePlanItem);
router.post('/delete-item/:id', deletePlanItem);
router.post('/create-adhoc', createAdhocPlanItem);

export default router;
