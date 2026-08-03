import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { CurrencyService } from '../../currencyService';
import { createExpenseBusinessLogic } from '../expenseCrudService';
import { ValidationError } from '../expenseSchemas';

// Kursy NBP zamockowane: 1 EUR = 4.5 PLN
const RATES: Record<string, number> = { PLN: 1, PKT: 1, EUR: 4.5 };

vi.mock('../../../lib/prisma', () => ({
    default: {
        category: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
        store: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    },
}));

vi.mock('../../../utils/householdScope', () => ({
    validateTransactionAccess: vi.fn().mockResolvedValue(true),
}));

let mockTx: any;
vi.mock('../../../utils/financialTransaction', () => ({
    runFinancialTransaction: async (fn: any) => fn(mockTx),
}));

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const makeTx = () => ({
    personalAccount: {
        findUnique: vi.fn(async () => ({ id: 'acc-pln', currency: 'PLN', type: 'STANDARD', balance: D(1000) })),
        update: vi.fn(async () => ({})),
    },
    accountBalance: { upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
    savingsAccount: { update: vi.fn(async () => ({})) },
    investmentAccount: { update: vi.fn(async () => ({})) },
    investment: { update: vi.fn(async () => ({})) },
    savingsGoal: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
    category: { findFirst: vi.fn(async () => null) },
    expense: {
        create: vi.fn(async ({ data }: any) => ({ id: 'exp-1', ...data })),
    },
    planItem: { updateMany: vi.fn(async () => ({})), update: vi.fn(async () => ({})) },
});

// Wyciąga `data` z jedynego wywołania expense.create
const createdData = (tx: any) => tx.expense.create.mock.calls[0][0].data;

describe('createExpenseBusinessLogic — kontrakt wejścia (Zod, etap 4a)', () => {
    const userId = 'user-1';

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(CurrencyService, 'getExchangeRate').mockImplementation(async (currency: string) => {
            const rate = RATES[currency];
            if (rate === undefined) throw new Error(`Brak kursu dla ${currency} w teście`);
            return rate;
        });
        mockTx = makeTx();
    });

    // Bazowe wejście: wpływ (pomija sprawdzenie salda) na konto PLN
    const income = (over: Record<string, any> = {}) => ({
        type: 'income',
        amount: 100,
        currency: 'PLN',
        date: '2026-06-01',
        personalAccountId: 'acc-pln',
        ...over,
    });

    describe('odrzucenia zachowują dawne polskie komunikaty', () => {
        it('brak kwoty → „Kwota i data są wymagane"', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ amount: undefined })))
                .rejects.toThrow('Kwota i data są wymagane');
        });

        it('brak daty → „Kwota i data są wymagane"', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ date: undefined })))
                .rejects.toThrow('Kwota i data są wymagane');
        });

        it('kwota 0 (falsy) → „Kwota i data są wymagane" (lustro dawnego !amount)', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ amount: 0 })))
                .rejects.toThrow('Kwota i data są wymagane');
        });

        it('kwota ujemna → „Kwota musi być liczbą większą od zera"', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ amount: -5 })))
                .rejects.toThrow('Kwota musi być liczbą większą od zera');
        });

        it('kwota nie-liczba ("100abc") → „Kwota musi być liczbą większą od zera"', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ amount: '100abc' })))
                .rejects.toThrow('Kwota musi być liczbą większą od zera');
        });

        it('zły interwał cykliczności → komunikat o dozwolonych wartościach', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ recurrenceInterval: 'WEEKLY' })))
                .rejects.toThrow('Nieprawidłowy interwał cykliczności (dozwolone: MONTHLY, ANNUALLY)');
        });

        it('waluta 4-literowa → ValidationError (nie 500)', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ currency: 'EURO' })))
                .rejects.toBeInstanceOf(ValidationError);
        });

        it('błędy walidacji są instancją ValidationError (kontroler → 400)', async () => {
            await expect(createExpenseBusinessLogic(userId, income({ amount: -1 })))
                .rejects.toBeInstanceOf(ValidationError);
        });
    });

    describe('coerce i precyzja', () => {
        it('kwota jako string "100.55" → Decimal 100.55 bez utraty precyzji', async () => {
            await createExpenseBusinessLogic(userId, income({ amount: '100.55' }));
            const data = createdData(mockTx);
            expect(data.amount.equals(D('100.55'))).toBe(true);
            expect(data.plnAmount.equals(D('100.55'))).toBe(true);
        });

        it('kwota jako Prisma.Decimal + data jako Date (kształt z planningControllera)', async () => {
            await createExpenseBusinessLogic(userId, income({ amount: D('100.55'), date: new Date('2026-06-01') }));
            const data = createdData(mockTx);
            expect(data.amount.equals(D('100.55'))).toBe(true);
        });

        it('kwota EUR jako string przelicza plnAmount po kursie (100 × 4.5 = 450)', async () => {
            await createExpenseBusinessLogic(userId, income({ amount: '100', currency: 'EUR' }));
            const data = createdData(mockTx);
            expect(data.plnAmount.equals(D('450'))).toBe(true);
            expect(data.originalAmount.equals(D('100'))).toBe(true);
        });
    });

    describe('stripowanie nieznanych pól', () => {
        it('nieznane pole nie trafia do zapisu ani nie wywala walidacji', async () => {
            await createExpenseBusinessLogic(userId, income({ hackerField: 'DROP TABLE' }));
            const data = createdData(mockTx);
            expect(data).not.toHaveProperty('hackerField');
        });

        it('domyślny type = expense, gdy nie podano', async () => {
            await createExpenseBusinessLogic(userId, {
                amount: 50,
                date: '2026-06-01',
                personalAccountId: 'acc-pln',
            });
            const data = createdData(mockTx);
            expect(data.type).toBe('expense');
        });
    });
});
