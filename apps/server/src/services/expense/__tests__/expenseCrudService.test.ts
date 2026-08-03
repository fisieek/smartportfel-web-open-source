import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { CurrencyService } from '../../currencyService';
import {
    createExpenseBusinessLogic,
    updateExpenseBusinessLogic,
    deleteExpenseBusinessLogic
} from '../expenseCrudService';
import prisma from '../../../lib/prisma';
import { ValidationError } from '../expenseSchemas';

// Kursy NBP zamockowane: 1 EUR = 4.5 PLN
const RATES: Record<string, number> = { PLN: 1, PKT: 1, EUR: 4.5 };

vi.mock('../../../lib/prisma', () => ({
    default: {
        category: { findFirst: vi.fn(), create: vi.fn() },
        store: { findFirst: vi.fn(), create: vi.fn() },
    },
}));

vi.mock('../../../utils/householdScope', () => ({
    validateTransactionAccess: vi.fn().mockResolvedValue(true),
}));

// runFinancialTransaction wykonuje callback na mockTx ustawianym w beforeEach
let mockTx: any;
vi.mock('../../../utils/financialTransaction', () => ({
    runFinancialTransaction: async (fn: any) => fn(mockTx),
}));

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const makeAccount = (id: string, currency: string, balance: number) => ({
    id,
    currency,
    type: 'STANDARD',
    balance: D(balance),
    balances: [] as any[],
});

const makeTx = (accounts: Record<string, any>) => ({
    personalAccount: {
        findUnique: vi.fn(async ({ where }: any) => accounts[where.id] ?? null),
        update: vi.fn(async () => ({})),
    },
    accountBalance: {
        upsert: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
    },
    savingsAccount: { update: vi.fn(async () => ({})) },
    investmentAccount: { update: vi.fn(async () => ({})) },
    investment: { update: vi.fn(async () => ({})) },
    savingsGoal: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    category: { findFirst: vi.fn(async () => null) },
    expense: {
        create: vi.fn(async ({ data }: any) => ({ id: 'exp-1', ...data })),
        findFirst: vi.fn(async () => null),
        update: vi.fn(async ({ data }: any) => data),
        delete: vi.fn(async () => ({})),
    },
    planItem: { updateMany: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
});

const updatesFor = (tx: any, accountId: string) =>
    tx.personalAccount.update.mock.calls
        .filter((c: any) => c[0].where.id === accountId)
        .map((c: any) => c[0].data);

const upsertsFor = (tx: any, accountId: string, currency: string) =>
    tx.accountBalance.upsert.mock.calls
        .filter((c: any) => {
            const key = c[0].where.personalAccountId_currency;
            return key.personalAccountId === accountId && key.currency === currency;
        })
        .map((c: any) => c[0]);

describe('expenseCrudService — transfery i przewalutowania między walutami', () => {
    const userId = 'user-1';
    let accounts: Record<string, any>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(CurrencyService, 'getExchangeRate').mockImplementation(
            async (currency: string) => {
                const rate = RATES[currency];
                if (rate === undefined) throw new Error(`Brak kursu dla ${currency} w teście`);
                return rate;
            }
        );
        accounts = {
            'acc-pln': makeAccount('acc-pln', 'PLN', 1000),
            'acc-eur': makeAccount('acc-eur', 'EUR', 500),
        };
        mockTx = makeTx(accounts);
    });

    describe('createExpenseBusinessLogic — internal_transfer PLN → konto EUR', () => {
        const data = {
            type: 'internal_transfer',
            amount: 100,
            currency: 'PLN',
            date: '2026-06-01',
            personalAccountId: 'acc-pln',
            toPersonalAccountId: 'acc-eur',
        };

        it('obciąża konto źródłowe bez konwersji (ta sama waluta)', async () => {
            await createExpenseBusinessLogic(userId, data);

            const srcUpdates = updatesFor(mockTx, 'acc-pln');
            expect(srcUpdates).toHaveLength(1);
            expect(srcUpdates[0].balance.decrement.equals(D(100))).toBe(true);

            const srcUpserts = upsertsFor(mockTx, 'acc-pln', 'PLN');
            expect(srcUpserts).toHaveLength(1);
            expect(srcUpserts[0].update.balance.decrement.equals(D(100))).toBe(true);
        });

        it('uznaje konto docelowe kwotą przeliczoną na walutę konta (100 PLN = 22.22 EUR)', async () => {
            await createExpenseBusinessLogic(userId, data);

            const dstUpdates = updatesFor(mockTx, 'acc-eur');
            expect(dstUpdates).toHaveLength(1);
            const expected = D(100).mul(D(RATES.PLN)).div(D(RATES.EUR));
            expect(dstUpdates[0].balance.increment.equals(expected)).toBe(true);
        });

        it('aktualizuje AccountBalance konta docelowego w walucie transakcji', async () => {
            await createExpenseBusinessLogic(userId, data);

            const dstUpserts = upsertsFor(mockTx, 'acc-eur', 'PLN');
            expect(dstUpserts).toHaveLength(1);
            expect(dstUpserts[0].update.balance.increment.equals(D(100))).toBe(true);
            expect(dstUpserts[0].create.balance.equals(D(100))).toBe(true);
        });
    });

    describe('createExpenseBusinessLogic — exchange 450 PLN → 100 EUR', () => {
        const data = {
            type: 'exchange',
            amount: 450,
            currency: 'PLN',
            targetAmount: 100,
            targetCurrency: 'EUR',
            date: '2026-06-01',
            personalAccountId: 'acc-pln',
        };

        beforeEach(() => {
            (prisma.category.findFirst as any).mockResolvedValue({ id: 99, name: 'Przewalutowanie' });
            (prisma.store.findFirst as any).mockResolvedValue({ id: 'store-1' });
        });

        it('obciąża stronę źródłową i uznaje stronę docelową na saldzie głównym', async () => {
            await createExpenseBusinessLogic(userId, data);

            const updates = updatesFor(mockTx, 'acc-pln');
            expect(updates).toHaveLength(2);
            expect(updates[0].balance.decrement.equals(D(450))).toBe(true);
            // 100 EUR = 450 PLN na koncie prowadzonym w PLN
            expect(updates[1].balance.increment.equals(D(100).mul(D(RATES.EUR)))).toBe(true);
        });

        it('aktualizuje AccountBalance dla obu walut', async () => {
            await createExpenseBusinessLogic(userId, data);

            const plnUpserts = upsertsFor(mockTx, 'acc-pln', 'PLN');
            expect(plnUpserts).toHaveLength(1);
            expect(plnUpserts[0].update.balance.decrement.equals(D(450))).toBe(true);

            const eurUpserts = upsertsFor(mockTx, 'acc-pln', 'EUR');
            expect(eurUpserts).toHaveLength(1);
            expect(eurUpserts[0].update.balance.increment.equals(D(100))).toBe(true);
        });
    });

    describe('createExpenseBusinessLogic — plnAmount i link do pozycji planu', () => {
        const base = {
            type: 'expense',
            amount: 100,
            currency: 'EUR',
            date: '2026-06-01',
            personalAccountId: 'acc-eur',
        };

        it('zapisuje plnAmount po kursie z daty (100 EUR × 4.5 = 450) + originalAmount/exchangeRate', async () => {
            const expense: any = await createExpenseBusinessLogic(userId, base);
            expect(expense.plnAmount.equals(D(450))).toBe(true);
            expect(expense.originalAmount.equals(D(100))).toBe(true);
            expect(expense.exchangeRate.equals(D(4.5))).toBe(true);
            expect(expense.currency).toBe('EUR');
        });

        it('nie linkuje pozycji planu, gdy nie podano linkPlanItemId', async () => {
            await createExpenseBusinessLogic(userId, base);
            expect(mockTx.planItem.update).not.toHaveBeenCalled();
        });

        it('linkuje pozycję planu w tej samej transakcji, gdy podano linkPlanItemId', async () => {
            await createExpenseBusinessLogic(userId, base, { linkPlanItemId: 'plan-item-1' });
            expect(mockTx.planItem.update).toHaveBeenCalledWith({
                where: { id: 'plan-item-1' },
                data: { isDone: true, linkedRealExpenseId: 'exp-1' }
            });
        });
    });

    describe('updateExpenseBusinessLogic — zmiana kwoty transferu PLN → konto EUR', () => {
        const oldExpense = {
            id: 'exp-1',
            userId,
            type: 'internal_transfer',
            amount: D(100),
            currency: 'PLN',
            plnAmount: D(100),
            exchangeRate: null,
            transactionDate: new Date('2026-06-01'),
            personalAccountId: 'acc-pln',
            toPersonalAccountId: 'acc-eur',
            fromSavingsAccountId: null,
            savingsAccountId: null,
            investmentAccountId: null,
            investmentId: null,
            savingsGoalId: null,
            categoryId: null,
            targetAmount: null,
            targetCurrency: null,
            description: 'Przelew wewnętrzny',
            store: null,
            storeId: null,
            note: null,
            isRecurring: false,
            recurrenceInterval: null,
            recurrenceEndDate: null,
        };

        beforeEach(() => {
            mockTx.expense.findFirst.mockResolvedValue(oldExpense);
            mockTx.expense.update.mockImplementation(async ({ data }: any) => ({ ...oldExpense, ...data }));
        });

        it('cofa i ponownie księguje stronę docelową z konwersją oraz AccountBalance', async () => {
            await updateExpenseBusinessLogic(userId, 'exp-1', { amount: 200 });

            const dstUpdates = updatesFor(mockTx, 'acc-eur');
            expect(dstUpdates).toHaveLength(2);
            // revert starej kwoty: -100 PLN w EUR
            expect(dstUpdates[0].balance.decrement.equals(D(100).div(D(RATES.EUR)))).toBe(true);
            // księgowanie nowej kwoty: +200 PLN w EUR
            expect(dstUpdates[1].balance.increment.equals(D(200).div(D(RATES.EUR)))).toBe(true);

            const dstUpserts = upsertsFor(mockTx, 'acc-eur', 'PLN');
            expect(dstUpserts).toHaveLength(2);
            expect(dstUpserts[0].update.balance.decrement.equals(D(100))).toBe(true);
            expect(dstUpserts[1].update.balance.increment.equals(D(200))).toBe(true);
        });
    });

    describe('deleteExpenseBusinessLogic — usunięcie transferu EUR z konta PLN na konto EUR', () => {
        const expense = {
            id: 'exp-1',
            userId,
            type: 'internal_transfer',
            amount: D(100),
            currency: 'EUR',
            transactionDate: new Date('2026-06-01'),
            personalAccountId: 'acc-pln',
            toPersonalAccountId: 'acc-eur',
            fromSavingsAccountId: null,
            savingsAccountId: null,
            investmentAccountId: null,
            investmentId: null,
            savingsGoalId: null,
            targetAmount: null,
            targetCurrency: null,
        };

        beforeEach(() => {
            mockTx.expense.findFirst.mockResolvedValue(expense);
            // Źródło miało zaksięgowane 100 EUR w AccountBalance
            accounts['acc-pln'].balances = [{ currency: 'EUR', balance: D(100) }];
        });

        it('cofa obie strony transferu z konwersją i aktualizuje AccountBalance', async () => {
            await deleteExpenseBusinessLogic(userId, 'exp-1');

            // Źródło (PLN): zwrot 100 EUR = +450 PLN, AccountBalance EUR +100
            const srcUpdates = updatesFor(mockTx, 'acc-pln');
            expect(srcUpdates).toHaveLength(1);
            expect(srcUpdates[0].balance.increment.equals(D(100).mul(D(RATES.EUR)))).toBe(true);

            const srcUpserts = upsertsFor(mockTx, 'acc-pln', 'EUR');
            expect(srcUpserts).toHaveLength(1);
            expect(srcUpserts[0].update.balance.increment.equals(D(100))).toBe(true);

            // Cel (EUR): cofnięcie uznania -100 EUR, AccountBalance EUR -100
            const dstUpdates = updatesFor(mockTx, 'acc-eur');
            expect(dstUpdates).toHaveLength(1);
            expect(dstUpdates[0].balance.decrement.equals(D(100))).toBe(true);

            const dstUpserts = upsertsFor(mockTx, 'acc-eur', 'EUR');
            expect(dstUpserts).toHaveLength(1);
            expect(dstUpserts[0].update.balance.decrement.equals(D(100))).toBe(true);

            expect(mockTx.expense.delete).toHaveBeenCalledWith({ where: { id: 'exp-1' } });
        });
    });

    describe('updateExpenseBusinessLogic — kontrakt wejścia (Zod, etap 4b)', () => {
        // Prosty stary wydatek (wpływ) na koncie PLN z ustawioną kategorią
        const oldIncome = {
            id: 'exp-1',
            userId,
            type: 'income',
            amount: D(100),
            currency: 'PLN',
            plnAmount: D(100),
            exchangeRate: null,
            transactionDate: new Date('2026-06-01'),
            personalAccountId: 'acc-pln',
            toPersonalAccountId: null,
            fromSavingsAccountId: null,
            savingsAccountId: null,
            investmentAccountId: null,
            investmentId: null,
            savingsGoalId: null,
            categoryId: 5,
            targetAmount: null,
            targetCurrency: null,
            description: 'Wpływ',
            store: null,
            storeId: null,
            note: null,
            isRecurring: false,
            recurrenceInterval: null,
            recurrenceEndDate: null,
        };

        beforeEach(() => {
            mockTx.expense.findFirst.mockResolvedValue(oldIncome);
            mockTx.expense.update.mockImplementation(async ({ data }: any) => ({ ...oldIncome, ...data }));
        });

        const lastUpdateData = () => mockTx.expense.update.mock.calls[0][0].data;

        it('kwota nie-liczba → ValidationError (było 500)', async () => {
            await expect(updateExpenseBusinessLogic(userId, 'exp-1', { amount: 'abc' }))
                .rejects.toThrow('Kwota musi być liczbą');
        });

        it('zły interwał cykliczności → ValidationError (było 500)', async () => {
            await expect(updateExpenseBusinessLogic(userId, 'exp-1', { recurrenceInterval: 'WEEKLY' }))
                .rejects.toThrow('Nieprawidłowy interwał cykliczności (dozwolone: MONTHLY, ANNUALLY)');
        });

        it('waluta 4-literowa → ValidationError', async () => {
            await expect(updateExpenseBusinessLogic(userId, 'exp-1', { currency: 'EURO' }))
                .rejects.toThrow(ValidationError);
        });

        it('NOT_FOUND (brak wydatku) nie jest mapowany na ValidationError', async () => {
            mockTx.expense.findFirst.mockResolvedValueOnce(null);
            await expect(updateExpenseBusinessLogic(userId, 'brak', { amount: 50 }))
                .rejects.toThrow('NOT_FOUND');
        });

        it('semantyka PARTIAL: brak categoryId → zachowuje starą wartość', async () => {
            await updateExpenseBusinessLogic(userId, 'exp-1', { amount: 150 });
            expect(lastUpdateData().categoryId).toBe(5);
        });

        it('semantyka PARTIAL: categoryId=null → czyści (null)', async () => {
            await updateExpenseBusinessLogic(userId, 'exp-1', { amount: 150, categoryId: null });
            expect(lastUpdateData().categoryId).toBeNull();
        });

        it('coerce: kwota jako string "150.25" → Decimal bez utraty precyzji', async () => {
            await updateExpenseBusinessLogic(userId, 'exp-1', { amount: '150.25' });
            expect(lastUpdateData().amount.equals(D('150.25'))).toBe(true);
        });
    });
});
