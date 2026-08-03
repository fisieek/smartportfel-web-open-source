import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CurrencyService } from '../../currencyService';
import { getDashboardSummaryLogic } from '../expenseViewService';
import prisma from '../../../lib/prisma';

// Regresja B5: wykresy kategorii/kont/wpływów muszą sumować po plnAmount (z fallbackiem
// na amount dla rekordów bez przeliczenia, m.in. importy PLN), a nie nominalnie po amount.

vi.mock('../../../lib/prisma', () => ({
    default: {
        category: { findMany: vi.fn(), findFirst: vi.fn() },
        expense: { findMany: vi.fn(), groupBy: vi.fn() },
        personalAccount: { findMany: vi.fn() },
        savingsAccount: { findMany: vi.fn() },
        investment: { findMany: vi.fn() },
        investmentAccount: { findMany: vi.fn() },
        pPKTransaction: { aggregate: vi.fn() },
    },
}));

describe('getDashboardSummaryLogic — wykresy sumują po plnAmount (B5)', () => {
    // 2 kategorie wydatków, jedna z walutą obcą (USD, plnAmount 450) + wiersz importu (plnAmount null → fallback amount)
    const expenseRows = [
        { categoryId: 1, plnAmount: 100, amount: 100, currency: 'PLN', personalAccount: null, category: { id: 1, name: 'Jedzenie', color: '#f00' } },
        { categoryId: 1, plnAmount: 450, amount: 100, currency: 'USD', personalAccount: null, category: { id: 1, name: 'Jedzenie', color: '#f00' } },
        { categoryId: 2, plnAmount: null, amount: 50, currency: 'PLN', personalAccount: null, category: { id: 2, name: 'Transport', color: '#0f0' } },
    ];
    // Osobny where (bez wykluczania kategorii systemowych) → własny findMany z select
    const accountChartRows = [
        { personalAccountId: 'acc1', plnAmount: 100, amount: 100 },
        { personalAccountId: 'acc2', plnAmount: 450, amount: 100 },
        { personalAccountId: 'acc1', plnAmount: null, amount: 50 },
    ];
    const incomeRows = [
        { categoryId: 10, plnAmount: 200, amount: 200, currency: 'PLN', personalAccount: null },
        { categoryId: 10, plnAmount: 900, amount: 200, currency: 'USD', personalAccount: null },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(CurrencyService, 'getExchangeRate').mockResolvedValue(4.5);

        (prisma.category.findMany as any).mockImplementation(async (args: any) => {
            const w = args?.where ?? {};
            if (w.isSystemCategory) return [];              // systemCategories
            if (w.id) return [{ id: 10, name: 'Pensja', color: '#00f' }]; // incomeCategoryDetails
            return [];
        });
        (prisma.category.findFirst as any).mockResolvedValue({ color: '#ccc', name: 'Inne' });

        (prisma.expense.findMany as any).mockImplementation(async (args: any) => {
            const w = args?.where ?? {};
            if (w.type === 'expense' && w.personalAccountId) return accountChartRows;
            if (w.type === 'expense') return expenseRows;
            if (w.type === 'income') return incomeRows;
            return []; // investment_transfer, recentRaw
        });
        (prisma.expense.groupBy as any).mockResolvedValue([]); // storesStats

        (prisma.personalAccount.findMany as any).mockImplementation(async (args: any) => {
            const w = args?.where ?? {};
            if (w.id) return [{ id: 'acc1', name: 'Konto A' }, { id: 'acc2', name: 'Konto B' }]; // accountDetailsForChart
            return []; // personalAccounts (salda majątku)
        });
        (prisma.savingsAccount.findMany as any).mockResolvedValue([]);
        (prisma.investment.findMany as any).mockResolvedValue([]);
        (prisma.investmentAccount.findMany as any).mockResolvedValue([]);
        (prisma.pPKTransaction.aggregate as any).mockResolvedValue({ _sum: { amount: null } });
    });

    it('categoryStats sumuje po plnAmount (100+450), nie nominalnie (100+100)', async () => {
        const res = await getDashboardSummaryLogic('u1');
        const jedzenie = res.categoryStats.find((c: any) => c.name === 'Jedzenie');
        expect(jedzenie?.amount).toBe(550);
    });

    it('categoryStats liczy wiersz z plnAmount=null przez fallback na amount (nie gubi go)', async () => {
        const res = await getDashboardSummaryLogic('u1');
        const transport = res.categoryStats.find((c: any) => c.name === 'Transport');
        expect(transport?.amount).toBe(50);
        // suma kafelków == total miesiąca (600), a nie nominalne 250
        const sumTiles = res.categoryStats.reduce((s: number, c: any) => s + c.amount, 0);
        expect(sumTiles).toBe(600);
        expect(res.totalExpenses).toBe(600);
    });

    it('expensesByAccount sumuje po plnAmount z fallbackiem (acc1=150, acc2=450)', async () => {
        const res = await getDashboardSummaryLogic('u1');
        const a = res.expensesByAccount.find((x: any) => x.accountName === 'Konto A');
        const b = res.expensesByAccount.find((x: any) => x.accountName === 'Konto B');
        expect(a?.amount).toBe(150);
        expect(b?.amount).toBe(450);
    });

    it('incomeStats sumuje po plnAmount (200+900=1100), nie nominalnie (400)', async () => {
        const res = await getDashboardSummaryLogic('u1');
        const pensja = res.incomeStats.find((c: any) => c.name === 'Pensja');
        expect(pensja?.amount).toBe(1100);
        expect(res.totalIncomes).toBe(1100);
    });
});
