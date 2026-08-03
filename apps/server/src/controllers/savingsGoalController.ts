import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { CurrencyService } from '../services/currencyService';
import { getSavingsGoalsLogic } from '../services/savingsViewService';
import { captureServerError } from '../lib/reportError';

// Cele są denominowane w PLN — salda kont walutowych konwertujemy kursem NBP
const sumSavingsAccountsPLN = async (accounts: { balance: any; currency?: string | null }[]): Promise<number> => {
    let total = 0;
    const now = new Date();
    for (const acc of accounts) {
        const valuePLN = await CurrencyService.convertSafe(acc.balance, acc.currency || 'PLN', 'PLN', now);
        total += Number(valuePLN);
    }
    return total;
};

// Pobierz wszystkie cele oszczędnościowe użytkownika
export const getSavingsGoals = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        if (!user || !user.userId) {
            return res.status(401).json({ error: 'User ID missing in token' });
        }

        const goalsWithCurrentAmount = await getSavingsGoalsLogic(user.userId);
        res.json(goalsWithCurrentAmount);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania celów:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Utwórz nowy cel
export const createSavingsGoal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, targetAmount, isMain } = req.body;

        if (!name || !targetAmount) {
            return res.status(400).json({ error: 'Nazwa i cel są wymagane' });
        }

        // Sprawdź czy są już jakieś cele
        const existingGoals = await prisma.savingsGoal.findMany({
            where: { userId }
        });

        // Pierwszy cel jest automatycznie główny
        const shouldBeMain = existingGoals.length === 0 || isMain === true;

        // Jeśli nowy ma być główny, usuń status głównego z poprzedniego
        if (shouldBeMain && existingGoals.length > 0) {
            await prisma.savingsGoal.updateMany({
                where: { userId, isMain: true },
                data: { isMain: false }
            });
        }

        const goal = await prisma.savingsGoal.create({
            data: {
                userId,
                name,
                targetAmount: Number(targetAmount),
                allocatedAmount: 0,
                isMain: shouldBeMain
            }
        });

        res.status(201).json(goal);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd tworzenia celu:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Edytuj cel
export const updateSavingsGoal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, targetAmount, isMain, allocatedAmount } = req.body;

        const existing = await prisma.savingsGoal.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Cel nie znaleziony' });
        }

        // Jeśli ustawiamy jako główny, usuń status z poprzedniego
        if (isMain === true && !existing.isMain) {
            await prisma.savingsGoal.updateMany({
                where: { userId, isMain: true, id: { not: id } },
                data: { isMain: false }
            });
        }

        const goal = await prisma.savingsGoal.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(targetAmount !== undefined && { targetAmount: Number(targetAmount) }),
                ...(isMain !== undefined && { isMain }),
                ...(allocatedAmount !== undefined && { allocatedAmount: Number(allocatedAmount) })
            }
        });

        res.json(goal);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd edycji celu:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Usuń cel
export const deleteSavingsGoal = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const existing = await prisma.savingsGoal.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Cel nie znaleziony' });
        }

        // Jeśli usuwamy główny cel, ustaw następny jako główny
        if (existing.isMain) {
            const otherGoal = await prisma.savingsGoal.findFirst({
                where: { userId, id: { not: id } }
            });
            if (otherGoal) {
                await prisma.savingsGoal.update({
                    where: { id: otherGoal.id },
                    data: { isMain: true }
                });
            }
        }

        await prisma.savingsGoal.delete({ where: { id } });
        res.json({ message: 'Cel usunięty' });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd usuwania celu:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Transfer środków między celami
export const transferBetweenGoals = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { fromGoalId, toGoalId, amount } = req.body;

        if (!fromGoalId || !toGoalId || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Nieprawidłowe dane transferu' });
        }

        const fromGoal = await prisma.savingsGoal.findFirst({
            where: { id: fromGoalId, userId }
        });

        const toGoal = await prisma.savingsGoal.findFirst({
            where: { id: toGoalId, userId }
        });

        if (!fromGoal || !toGoal) {
            return res.status(404).json({ error: 'Cel nie znaleziony' });
        }

        // Dla głównego celu - oblicz dostępne środki
        let availableFromMain = 0;
        if (fromGoal.isMain) {
            const savingsAccounts = await prisma.savingsAccount.findMany({
                where: { userId, closedAt: null } as any
            });
            const totalSavings = await sumSavingsAccountsPLN(savingsAccounts);

            const otherGoals = await prisma.savingsGoal.findMany({
                where: { userId, isMain: false }
            });
            const allocatedToOthers = otherGoals.reduce((sum, g) => sum + Number(g.allocatedAmount), 0);
            availableFromMain = totalSavings - allocatedToOthers;
        }

        const availableAmount = fromGoal.isMain ? availableFromMain : Number(fromGoal.allocatedAmount);

        if (amount > availableAmount) {
            return res.status(400).json({ error: 'Niewystarczające środki', available: availableAmount });
        }

        // Transfer: zmniejsz źródło (jeśli nie główny), zwiększ cel
        if (!fromGoal.isMain) {
            await prisma.savingsGoal.update({
                where: { id: fromGoalId },
                data: { allocatedAmount: Number(fromGoal.allocatedAmount) - amount }
            });
        }

        await prisma.savingsGoal.update({
            where: { id: toGoalId },
            data: { allocatedAmount: Number(toGoal.allocatedAmount) + amount }
        });

        res.json({ message: 'Transfer wykonany', amount });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd transferu:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Pobierz historię wpłat/wypłat powiązanych z celem
export const getSavingsGoalTransactions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const goal = await prisma.savingsGoal.findFirst({
            where: { id, userId },
            select: { id: true }
        });
        if (!goal) {
            return res.status(404).json({ error: 'Cel nie znaleziony' });
        }

        const transactions = await prisma.expense.findMany({
            where: { userId, savingsGoalId: id },
            select: {
                id: true,
                type: true,
                amount: true,
                currency: true,
                description: true,
                note: true,
                transactionDate: true
            },
            orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }]
        });

        res.json(transactions);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania historii celu:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
