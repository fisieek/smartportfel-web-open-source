import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { CurrencyService, RateMeta } from '../currencyService';
import { createPolishDate } from '../../utils/dateHelpers';
import { getHouseholdCoMemberIds } from '../../utils/householdScope';

// ─── Interfejsy publiczne ────────────────────────────────────────────────────

export interface ExpenseFilters {
    personalAccountId?: string;
    month?: string;
    year?: string;
    type?: string;
    isRecurring?: string;
    scope?: 'mine' | 'shared' | 'all'; // widok gospodarstwa: tylko moje / tylko wspólne / wszystko (domyślnie all)
}

/** Minimalny typ wejściowy dla expandTransactions — jawny zamiast Partial<big type> */
export interface TransactionForExpansion {
    id: string;
    type: string;
    transactionDate: Date;
    amount: Prisma.Decimal | null;
    plnAmount?: Prisma.Decimal | null;
    personalAccountId?: string | null;
    fromSavingsAccountId?: string | null;
    toPersonalAccountId?: string | null;
    savingsAccountId?: string | null;
    investmentAccountId?: string | null;
    personalAccount?: Record<string, unknown> | null;
    fromSavingsAccount?: Record<string, unknown> | null;
    toPersonalAccount?: Record<string, unknown> | null;
    savingsAccount?: Record<string, unknown> | null;
    investmentAccount?: Record<string, unknown> | null;
    investment?: Record<string, unknown> | null;
    targetAmount?: Prisma.Decimal | null;
    targetCurrency?: string | null;
    exchangeRate?: Prisma.Decimal | null;
    // Bez index signature — zapobiega rozmyciu transactionDate na 'unknown'
}


// ─── Helper: zakres dat miesiąca ─────────────────────────────────────────────
const getMonthRange = (year: number, month: number): { start: Date; end: Date } => {
    const start = createPolishDate(year, month, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const end = createPolishDate(year, month, lastDay, 23, 59, 59, 999);
    return { start, end };
};

// ─── Rozwijanie transferów na dwa wiersze (widok tabeli) ──────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const expandTransactions = (expenses: TransactionForExpansion[], personalAccountId?: string): any[] => {
    const expandedExpenses: any[] = [];

    expenses.forEach(tx => {
        const isTransfer = tx.type && ['internal_transfer', 'savings_transfer', 'investment_transfer'].includes(tx.type);

        if (!isTransfer) {
            expandedExpenses.push(tx);
            return;
        }

        const isFilterOnSource = !personalAccountId ||
            tx.personalAccountId === personalAccountId ||
            tx.fromSavingsAccountId === personalAccountId;

        if (isFilterOnSource) {
            expandedExpenses.push({
                ...tx,
                id: tx.personalAccountId ? tx.id : `${tx.id}-source`,
                personalAccount: tx.personalAccountId ? tx.personalAccount : tx.fromSavingsAccount,
                _side: 'source',
            });
        }

        const isFilterOnTarget = !personalAccountId ||
            (tx.type === 'internal_transfer' && tx.toPersonalAccountId === personalAccountId) ||
            (tx.type === 'internal_transfer' && tx.savingsAccountId === personalAccountId) ||
            (tx.type === 'internal_transfer' && tx.investmentAccountId === personalAccountId) ||
            (tx.type === 'savings_transfer' && tx.savingsAccountId === personalAccountId) ||
            (tx.type === 'investment_transfer' && tx.investmentAccountId === personalAccountId);

        if (isFilterOnTarget) {
            let targetAccount = null;
            if (tx.type === 'internal_transfer' && tx.toPersonalAccountId) targetAccount = tx.toPersonalAccount;
            else if (tx.type === 'internal_transfer' && tx.savingsAccountId) targetAccount = tx.savingsAccount;
            else if (tx.type === 'internal_transfer' && tx.investmentAccountId) targetAccount = tx.investmentAccount;
            else if (tx.type === 'savings_transfer') targetAccount = tx.savingsAccount;
            else if (tx.type === 'investment_transfer') targetAccount = tx.investmentAccount;

            expandedExpenses.push({
                ...tx,
                id: `${tx.id}-target`,
                _originalId: tx.id,
                _side: 'target',
                amount: tx.amount,
                personalAccount: targetAccount,
            });
        }
    });

    expenses.filter(tx => tx.type === 'exchange').forEach(tx => {
        const sourceIndex = expandedExpenses.findIndex(e => e.id === tx.id);
        if (sourceIndex !== -1) {
            expandedExpenses[sourceIndex] = {
                ...tx,
                _side: 'exchange_source',
            };
        }

        expandedExpenses.push({
            ...tx,
            id: `${tx.id}-target`,
            _originalId: tx.id,
            _side: 'exchange_target',
            amount: tx.targetAmount,
            currency: tx.targetCurrency,
            originalAmount: tx.amount,
            exchangeRate: tx.targetAmount && tx.amount && Number(tx.amount) !== 0 ? Number(tx.targetAmount) / Number(tx.amount) : null,
            // Poprawna konwersja do PLN: targetAmount * kurs wymiany przechowany w rekordzie transakcji
            plnAmount: tx.targetCurrency === 'PLN' ? tx.targetAmount : (tx.targetAmount ? Math.round(Number(tx.targetAmount) * Number(tx.exchangeRate || 1) * 100) / 100 : null)
        });
    });

    return expandedExpenses.sort((a, b) => new Date(a.transactionDate as Date).getTime() < new Date(b.transactionDate as Date).getTime() ? 1 : -1);
};

export const getExpensesLogic = async (userId: string, filters: ExpenseFilters) => {
    const { personalAccountId, month, year, type, isRecurring } = filters;
    const where: any = {};
    const and: any[] = [];

    // Widoczność wg zakresu gospodarstwa (scope): mine / shared / all (domyślnie all).
    // Dla użytkownika spoza gospodarstwa wszystkie zakresy degradują do własnych danych.
    const scope = (filters.scope === 'mine' || filters.scope === 'shared') ? filters.scope : 'all';

    if (scope === 'mine') {
        where.userId = userId;
    } else {
        const coMemberIds = await getHouseholdCoMemberIds(userId);
        const [myAccounts, coShared] = await Promise.all([
            prisma.personalAccount.findMany({ where: { userId }, select: { id: true, isShared: true } }),
            coMemberIds.length > 0
                ? prisma.personalAccount.findMany({ where: { userId: { in: coMemberIds }, isShared: true }, select: { id: true } })
                : Promise.resolve([] as { id: string }[])
        ]);
        const coSharedIds = coShared.map(a => a.id);

        if (scope === 'shared') {
            // Tylko aktywność na wspólnych kontach (moje oznaczone isShared + wspólne współczłonków)
            const sharedSet = [...myAccounts.filter(a => a.isShared).map(a => a.id), ...coSharedIds];
            and.push({
                OR: [
                    { personalAccountId: { in: sharedSet } },
                    { toPersonalAccountId: { in: sharedSet } }
                ]
            });
        } else if (coMemberIds.length > 0) {
            // all + gospodarstwo: własne wpisy + aktywność na moich kontach (też współczłonków
            // na moich wspólnych) + wspólne konta współczłonków
            const accessibleAll = [...myAccounts.map(a => a.id), ...coSharedIds];
            and.push({
                OR: [
                    { userId },
                    { personalAccountId: { in: accessibleAll } },
                    { toPersonalAccountId: { in: accessibleAll } }
                ]
            });
        } else {
            // all bez gospodarstwa = własne (zero zmian zachowania)
            where.userId = userId;
        }
    }

    if (isRecurring !== undefined) {
        where.isRecurring = isRecurring === 'true';
    } else {
        where.isRecurring = false;
    }

    if (personalAccountId) {
        and.push({
            OR: [
                { personalAccountId: personalAccountId as string },
                { toPersonalAccountId: personalAccountId as string },
                { savingsAccountId: personalAccountId as string },
                { investmentId: personalAccountId as string },
                { investmentAccountId: personalAccountId as string },
                { fromSavingsAccountId: personalAccountId as string }
            ]
        });
    }

    if (month && year) {
        const { start, end } = getMonthRange(Number(year), Number(month));
        where.transactionDate = { gte: start, lte: end };
    }

    if (type && type !== 'all') {
        where.type = type as string;
    }

    if (and.length > 0) {
        where.AND = and;
    }

    const expenses = await prisma.expense.findMany({
        where,
        include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            personalAccount: { select: { id: true, name: true, bank: true, type: true, currency: true } },
            fromSavingsAccount: { select: { id: true, name: true, bank: true } },
            toPersonalAccount: { select: { id: true, name: true, bank: true, type: true, currency: true } },
            savingsAccount: { select: { id: true, name: true, bank: true } },
            investment: { select: { id: true, name: true } },
            investmentAccount: { select: { id: true, name: true, provider: true } },
            user: { select: { id: true, username: true } }
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    });

    // Oznaczenie autorstwa dla wpisów na wspólnych kontach (autor ≠ bieżący użytkownik)
    const labeled = expenses.map(e => ({
        ...e,
        authorName: (e as any).user?.username ?? null,
        isFromCoMember: (e as any).userId !== userId
    }));

    return expandTransactions(labeled as any, personalAccountId as string);
};

export const getDashboardSummaryLogic = async (userId: string) => {
    const now = new Date();
    const { start: startOfMonth, end: endOfMonth } = getMonthRange(now.getFullYear(), now.getMonth() + 1);

    const systemCategories = await prisma.category.findMany({
        where: { isSystemCategory: true },
        select: { id: true }
    });
    const systemCategoryIds = systemCategories.map(c => c.id);

    const expenses = await prisma.expense.findMany({
        where: {
            userId,
            type: 'expense',
            isRecurring: false,
            transactionDate: { gte: startOfMonth, lte: now },
            OR: [
                { categoryId: null },
                { categoryId: { notIn: systemCategoryIds } }
            ]
        },
        include: { category: true, personalAccount: true }
    });

    const totalExpenses = expenses.reduce((sum, expense) => {
        if (expense.personalAccount && expense.personalAccount.type && !['BANK', 'CASH'].includes(expense.personalAccount.type)) {
            return sum;
        }
        if (expense.currency === 'PKT') return sum;
        return sum + Number(expense.plnAmount || expense.amount);
    }, 0);

    const incomes = await prisma.expense.findMany({
        where: {
            userId,
            type: 'income',
            isRecurring: false,
            transactionDate: { gte: startOfMonth, lte: now }
        },
        include: { personalAccount: true }
    });

    const totalIncomes = incomes.reduce((sum, income) => {
        if (income.personalAccount && income.personalAccount.type && !['BANK', 'CASH'].includes(income.personalAccount.type)) {
            return sum;
        }
        if (income.currency === 'PKT') return sum;
        return sum + Number(income.plnAmount || income.amount);
    }, 0);

    const monthlyInvestments = await prisma.expense.findMany({
        where: {
            userId,
            type: 'investment_transfer',
            isRecurring: false,
            transactionDate: { gte: startOfMonth, lte: now }
        }
    });

    const totalInvestedThisMonth = monthlyInvestments.reduce((sum, inv) => sum + Number(inv.plnAmount || inv.amount), 0);

    const storesStats = await prisma.expense.groupBy({
        by: ['store'],
        where: {
            userId, type: 'expense', isRecurring: false,
            transactionDate: { gte: startOfMonth, lte: now },
            store: { not: null, notIn: [''] }
        },
        _sum: { plnAmount: true },
        _count: { _all: true }
    });

    let favoriteStore: { name: string | null, total: number, count: number } = { name: null, total: 0, count: 0 };
    if (storesStats.length > 0) {
        const topStore = storesStats.reduce((prev, current) => {
            const prevCount = Number(prev._count._all || 0);
            const currentCount = Number(current._count._all || 0);
            return (prevCount > currentCount) ? prev : current;
        });
        favoriteStore = {
            name: topStore.store,
            total: Number(topStore._sum.plnAmount || 0),
            count: Number(topStore._count._all || 0)
        };
    }

    const recentRaw = await prisma.expense.findMany({
        where: { userId, isRecurring: false, transactionDate: { lte: now } },
        include: {
            category: { select: { id: true, name: true, icon: true, color: true } },
            personalAccount: { select: { id: true, name: true, bank: true, type: true, currency: true } },
            fromSavingsAccount: { select: { id: true, name: true, bank: true } },
            toPersonalAccount: { select: { id: true, name: true, bank: true, type: true, currency: true } },
            savingsAccount: { select: { id: true, name: true, bank: true } },
            investment: { select: { id: true, name: true } }
        },
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        take: 20
    });

    const recentTransactions = expandTransactions(recentRaw).slice(0, 10);

    const inneCategory = await prisma.category.findFirst({ where: { name: 'Inne', userId: null } });
    const fallbackColor = inneCategory?.color || '#ccc';
    const fallbackName = inneCategory?.name || 'Inne';

    // Wykresy sumują w PLN (plnAmount z fallbackiem na amount dla rekordów bez przeliczenia,
    // m.in. importy PLN) — inaczej mieszane waluty rozjeżdżały się z totalem (bug B5).
    // Sumowanie w JS zamiast groupBy(_sum:{amount}): SQL SUM po plnAmount pominąłby NULL-e.

    // Kategorie wydatków — z już pobranej tablicy `expenses` (identyczny where, ma include:category).
    const categoryStatsMap = new Map<number | null, { name: string; amount: number; color: string }>();
    for (const e of expenses) {
        const key = e.categoryId ?? null;
        const value = Number(e.plnAmount || e.amount);
        const existing = categoryStatsMap.get(key);
        if (existing) {
            existing.amount += value;
        } else {
            const category = (e as any).category;
            categoryStatsMap.set(key, {
                name: category ? category.name : fallbackName,
                amount: value,
                color: category ? (category.color || '#ccc') : fallbackColor
            });
        }
    }
    const categoryStats = Array.from(categoryStatsMap.values());

    // Wydatki wg kont — własny where (bez wykluczania kategorii systemowych, inaczej niż `expenses`).
    const expensesForAccountChart = await prisma.expense.findMany({
        where: {
            userId, type: 'expense', isRecurring: false, personalAccountId: { not: null },
            transactionDate: { gte: startOfMonth, lte: now }
        },
        select: { personalAccountId: true, plnAmount: true, amount: true }
    });

    const accountTotals = new Map<string, number>();
    for (const e of expensesForAccountChart) {
        if (!e.personalAccountId) continue;
        accountTotals.set(e.personalAccountId, (accountTotals.get(e.personalAccountId) ?? 0) + Number(e.plnAmount || e.amount));
    }

    const accountIdsForChart = Array.from(accountTotals.keys());
    const accountDetailsForChart = await prisma.personalAccount.findMany({
        where: { id: { in: accountIdsForChart } },
        select: { id: true, name: true }
    });
    const accountMapForChart = new Map(accountDetailsForChart.map(a => [a.id, a]));

    const defaultAccountColors = ['#60A5FA', '#34D399', '#F59E0B', '#A78BFA', '#FB7185', '#38BDF8', '#4ADE80', '#FBBF24'];
    const expensesByAccount = Array.from(accountTotals.entries()).map(([accId, amount], index) => {
        const account = accountMapForChart.get(accId);
        return {
            accountName: account?.name || 'Nieznane konto',
            amount,
            color: defaultAccountColors[index % defaultAccountColors.length]
        };
    });

    // Wpływy wg kategorii — z już pobranej tablicy `incomes` (identyczny where, ma categoryId).
    const incomeTotals = new Map<number | null, number>();
    for (const inc of incomes) {
        const key = inc.categoryId ?? null;
        incomeTotals.set(key, (incomeTotals.get(key) ?? 0) + Number(inc.plnAmount || inc.amount));
    }

    const incomeCategoryIds = Array.from(incomeTotals.keys()).filter(Boolean) as number[];
    const incomeCategoryDetails = await prisma.category.findMany({
        where: { id: { in: incomeCategoryIds } },
        select: { id: true, name: true, color: true }
    });
    const incomeCategoryMap = new Map(incomeCategoryDetails.map(c => [c.id, c]));

    const defaultIncomeColors = ['#4ADE80', '#38BDF8', '#FBBF24', '#A78BFA', '#FB7185', '#34D399'];
    const incomeStats = Array.from(incomeTotals.entries()).map(([categoryId, amount], index) => {
        const category = categoryId ? incomeCategoryMap.get(categoryId) : null;
        return {
            name: category?.name || 'Inne wpływy',
            amount,
            color: category?.color || defaultIncomeColors[index % defaultIncomeColors.length]
        };
    });

    const personalAccounts = await prisma.personalAccount.findMany({
        where: { userId, closedAt: null } as any,
        select: { id: true, name: true, type: true, balance: true, currency: true, balances: { select: { currency: true, balance: true } } }
    });

    // Kursy NBP przez wspólny helper: przy awarii NBP kurs z cache DB (nie 1:1). Śledzimy
    // „stale" i najstarszą użytą datę kursu, by oznaczyć podsumowanie flagą staleRate (bug I2).
    const rateCache = new Map<string, RateMeta>();
    let anyStale = false;
    let oldestRateDate: string | null = null;
    const toPLN = async (amount: number, currency: string | null): Promise<number> => {
        const cur = currency || 'PLN';
        if (cur === 'PLN' || cur === 'PKT') return amount;
        const meta = await CurrencyService.rateToPlnWithMeta(cur, now, rateCache);
        if (meta.stale) {
            anyStale = true;
            if (meta.rateDate && (!oldestRateDate || meta.rateDate < oldestRateDate)) oldestRateDate = meta.rateDate;
        }
        return amount * meta.rate;
    };

    // Suma salda konta w PLN: wszystkie salda per-walutowe, a gdy ich brak — saldo główne w walucie konta
    const accountTotalPLN = async (acc: { balance: any; currency: string | null; balances: { currency: string; balance: any }[] }): Promise<number> => {
        if (acc.balances && acc.balances.length > 0) {
            let sum = 0;
            for (const b of acc.balances) {
                sum += await toPLN(Number(b.balance), b.currency);
            }
            return sum;
        }
        return toPLN(Number(acc.balance), acc.currency);
    };

    const monetaryAccounts = personalAccounts.filter(acc => (!acc.type || acc.type === 'BANK' || acc.type === 'CASH') && acc.currency !== 'PKT');
    let totalPersonalAccounts = 0;
    for (const acc of monetaryAccounts) {
        totalPersonalAccounts += await accountTotalPLN(acc);
    }

    const nonMonetaryAccounts = personalAccounts.filter(acc => (acc.type && !['BANK', 'CASH'].includes(acc.type)) || acc.currency === 'PKT');
    const totalNonMonetaryFunds = nonMonetaryAccounts.reduce((sum, acc) => sum + Number(acc.balance), 0);

    const savingsAccounts = await prisma.savingsAccount.findMany({
        where: { userId, closedAt: null } as any, select: { balance: true, currency: true }
    });
    let totalSavings = 0;
    for (const acc of savingsAccounts) {
        totalSavings += await toPLN(Number(acc.balance), acc.currency);
    }

    // Sprzedane loty i instrumenty z zamkniętych kont nie wchodzą do sumy majątku
    const investments = await prisma.investment.findMany({
        where: { userId, soldAt: null, OR: [{ accountId: null }, { account: { closedAt: null } }] } as any,
        select: { currentValue: true, quantity: true }
    });
    const totalInstruments = investments.reduce((sum, inv) => sum + Number(inv.currentValue) * Number(inv.quantity), 0);

    // Gotówka na kontach inwestycyjnych (equity = instrumenty + gotówka)
    const investmentAccounts = await prisma.investmentAccount.findMany({
        where: { userId, closedAt: null } as any, select: { balance: true, currency: true }
    });
    let totalInvestmentCash = 0;
    for (const acc of investmentAccounts) {
        if (acc.currency === 'PKT') continue;
        totalInvestmentCash += await toPLN(Number(acc.balance), acc.currency);
    }
    const totalInvestments = totalInstruments + totalInvestmentCash;

    // Suma zgromadzona w PPK (wpłaty pracownika, pracodawcy i państwa — zawsze PLN)
    const ppkAgg = await prisma.pPKTransaction.aggregate({
        where: { userId },
        _sum: { amount: true }
    });
    const totalPPK = Number(ppkAgg._sum.amount ?? 0);

    return {
        totalExpenses, totalIncomes, totalPersonalAccounts, totalNonMonetaryFunds,
        totalSavings, totalInvestments, totalInstruments, totalInvestmentCash, totalInvestedThisMonth, favoriteStore,
        totalPPK, recentTransactions, categoryStats, expensesByAccount, incomeStats,
        staleRate: anyStale || undefined,
        rateAsOf: anyStale ? oldestRateDate ?? undefined : undefined
    };
};

export const getExpenseFiltersLogic = async (userId: string) => {
    const dates = await prisma.expense.findMany({
        where: { userId },
        select: { transactionDate: true },
        distinct: ['transactionDate'],
    });

    const monthsSet = new Set<string>();
    dates.forEach(d => {
        const date = new Date(d.transactionDate);
        monthsSet.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
    });

    const availableMonths = Array.from(monthsSet).map(m => {
        const [year, month] = m.split('-');
        return { year: Number(year), month: Number(month) };
    }).sort((a, b) => b.year - a.year || b.month - a.month);

    const [personalAccounts, savingsAccounts, investmentAccounts] = await Promise.all([
        prisma.personalAccount.findMany({ where: { userId }, select: { id: true, name: true, bank: true } }),
        prisma.savingsAccount.findMany({ where: { userId }, select: { id: true, name: true, bank: true } }),
        prisma.investmentAccount.findMany({ where: { userId }, select: { id: true, name: true, provider: true } })
    ]);

    const allAccounts = [
        ...personalAccounts,
        ...savingsAccounts,
        ...investmentAccounts.map(acc => ({ id: acc.id, name: acc.name, bank: acc.provider }))
    ];

    return { availableMonths, personalAccounts: allAccounts };
};

export const getAvailableMonthsLogic = async (userId: string) => {
    const [expenseDates, planItems] = await Promise.all([
        prisma.expense.findMany({
            where: { userId }, select: { transactionDate: true }, distinct: ['transactionDate'],
        }),
        prisma.planItem.findMany({
            where: { plan: { userId }, plannedDate: { not: null } },
            select: { plannedDate: true, plan: { select: { month: true, year: true } } },
        })
    ]);

    const monthsSet = new Set<string>();
    expenseDates.forEach(d => {
        const date = new Date(d.transactionDate);
        monthsSet.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
    });
    planItems.forEach(pi => {
        if (pi.plannedDate) {
            const date = new Date(pi.plannedDate);
            monthsSet.add(`${date.getFullYear()}-${date.getMonth() + 1}`);
        } else if (pi.plan) {
            monthsSet.add(`${pi.plan.year}-${pi.plan.month}`);
        }
    });

    return Array.from(monthsSet).map(m => {
        const [year, month] = m.split('-');
        return { year: Number(year), month: Number(month) };
    }).sort((a, b) => b.year - a.year || b.month - a.month);
};

export const getMobileDashboardSummaryLogic = async (userId: string, filters: ExpenseFilters) => {
    const { month, year } = filters;
    let startOfMonth: Date;
    let endOfMonth: Date;

    if (month && year) {
        const range = getMonthRange(Number(year), Number(month));
        startOfMonth = range.start;
        endOfMonth = range.end;
    } else {
        const now = new Date();
        const range = getMonthRange(now.getFullYear(), now.getMonth() + 1);
        startOfMonth = range.start;
        endOfMonth = range.end;
    }

    const systemCategories = await prisma.category.findMany({
        where: { isSystemCategory: true },
        select: { id: true }
    });
    const systemCategoryIds = systemCategories.map(c => c.id);

    const expenses = await prisma.expense.findMany({
        where: {
            userId, type: 'expense', transactionDate: { gte: startOfMonth, lte: endOfMonth },
            OR: [ { categoryId: null }, { categoryId: { notIn: systemCategoryIds } } ]
        },
        include: { category: true, personalAccount: true }
    });

    const totalExpenses = expenses.reduce((sum, expense) => {
        if (expense.currency === 'PKT') return sum;
        return sum + Number(expense.plnAmount || expense.amount);
    }, 0);

    const incomes = await prisma.expense.findMany({
        where: { userId, type: 'income', transactionDate: { gte: startOfMonth, lte: endOfMonth } },
        include: { personalAccount: true, category: true }
    });

    const totalIncomes = incomes.reduce((sum, income) => {
        if (income.currency === 'PKT') return sum;
        return sum + Number(income.plnAmount || income.amount);
    }, 0);

    const monthlyInvestments = await prisma.expense.findMany({
        where: { userId, type: 'investment_transfer', isRecurring: false, transactionDate: { gte: startOfMonth, lte: endOfMonth } }
    });

    const totalInvestedThisMonth = monthlyInvestments.reduce((sum, inv) => sum + Number(inv.plnAmount || inv.amount), 0);

    const storesStats = await prisma.expense.groupBy({
        by: ['store'],
        where: { userId, type: 'expense', isRecurring: false, transactionDate: { gte: startOfMonth, lte: endOfMonth }, store: { not: null, notIn: [''] } },
        _sum: { plnAmount: true },
        _count: { _all: true }
    });

    let favoriteStore: { name: string | null, total: number, count: number } = { name: null, total: 0, count: 0 };
    if (storesStats.length > 0) {
        const topStore = storesStats.reduce((prev, current) => {
            return (Number(prev._count._all || 0) > Number(current._count._all || 0)) ? prev : current;
        });
        favoriteStore = { name: topStore.store, total: Number(topStore._sum.plnAmount || 0), count: Number(topStore._count._all || 0) };
    }

    const recentRaw = await prisma.expense.findMany({
        where: { userId, isRecurring: false, transactionDate: { gte: startOfMonth, lte: endOfMonth } },
        take: 5,
        orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
        include: { category: true, personalAccount: true, fromSavingsAccount: true, toPersonalAccount: true, savingsAccount: true, investment: true, investmentAccount: true }
    });
    const recentTransactions = expandTransactions(recentRaw);

    const personalAccounts = await prisma.personalAccount.findMany({
        where: { userId, type: { in: ['BANK', 'CASH'] }, currency: { not: 'PKT' }, closedAt: null } as any,
        include: { balances: true }
    });

    let totalPersonalAccounts = 0;
    for (const account of personalAccounts) {
        const accCurrency = account.type === 'LOYALTY_CARD' ? 'PKT' : (account.currency || 'PLN');
        if (accCurrency !== 'PLN' && accCurrency !== 'PKT') {
            const exchangeRate = await CurrencyService.getExchangeRate(accCurrency, new Date());
            totalPersonalAccounts += Number(account.balance) * Number(exchangeRate);
        } else if (accCurrency === 'PLN') {
            totalPersonalAccounts += Number(account.balance);
        }

        for (const b of account.balances) {
            if (b.currency !== accCurrency && b.currency !== 'PKT') {
                const rate = await CurrencyService.getExchangeRate(b.currency, new Date());
                totalPersonalAccounts += Number(b.balance) * Number(rate);
            } else if (b.currency === 'PLN') {
                totalPersonalAccounts += Number(b.balance);
            }
        }
    }

    interface CategoryStat { id: number | string; name: string; color: string; icon: string; total: number; }
    const categoriesMap: Record<number, CategoryStat> = {};
    let otherTotal = 0;
    expenses.forEach(expense => {
        if (expense.currency === 'PKT') return;
        const amount = Number(expense.plnAmount || expense.amount);
        if (expense.category) {
            if (!categoriesMap[expense.category.id]) {
                categoriesMap[expense.category.id] = { id: expense.category.id, name: expense.category.name, color: expense.category.color || '#9CA3AF', icon: expense.category.icon || '📦', total: 0 };
            }
            categoriesMap[expense.category.id].total += amount;
        } else {
            otherTotal += amount;
        }
    });

    const incomeCategoriesMap: Record<string, CategoryStat> = {};
    const defaultIncomeColors = ['#4ADE80', '#38BDF8', '#FBBF24', '#A78BFA', '#FB7185', '#34D399'];
    incomes.forEach(income => {
        if (income.currency === 'PKT') return;
        const amount = Number(income.plnAmount || income.amount);
        const descKey = income.description?.trim() || 'Inne Wpływy';
        const mapKey = `income-${descKey}`;
        if (!incomeCategoriesMap[mapKey]) {
            const colorIdx = Math.abs(descKey.split('').reduce((a: number, c: string) => ((a << 5) - a) + c.charCodeAt(0), 0)) % defaultIncomeColors.length;
            incomeCategoriesMap[mapKey] = { id: mapKey, name: descKey, color: defaultIncomeColors[colorIdx], icon: '💰', total: 0 };
        }
        incomeCategoriesMap[mapKey].total += amount;
    });

    const accountsMap: Record<string, { id: string; name: string; color: string; total: number; }> = {};
    expenses.forEach(expense => {
        if (!expense.personalAccount || expense.currency === 'PKT') return;
        const amount = Number(expense.plnAmount || expense.amount);
        const accId = expense.personalAccount.id;
        if (!accountsMap[accId]) {
            const colorHash = Math.abs(accId.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0));
            const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
            accountsMap[accId] = { id: accId, name: expense.personalAccount.name, color: colors[colorHash % colors.length], total: 0 };
        }
        accountsMap[accId].total += amount;
    });

    const categoryStats = Object.values(categoriesMap);
    if (otherTotal > 0) categoryStats.push({ id: 'other', name: 'Inne', color: '#9CA3AF', icon: '📦', total: otherTotal });
    categoryStats.sort((a, b) => b.total - a.total);

    const incomeStats = Object.values(incomeCategoriesMap).sort((a, b) => b.total - a.total);
    if (incomeStats.length === 0 && totalIncomes > 0) incomeStats.push({ id: 'income-generic', name: 'Wpływy', color: '#10B981', icon: '💰', total: totalIncomes });

    const expensesByAccount = Object.values(accountsMap).sort((a, b) => b.total - a.total);

    return { totalExpenses, totalIncomes, totalInvestedThisMonth, totalPersonalAccounts, favoriteStore, categoryStats, incomeStats, expensesByAccount, recentTransactions };
};
