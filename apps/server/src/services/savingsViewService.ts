import prisma from '../lib/prisma';
import { CurrencyService } from './currencyService';

/**
 * Logika oszczędności oddzielona od Express — reużywana przez kontrolery i serwer MCP.
 */

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

export const getSavingsSummaryLogic = async (userId: string): Promise<{ total: number; accountsCount: number }> => {
    const accounts = await prisma.savingsAccount.findMany({ where: { userId, closedAt: null } as any });
    const total = await sumSavingsAccountsPLN(accounts);
    return { total, accountsCount: accounts.length };
};

/**
 * Cele oszczędnościowe z policzonym currentAmount (główny cel = suma oszczędności − przypisane do innych).
 * @param opts.seed gdy true (domyślnie, zachowanie web): ustawia główny cel / lazy-seeduje domyślny.
 *                  MCP woła z seed=false, by odczyt nie tworzył danych.
 */
export const getSavingsGoalsLogic = async (userId: string, opts: { seed?: boolean } = {}) => {
    const seed = opts.seed ?? true;

    let goals = await prisma.savingsGoal.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' }
    });

    // Jeśli są cele, ale żaden nie jest główny - ustaw najstarszy jako główny
    if (seed && goals.length > 0 && !goals.some(g => g.isMain)) {
        await prisma.savingsGoal.update({
            where: { id: goals[0].id },
            data: { isMain: true }
        });
        goals[0].isMain = true;
    }

    // Jeśli brak celów - utwórz domyślny jako główny
    if (seed && goals.length === 0) {
        try {
            const defaultGoal = await prisma.savingsGoal.create({
                data: {
                    userId,
                    name: 'Poduszka finansowa',
                    targetAmount: 10000,
                    allocatedAmount: 0,
                    isMain: true
                }
            });
            goals = [defaultGoal];
        } catch (seedError) {
            console.error('Błąd lazy seed:', seedError);
            goals = [];
        }
    }

    const savingsAccounts = await prisma.savingsAccount.findMany({ where: { userId, closedAt: null } as any });
    const totalSavings = await sumSavingsAccountsPLN(savingsAccounts);

    const otherGoals = goals.filter(g => !g.isMain);
    const allocatedToOthers = otherGoals.reduce((sum, g) => sum + Number(g.allocatedAmount), 0);
    const mainGoalCurrentAmount = Math.max(0, totalSavings - allocatedToOthers);

    return goals.map(goal => ({
        ...goal,
        allocatedAmount: Number(goal.allocatedAmount),
        targetAmount: Number(goal.targetAmount),
        currentAmount: goal.isMain ? mainGoalCurrentAmount : Number(goal.allocatedAmount)
    }));
};
