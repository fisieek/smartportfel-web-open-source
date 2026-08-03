import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getSavingsAccounts,
    getSavingsAccountById,
    createSavingsAccount,
    updateSavingsAccount,
    deleteSavingsAccount,
    archiveSavingsAccount,
    unarchiveSavingsAccount,
    getSavingsSummary,
    getRealGainsForecast,
    settleDeposit,
    settleInterest,
    getSettlements
} from '../controllers/savingsController';

const router = Router();

router.use(authenticateToken);

// Important: Specific routes must come before parameterized routes
router.get('/summary', getSavingsSummary);
router.get('/:id/forecast', getRealGainsForecast); // Put it higher up
router.get('/:id/settlements', getSettlements);
router.get('/:id', getSavingsAccountById);

router.get('/', getSavingsAccounts);
router.post('/', createSavingsAccount);
router.post('/:id/settle', settleDeposit);
router.post('/:id/settle-interest', settleInterest);
router.put('/:id', updateSavingsAccount);
router.patch('/:id/archive', archiveSavingsAccount);
router.patch('/:id/unarchive', unarchiveSavingsAccount);
router.delete('/:id', deleteSavingsAccount);

export default router;
