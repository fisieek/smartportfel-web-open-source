import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getSavingsGoals,
    createSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    transferBetweenGoals,
    getSavingsGoalTransactions
} from '../controllers/savingsGoalController';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getSavingsGoals);
router.get('/:id/transactions', getSavingsGoalTransactions);
router.post('/', createSavingsGoal);
router.post('/transfer', transferBetweenGoals);
router.patch('/:id', updateSavingsGoal);
router.delete('/:id', deleteSavingsGoal);

export default router;
