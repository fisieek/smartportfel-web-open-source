import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { validatePersonalAccountOwnership } from '../utils/ownershipValidator';
import { createExpenseBusinessLogic, deleteExpenseBusinessLogic } from '../services/expense/expenseCrudService';
import { ValidationError } from '../services/expense/expenseSchemas';
import {
    getMonthlyPlanLogic,
    updatePlanItemLogic,
    deletePlanItemLogic,
    createAdhocPlanItemLogic
} from '../services/planningService';
import { captureServerError } from '../lib/reportError';

export const getMonthlyPlan = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const { month, year } = req.query;
        if (!month || !year) {
            res.status(400).json({ message: 'Miesiąc i rok są wymagane' });
            return;
        }

        const result = await getMonthlyPlanLogic(userId, parseInt(month as string), parseInt(year as string));
        res.json(result);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania planu miesięcznego:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const markItemAsPaid = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params; // plan item id
        const { date, personalAccountId: overrideAccountId } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const planItem = await prisma.planItem.findUnique({
            where: { id },
            include: {
                recurringExpense: true,
                plan: true // 🔐 Include plan to verify ownership
            }
        });

        if (!planItem) {
            res.status(404).json({ message: 'Nie znaleziono pozycji planu' });
            return;
        }

        // 🔐 SECURITY: Verify the plan belongs to the authenticated user
        if (planItem.plan.userId !== userId) {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
            return;
        }

        // 🔐 SECURITY: Validate overrideAccountId belongs to user
        if (overrideAccountId) {
            const isOwner = await validatePersonalAccountOwnership(overrideAccountId, userId);
            if (!isOwner) {
                res.status(403).json({ message: 'Brak dostępu do wybranego konta' });
                return;
            }
        }

        // Dane wydatku w polach serwisu (uwaga: `date`, nie `transactionDate`).
        let data: any;

        if (planItem.recurringExpenseId && planItem.recurringExpense) {
            const template = planItem.recurringExpense;
            data = {
                amount: template.amount,
                currency: template.currency,
                description: template.description,
                store: template.store,
                storeId: template.storeId,
                date: date || new Date(),
                type: template.type,
                categoryId: template.categoryId,
                personalAccountId: overrideAccountId || template.personalAccountId,
                isRecurring: false
            };
        } else {
            // One-time plan item (no template)
            data = {
                amount: planItem.amount,
                currency: planItem.currency,
                description: planItem.name,
                store: planItem.name, // Usually name is used as store for ad-hoc
                storeId: planItem.storeId,
                date: date || new Date(),
                type: planItem.type || 'expense',
                categoryId: planItem.categoryId,
                personalAccountId: overrideAccountId || planItem.personalAccountId,
                isRecurring: false,
                note: planItem.note
            };
        }

        if (!data.personalAccountId) {
            res.status(400).json({ message: 'Musisz wybrać konto, aby opłacić wydatek' });
            return;
        }

        // Serwis liczy plnAmount po kursie NBP, aktualizuje salda (z AccountBalance)
        // i — dzięki linkPlanItemId — oznacza pozycję planu jako opłaconą W SWOJEJ transakcji.
        const expense = await createExpenseBusinessLogic(userId, data, { linkPlanItemId: id });
        const updatedItem = await prisma.planItem.findUnique({ where: { id } });

        res.json({ planItem: updatedItem, expense });
    } catch (error: any) {
        if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do wybranego konta lub zasobu' });
        } else if (error instanceof ValidationError) {
            res.status(400).json({ message: error.message });
        } else if (error.message && (error.message.includes('limit debetu') || error.message.includes('Niewystarczające środki'))) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd oznaczania jako opłacone:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const linkTransactionToItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params; // plan item id
        const { expenseId } = req.body;

        // 🔐 SECURITY: Require authentication
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        // 🔐 SECURITY: Verify planItem belongs to user's plan
        const planItem = await prisma.planItem.findUnique({
            where: { id },
            include: { plan: true }
        });

        if (!planItem) {
            res.status(404).json({ message: 'Nie znaleziono pozycji planu' });
            return;
        }

        if (planItem.plan.userId !== userId) {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
            return;
        }

        // 🔐 SECURITY: Verify expense belongs to user
        const expense = await prisma.expense.findFirst({
            where: { id: expenseId, userId }
        });

        if (!expense) {
            res.status(403).json({ message: 'Brak dostępu do tej transakcji' });
            return;
        }

        const updatedItem = await prisma.planItem.update({
            where: { id },
            data: {
                isDone: true,
                linkedRealExpenseId: expenseId
            }
        });

        res.json(updatedItem);
    } catch (error) {
        captureServerError(error, req, 'Błąd łączenia transakcji:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const unlinkItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const planItem = await prisma.planItem.findUnique({
            where: { id },
            include: { plan: true } // 🔐 Include plan to verify ownership
        });

        if (!planItem || !planItem.linkedRealExpenseId) {
            res.status(404).json({ message: 'Nie znaleziono pozycji lub brak powiązanej transakcji' });
            return;
        }

        // 🔐 SECURITY: Verify the plan belongs to the authenticated user
        if (planItem.plan.userId !== userId) {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
            return;
        }

        // Odwrócenie sald deleguje do serwisu wydatków (runFinancialTransaction:
        // Serializable + retry P2034, konwersja walut, AccountBalance, guardy debetu).
        // Serwis odpina też pozycję planu w tej samej transakcji (updateMany
        // po linkedRealExpenseId → isDone:false, linkedRealExpenseId:null).
        try {
            await deleteExpenseBusinessLogic(userId, planItem.linkedRealExpenseId);
        } catch (error: any) {
            if (error.message === 'NOT_FOUND') {
                // Wiszący link (wydatek już usunięty inną ścieżką) — tylko odepnij pozycję.
                await prisma.planItem.update({
                    where: { id },
                    data: { isDone: false, linkedRealExpenseId: null }
                });
            } else {
                throw error;
            }
        }

        const updatedItem = await prisma.planItem.findUnique({ where: { id } });
        res.json(updatedItem);
    } catch (error: any) {
        if (error.message && (error.message.includes('limit debetu') || error.message.includes('Niewystarczające środki'))) {
            res.status(400).json({ message: error.message });
        } else {
            captureServerError(error, req, 'Błąd odłączania pozycji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const togglePlanItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const { isDone } = req.body;

        // 🔐 SECURITY: Require authentication
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        // 🔐 SECURITY: Verify planItem belongs to user's plan
        const planItem = await prisma.planItem.findUnique({
            where: { id },
            include: { plan: true }
        });

        if (!planItem) {
            res.status(404).json({ message: 'Nie znaleziono pozycji planu' });
            return;
        }

        if (planItem.plan.userId !== userId) {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
            return;
        }

        const item = await prisma.planItem.update({
            where: { id },
            data: { isDone }
        });

        res.json(item);
    } catch (error) {
        captureServerError(error, req, 'Błąd aktualizacji pozycji planu:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const updatePlanItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const { amount, currency, updateFuture } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const updatedItem = await updatePlanItemLogic(userId, id, { amount, currency, updateFuture });
        res.json(updatedItem);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Nie znaleziono pozycji' });
        } else if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
        } else {
            captureServerError(error, req, 'Błąd aktualizacji kwoty:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const deletePlanItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const { deleteFuture } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const result = await deletePlanItemLogic(userId, id, deleteFuture);
        res.json(result);
    } catch (error: any) {
        if (error.message === 'NOT_FOUND') {
            res.status(404).json({ message: 'Nie znaleziono pozycji' });
        } else if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do tej pozycji planu' });
        } else {
            captureServerError(error, req, 'Błąd usuwania pozycji:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};

export const createAdhocPlanItem = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const newItem = await createAdhocPlanItemLogic(userId, req.body);
        res.json(newItem);
    } catch (error: any) {
        if (error.message === 'FORBIDDEN') {
            res.status(403).json({ message: 'Brak dostępu do wybranego konta' });
        } else {
            captureServerError(error, req, 'Błąd tworzenia planu ad-hoc:');
            res.status(500).json({ message: 'Błąd serwera' });
        }
    }
};
