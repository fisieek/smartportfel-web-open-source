import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { settleInterest, getSettlements } from '../savingsController';
import prisma from '../../lib/prisma';

vi.mock('../../utils/ownershipValidator', () => ({
    validateSavingsAccountOwnership: vi.fn().mockResolvedValue(true)
}));

// runFinancialTransaction wywołuje callback z klientem transakcyjnym — podajemy mock prisma
vi.mock('../../utils/financialTransaction', () => ({
    runFinancialTransaction: vi.fn(async (fn: any) => fn((prisma as any)))
}));

vi.mock('../../services/currencyService', () => ({
    CurrencyService: { convertSafe: vi.fn().mockResolvedValue(new Decimal(0)) },
    SUPPORTED_CURRENCIES: ['PLN', 'EUR', 'USD']
}));

vi.mock('../../lib/prisma', () => ({
    default: {
        savingsAccount: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        expense: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
            create: vi.fn()
        }
    }
}));

const userId = 'user-123';
const accountId = 'acc-1';

const makeReq = (body: any, params: any = { id: accountId }): Partial<Request> => ({
    body,
    params,
    // @ts-expect-error - test injection
    user: { userId }
});

const makeRes = (): Partial<Response> & { _status?: number; _json?: any } => {
    const res: any = {};
    res.status = vi.fn().mockImplementation((s: number) => { res._status = s; return res; });
    res.json = vi.fn().mockImplementation((j: any) => { res._json = j; return res; });
    return res;
};

describe('settleInterest', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma as any).expense.findFirst.mockResolvedValue(null); // brak duplikatu domyślnie
        (prisma as any).savingsAccount.findUnique.mockResolvedValue({
            id: accountId, balance: new Decimal(1000), currency: 'PLN'
        });
        (prisma as any).savingsAccount.update.mockResolvedValue({});
        (prisma as any).expense.create.mockResolvedValue({});
    });

    it('normalne dopisanie: zwiększa saldo i tworzy wpis "Miesięczne odsetki"', async () => {
        const req = makeReq({ amount: 50, date: '2026-04-01' });
        const res = makeRes();

        await settleInterest(req as Request, res as Response);

        expect((prisma as any).savingsAccount.update).toHaveBeenCalledTimes(1);
        const updateArg = (prisma as any).savingsAccount.update.mock.calls[0][0];
        expect(new Decimal(updateArg.data.balance).toNumber()).toBe(1050); // 1000 + 50

        const createArg = (prisma as any).expense.create.mock.calls[0][0];
        expect(createArg.data.description).toBe('Miesięczne odsetki');
        expect(new Decimal(createArg.data.amount).toNumber()).toBe(50);
        expect(res._json.message).toMatch(/dopisane/i);
    });

    it('markOnly: NIE zmienia salda, tworzy marker 0 PLN "rozliczone poza aplikacją"', async () => {
        const req = makeReq({ markOnly: true, date: '2026-04-01' });
        const res = makeRes();

        await settleInterest(req as Request, res as Response);

        // saldo nietknięte
        expect((prisma as any).savingsAccount.update).not.toHaveBeenCalled();

        const createArg = (prisma as any).expense.create.mock.calls[0][0];
        expect(new Decimal(createArg.data.amount).toNumber()).toBe(0);
        expect(createArg.data.description).toBe('Odsetki rozliczone poza aplikacją');
        expect(createArg.data.type).toBe('interest');
        expect(res._json.message).toMatch(/oznaczony/i);
    });

    it('guard duplikatu: gdy miesiąc już rozliczony → 400, brak zapisu', async () => {
        (prisma as any).expense.findFirst.mockResolvedValue({ id: 'existing' });
        const req = makeReq({ amount: 50, date: '2026-04-01' });
        const res = makeRes();

        await settleInterest(req as Request, res as Response);

        expect(res._status).toBe(400);
        expect((prisma as any).expense.create).not.toHaveBeenCalled();
        expect((prisma as any).savingsAccount.update).not.toHaveBeenCalled();
    });

    it('brak kwoty bez markOnly → 400', async () => {
        const req = makeReq({ date: '2026-04-01' });
        const res = makeRes();

        await settleInterest(req as Request, res as Response);

        expect(res._status).toBe(400);
        expect((prisma as any).expense.create).not.toHaveBeenCalled();
    });
});

describe('getSettlements', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
        (prisma as any).savingsAccount.findUnique.mockResolvedValue({
            id: accountId, currency: 'PLN', createdAt: new Date('2026-04-10T00:00:00Z')
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('zwraca status miesięcy od założenia do bieżącego (wyłącznie), najnowsze na górze', async () => {
        // Kwiecień rozliczony realnie (10 PLN), maj brak wpisu
        (prisma as any).expense.findMany.mockResolvedValue([
            { transactionDate: new Date('2026-04-20T00:00:00Z'), amount: new Decimal(10) }
        ]);
        const req = makeReq({}, { id: accountId });
        const res = makeRes();

        await getSettlements(req as Request, res as Response);

        const months = res._json.months;
        expect(months.map((m: any) => m.month)).toEqual(['2026-05', '2026-04']); // czerwiec wykluczony
        expect(months[0]).toMatchObject({ month: '2026-05', status: 'pending', amount: null, markedManually: false });
        expect(months[1]).toMatchObject({ month: '2026-04', status: 'settled', markedManually: false });
        expect(months[1].amount).toBe(10);
    });

    it('marker 0 PLN → status settled + markedManually=true', async () => {
        (prisma as any).expense.findMany.mockResolvedValue([
            { transactionDate: new Date('2026-05-05T00:00:00Z'), amount: new Decimal(0) }
        ]);
        const req = makeReq({}, { id: accountId });
        const res = makeRes();

        await getSettlements(req as Request, res as Response);

        const may = res._json.months.find((m: any) => m.month === '2026-05');
        expect(may).toMatchObject({ status: 'settled', amount: 0, markedManually: true });
    });
});
