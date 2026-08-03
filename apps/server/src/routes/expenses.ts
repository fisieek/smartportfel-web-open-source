import { Router } from 'express';
import { getExpenses, createExpense, deleteExpense, getDashboardSummary, updateExpense, getExpenseFilters, recategorizeAllExpenses, getAvailableMonths, updateExpenseCategory, updateExpenseStore, getExchangeRateHandler, getMobileDashboardSummary } from '../controllers/expenseController';
import { bulkCreateExpenses } from '../controllers/bulkExpenseController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken); // Protect all expense routes

router.get('/', getExpenses);
router.get('/summary', getDashboardSummary);
router.get('/summary/mobile', getMobileDashboardSummary);
router.get('/filters', getExpenseFilters);
router.get('/available-months', getAvailableMonths);
router.get('/exchange-rate', getExchangeRateHandler);
router.post('/', createExpense);
router.post('/bulk', bulkCreateExpenses);
router.put('/:id', updateExpense);
router.patch('/:id/category', updateExpenseCategory);
router.patch('/:id/store', updateExpenseStore);
// router.post('/recategorize', recategorizeAllExpenses);
router.delete('/:id', deleteExpense);

export default router;
