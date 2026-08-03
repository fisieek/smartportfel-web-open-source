import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getInvestments,
    createInvestment,
    updateInvestment,
    deleteInvestment,
    getInvestmentsSummary,
    bulkUpdateInvestments,
    bulkCreateInvestments,
    clearAccountInvestments,
    getInvestmentHistory,
    getPositions,
    refreshInvestmentPrices,
    sellInvestment,
    getSoldInvestments,
    bulkDeleteInvestments
} from '../controllers/investmentController';

const router = Router();

router.use(authenticateToken);

router.get('/', getInvestments);
router.get('/summary', getInvestmentsSummary);
router.get('/history', getInvestmentHistory);
router.get('/positions', getPositions);
router.get('/sold', getSoldInvestments);
router.post('/', createInvestment);
router.post('/:id/sell', sellInvestment);
router.post('/bulk', bulkCreateInvestments);
router.post('/bulk-update', bulkUpdateInvestments);
router.post('/bulk-delete', bulkDeleteInvestments);
router.post('/refresh-prices', refreshInvestmentPrices);
router.delete('/account/:accountId', clearAccountInvestments);
router.put('/:id', updateInvestment);
router.delete('/:id', deleteInvestment);

export default router;
