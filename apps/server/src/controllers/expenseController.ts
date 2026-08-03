import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';
import { createExpenseBusinessLogic, updateExpenseBusinessLogic, deleteExpenseBusinessLogic } from '../services/expense/expenseCrudService';
import { ValidationError } from '../services/expense/expenseSchemas';
import { getExpensesLogic, getDashboardSummaryLogic, getExpenseFiltersLogic, getAvailableMonthsLogic, getMobileDashboardSummaryLogic } from '../services/expense/expenseViewService';
import { updateExpenseCategoryLogic, updateExpenseStoreLogic, recategorizeAllExpensesLogic } from '../services/expense/expenseMutationService';
import { CurrencyService } from '../services/currencyService';
import { captureServerError } from '../lib/reportError';

// --- VIEW WRAPPERS ---

export const getExpenses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const data = await getExpensesLogic(userId, req.query);
        res.json(data);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania transakcji:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const getDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const data = await getDashboardSummaryLogic(userId);
        res.json(data);
    } catch (error) {
        captureServerError(error, req, 'Błąd dashboardu:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const getExpenseFilters = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const data = await getExpenseFiltersLogic(userId);
        res.json(data);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania filtrów:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const getAvailableMonths = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const data = await getAvailableMonthsLogic(userId);
        res.json(data);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania dostępnych miesięcy:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const getMobileDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const data = await getMobileDashboardSummaryLogic(userId, req.query);
        res.json(data);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania podsumowania dashboardu (mobile):');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};


// --- CRUD WRAPPERS ---

export const createExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const result = await createExpenseBusinessLogic(userId, req.body);
        res.status(201).json(result);
    } catch (error: any) {
        if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do wybranego konta lub zasobu' });
        } else if (error instanceof ValidationError) {
            res.status(400).json({ message: error.message });
        } else if (error.message && (error.message.includes('limit debetu') || error.message.includes('Niewystarczające środki'))) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd tworzenia transakcji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const updateExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const result = await updateExpenseBusinessLogic(userId, id, req.body);
        res.json(result);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Transakcja nie znaleziona' });
        } else if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do wybranego konta lub zasobu' });
        } else if (error instanceof ValidationError) {
            res.status(400).json({ message: error.message });
        } else if (error.message && (error.message.includes('limit debetu') || error.message.includes('Niewystarczające środki'))) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd aktualizacji transakcji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const deleteExpense = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        await deleteExpenseBusinessLogic(userId, id);
        res.status(204).send();
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Transakcja nie znaleziona' });
        } else if (error.message && (error.message.includes('limit debetu') || error.message.includes('Niewystarczające środki'))) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd usuwania transakcji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};


// --- MUTATIONS AND MISC WRAPPERS ---

export const updateExpenseCategory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const { categoryId } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const result = await updateExpenseCategoryLogic(userId, id, categoryId ? Number(categoryId) : null);
        res.json(result);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Transakcja nie znaleziona' });
        } else if (error.message && error.message.includes('debetu')) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd aktualizacji kategorii transakcji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const updateExpenseStore = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const userId = req.user?.userId;
        const { storeId } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        if (!storeId) {
            res.status(400).json({ message: 'storeId jest wymagane' });
            return;
        }

        const result = await updateExpenseStoreLogic(userId, id, String(storeId));
        res.json(result);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Transakcja lub sklep nie znaleziony' });
        } else if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Edycja sklepu dotyczy wyłącznie wydatków' });
        } else {
            captureServerError(error, req, 'Błąd aktualizacji sklepu transakcji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const recategorizeAllExpenses = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const updatedCount = await recategorizeAllExpensesLogic(userId);
        res.json({ message: `Zaktualizowano ${updatedCount} transakcji`, updatedCount });
    } catch (error) {
        captureServerError(error, req, 'Błąd podczas przeliczania kategorii:');
        res.status(500).json({ message: 'Błąd serwera podczas przeliczania kategorii' });
    }
};

export const getExchangeRateHandler = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { currency, date } = req.query;
        if (!currency) {
            res.status(400).json({ error: 'Waluta jest wymagana' });
            return;
        }

        const targetDate = date ? new Date(date as string) : new Date();
        const meta = await CurrencyService.getExchangeRateWithMeta(currency as string, targetDate);
        // Brak kursu nawet w cache (rateDate === null) → 500: klient (CurrencyContext) wraca do PLN.
        if (meta.rateDate === null) {
            res.status(500).json({ error: 'Kurs niedostępny' });
            return;
        }

        // stale = NBP niedostępne, kurs z cache; rateAsOf = data kursu (badge „kurs nieaktualny").
        res.json({ rate: meta.rate, stale: meta.stale, rateAsOf: meta.rateDate });
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania kursu:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
