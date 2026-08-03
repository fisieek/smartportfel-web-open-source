import { vi, describe, it, expect, beforeEach } from 'vitest';
import { bulkImportExpensesBusinessLogic, MAX_IMPORT_ROWS } from '../expenseImportService';
import prisma from '../../../lib/prisma';
import { updateAccountBalance } from '../../../utils/balanceUpdater';
import { CurrencyService } from '../../../services/currencyService';
import { validateTransactionAccess } from '../../../utils/householdScope';

// $transaction odpala callback z klientem transakcyjnym — podajemy mock tx (jak mortgagePayment.test.ts)
vi.mock('../../../lib/prisma', () => {
    const tx = {
        expense: { create: vi.fn() }
    };
    return {
        default: {
            category: { findFirst: vi.fn() },
            $transaction: vi.fn(async (fn: any) => fn(tx)),
            __tx: tx
        }
    };
});

vi.mock('../../../utils/balanceUpdater', () => ({
    updateAccountBalance: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../../services/currencyService', () => ({
    CurrencyService: { getExchangeRate: vi.fn() }
}));

vi.mock('../../../utils/householdScope', () => ({
    validateTransactionAccess: vi.fn()
}));

const userId = 'user-123';
const accountId = 'acc-1';
const tx = () => (prisma as any).__tx;

const row = (over: Record<string, any> = {}) => ({
    type: 'expense',
    amount: 100,
    date: '2024-03-10T00:00:00.000Z',
    store: 'Biedronka',
    personalAccountId: accountId,
    categoryId: 5,
    ...over
});

beforeEach(() => {
    vi.clearAllMocks();
    (validateTransactionAccess as any).mockResolvedValue(true);
    (prisma as any).category.findFirst.mockResolvedValue({ id: 1 });
    // Domyślny kurs: PLN=1, USD=4.5 (dla testów walutowych)
    (CurrencyService.getExchangeRate as any).mockImplementation((cur: string) =>
        Promise.resolve(cur === 'USD' ? 4.5 : 1)
    );
    tx().expense.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'e-1', ...data }));
});

describe('bulkImportExpensesBusinessLogic (I8)', () => {
    it('happy path PLN — N wierszy, count=N, plnAmount=amount, saldo aktualizowane', async () => {
        const res = await bulkImportExpensesBusinessLogic(userId, [row(), row({ amount: 50 })]);

        expect(res.count).toBe(2);
        expect(res.skipped).toEqual([]);
        const data = tx().expense.create.mock.calls[0][0].data;
        expect(Number(data.amount)).toBe(100);
        expect(Number(data.plnAmount)).toBe(100); // PLN → plnAmount == amount
        expect(data.originalAmount).toBeNull();
        expect(data.exchangeRate).toBeNull();

        const balArg = (updateAccountBalance as any).mock.calls[0][1];
        expect(balArg.personalAccountId).toBe(accountId);
        expect(Number(balArg.amount)).toBe(100);
        expect(balArg.type).toBe('expense');
        expect(balArg.currency).toBe('PLN');
    });

    it('multi-waluta — 100 USD @ 4.5 → plnAmount 450, originalAmount 100, exchangeRate 4.5', async () => {
        const res = await bulkImportExpensesBusinessLogic(userId, [row({ currency: 'usd', amount: 100 })]);

        expect(res.count).toBe(1);
        const data = tx().expense.create.mock.calls[0][0].data;
        expect(data.currency).toBe('USD'); // uppercase
        expect(Number(data.plnAmount)).toBe(450);
        expect(Number(data.originalAmount)).toBe(100);
        expect(Number(data.exchangeRate)).toBe(4.5);
        // saldo aktualizowane w oryginalnej walucie (updateAccountBalance robi konwersję do waluty konta)
        expect((updateAccountBalance as any).mock.calls[0][1].currency).toBe('USD');
    });

    it('BEZ guardu debetu — import spychający saldo poniżej limitu i tak przechodzi (rdzeń I8)', async () => {
        // Duża kwota na koncie o niskim saldzie: brak jakiegokolwiek checkBalanceWithTx w ścieżce.
        const res = await bulkImportExpensesBusinessLogic(userId, [row({ amount: 999999 })]);
        expect(res.count).toBe(1);
        expect(res.skipped).toEqual([]);
        expect(tx().expense.create).toHaveBeenCalledTimes(1);
    });

    it('wiersz bez kwoty/daty → skipped z powodem, reszta zaimportowana', async () => {
        const res = await bulkImportExpensesBusinessLogic(userId, [
            row({ amount: undefined }),        // index 0 — brak kwoty
            row({ amount: -5 }),               // index 1 — kwota niedodatnia
            row({ date: undefined }),          // index 2 — brak daty
            row({ amount: 30 })                // index 3 — OK
        ]);

        expect(res.count).toBe(1);
        expect(res.skipped.map(s => s.index)).toEqual([0, 1, 2]);
        expect(res.skipped[0].reason).toMatch(/kwota/i);
        expect(res.skipped[2].reason).toMatch(/data/i);
        expect(tx().expense.create).toHaveBeenCalledTimes(1);
    });

    it('konto cudzego użytkownika → FORBIDDEN, zero zapisów', async () => {
        (validateTransactionAccess as any).mockResolvedValue(false);
        await expect(bulkImportExpensesBusinessLogic(userId, [row()])).rejects.toThrow('FORBIDDEN');
        expect(tx().expense.create).not.toHaveBeenCalled();
        expect(updateAccountBalance).not.toHaveBeenCalled();
    });

    it('brak kursu dla waluty/daty → ten wiersz skipped, reszta OK', async () => {
        (CurrencyService.getExchangeRate as any).mockImplementation((cur: string) => {
            if (cur === 'XAU') throw new Error('Błąd przewalutowania: Kurs dla waluty XAU jest niedostępny (NBP i cache).');
            return Promise.resolve(1);
        });
        const res = await bulkImportExpensesBusinessLogic(userId, [
            row({ currency: 'XAU' }), // index 0 — brak kursu
            row({ amount: 20 })       // index 1 — OK
        ]);

        expect(res.count).toBe(1);
        expect(res.skipped).toHaveLength(1);
        expect(res.skipped[0].index).toBe(0);
        expect(res.skipped[0].reason).toMatch(/Brak kursu XAU/);
    });

    it('import bez personalAccountId (dane historyczne) — wydatek powstaje, saldo nietknięte', async () => {
        const res = await bulkImportExpensesBusinessLogic(userId, [row({ personalAccountId: null })]);
        expect(res.count).toBe(1);
        const data = tx().expense.create.mock.calls[0][0].data;
        expect(data.personalAccountId).toBeNull();
        expect(data.note).toMatch(/brak przypisanego konta/i);
        expect(updateAccountBalance).not.toHaveBeenCalled();
        expect(validateTransactionAccess).not.toHaveBeenCalled(); // brak kont do walidacji
    });

    it('nieoczekiwany błąd zapisu propaguje (nie jest połykany jako skip)', async () => {
        tx().expense.create.mockRejectedValueOnce(new Error('DB down'));
        await expect(bulkImportExpensesBusinessLogic(userId, [row()])).rejects.toThrow('DB down');
    });

    it('import > limitu wierszy → IMPORT_TOO_LARGE', async () => {
        const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row());
        await expect(bulkImportExpensesBusinessLogic(userId, many)).rejects.toThrow('IMPORT_TOO_LARGE');
        expect(tx().expense.create).not.toHaveBeenCalled();
    });
});
