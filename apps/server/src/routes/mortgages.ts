import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getMortgages,
    getMortgage,
    createMortgage,
    updateMortgage,
    deleteMortgage,
    getPayments,
    createPayment,
    deletePayment
} from '../controllers/mortgageController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Mortgage CRUD
router.get('/', getMortgages);
router.get('/:id', getMortgage);
router.post('/', createMortgage);
router.put('/:id', updateMortgage);
router.delete('/:id', deleteMortgage);

// Payment routes
router.get('/:id/payments', getPayments);
router.post('/:id/payments', createPayment);
router.delete('/:id/payments/:paymentId', deletePayment);

export default router;
