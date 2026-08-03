import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { captureServerError } from '../lib/reportError';
import { bulkImportExpensesBusinessLogic } from '../services/expense/expenseImportService';

// Bulk create expenses (import CSV/AI, POST /expenses/bulk).
// Deleguje do serwisu importowego (I8): transakcja per wiersz, przewalutowanie NBP,
// utrzymanie AccountBalance, walidacja właściciela konta — świadomie BEZ guardu limitu
// debetu (import historyczny nie może być odrzucony przez saldo).
export const bulkCreateExpenses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            res.status(400).json({ message: 'Brak danych transakcji' });
            return;
        }

        const { count, skipped } = await bulkImportExpensesBusinessLogic(userId, transactions);

        res.status(201).json({
            message: `Zaimportowano ${count} transakcji`,
            count,
            skipped
        });
    } catch (error: any) {
        if (error?.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do wskazanego konta' });
            return;
        }
        if (error?.message === 'IMPORT_TOO_LARGE') {
            res.status(400).json({ message: 'Zbyt duży import — podziel plik na mniejsze części (limit 1000 wierszy)' });
            return;
        }
        captureServerError(error, req, 'Błąd bulk import:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};
