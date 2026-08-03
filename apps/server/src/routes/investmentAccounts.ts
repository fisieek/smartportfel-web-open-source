import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getInvestmentAccounts,
    createInvestmentAccount,
    transferToInvestmentAccount,
    deleteInvestmentAccount,
    archiveInvestmentAccount,
    unarchiveInvestmentAccount,
    updateInvestmentAccountBalance,
    getInvestmentAccountContributions
} from '../controllers/investmentAccountController';

const router = Router();

router.use(authenticateToken);

router.get('/', getInvestmentAccounts);
router.get('/:id/contributions', getInvestmentAccountContributions);

router.post('/', createInvestmentAccount);
router.post('/transfer', transferToInvestmentAccount);
router.delete('/:id', deleteInvestmentAccount);
router.patch('/:id/archive', archiveInvestmentAccount);
router.patch('/:id/unarchive', unarchiveInvestmentAccount);
router.put('/:id/balance', updateInvestmentAccountBalance);

export default router;
