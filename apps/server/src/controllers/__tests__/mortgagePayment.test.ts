import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { createPayment } from '../mortgageController';
import prisma from '../../lib/prisma';
import { updateAccountBalance } from '../../utils/balanceUpdater';

// $transaction odpala callback z klientem transakcyjnym — podajemy mock tx
vi.mock('../../lib/prisma', () => {
    const tx = {
        mortgagePayment: { create: vi.fn() },
        mortgage: { update: vi.fn() }
    };
    return {
        default: {
            mortgage: { findFirst: vi.fn() },
            $transaction: vi.fn(async (fn: any) => fn(tx)),
            __tx: tx
        }
    };
});

vi.mock('../../utils/balanceUpdater', () => ({
    updateAccountBalance: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../lib/reportError', () => ({
    captureServerError: vi.fn()
}));

const userId = 'user-123';
const mortgageId = 'm-1';
const accountId = 'acc-1';

const tx = () => (prisma as any).__tx;

const makeReq = (body: any): Partial<Request> => ({
    body,
    params: { id: mortgageId } as any,
    // @ts-expect-error - test injection
    user: { userId }
});

const makeRes = (): Partial<Response> & { _status?: number; _json?: any } => {
    const res: any = {};
    res.status = vi.fn().mockImplementation((s: number) => { res._status = s; return res; });
    res.json = vi.fn().mockImplementation((j: any) => { res._json = j; return res; });
    return res;
};

const mockMortgage = (currentBalance: number) => {
    (prisma as any).mortgage.findFirst.mockResolvedValue({
        id: mortgageId,
        userId,
        currentBalance: new Decimal(currentBalance),
        personalAccountId: accountId
    });
    tx().mortgagePayment.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'p-1', ...data }));
    tx().mortgage.update.mockResolvedValue({});
};

describe('createPayment — walidacja (B7)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('404 gdy kredyt nie istnieje', async () => {
        (prisma as any).mortgage.findFirst.mockResolvedValue(null);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 2500 }) as Request, res as Response);
        expect(res._status).toBe(404);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 przy kwotach ujemnych — brak zapisu', async () => {
        mockMortgage(100000);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: -3000, principalAmount: -2500 }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(res._json.error).toMatch(/dodatnie/i);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 przy kwocie zerowej', async () => {
        mockMortgage(100000);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 0, principalAmount: 0 }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 gdy część kapitałowa > kwoty raty (regresja ujemnych odsetek)', async () => {
        mockMortgage(100000);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 25000 }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(res._json.error).toMatch(/przekracza/i);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 przy wartościach nienumerycznych', async () => {
        mockMortgage(100000);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 'abc', principalAmount: 'xyz' }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 przy dacie z przyszłości', async () => {
        mockMortgage(100000);
        const res = makeRes();
        const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 2500, paymentDate: future }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(res._json.error).toMatch(/przyszło/i);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('400 gdy kredyt jest już spłacony (saldo <= 0)', async () => {
        mockMortgage(0);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 2500 }) as Request, res as Response);
        expect(res._status).toBe(400);
        expect(res._json.error).toMatch(/spłacony/i);
        expect(tx().mortgagePayment.create).not.toHaveBeenCalled();
    });

    it('happy path: 201, odsetki = rata − kapitał, decrement = kapitał, saldo konta − rata', async () => {
        mockMortgage(100000);
        const res = makeRes();
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 2500 }) as Request, res as Response);

        expect(res._status).toBe(201);
        const createArg = tx().mortgagePayment.create.mock.calls[0][0];
        expect(Number(createArg.data.interestAmount)).toBe(500); // 3000 - 2500
        expect(Number(createArg.data.principalAmount)).toBe(2500);

        const updateArg = tx().mortgage.update.mock.calls[0][0];
        expect(Number(updateArg.data.currentBalance.decrement)).toBe(2500);

        const balArg = (updateAccountBalance as any).mock.calls[0][1];
        expect(Number(balArg.amount)).toBe(3000);
        expect(balArg.type).toBe('expense');
        expect(res._json.clamped).toBe(false);
    });

    it('auto-przycięcie nadpłaty: kapitał = rata > saldo → principal = saldo, odsetki 0, rata przycięta, clamped', async () => {
        mockMortgage(2000); // pozostało 2000
        const res = makeRes();
        // nadpłata 2500 (cały kapitał) domykająca kredyt z saldem 2000
        await createPayment(makeReq({ totalAmount: 2500, principalAmount: 2500 }) as Request, res as Response);

        expect(res._status).toBe(201);
        const createArg = tx().mortgagePayment.create.mock.calls[0][0];
        expect(Number(createArg.data.principalAmount)).toBe(2000); // przycięte do salda
        expect(Number(createArg.data.interestAmount)).toBe(0);     // nadpłata → ZERO odsetek (nie fantomowe 500)
        expect(Number(createArg.data.totalAmount)).toBe(2000);     // rata też przycięta do realnie spłaconej kwoty

        const updateArg = tx().mortgage.update.mock.calls[0][0];
        expect(Number(updateArg.data.currentBalance.decrement)).toBe(2000); // saldo → 0, nie ujemne

        const balArg = (updateAccountBalance as any).mock.calls[0][1];
        expect(Number(balArg.amount)).toBe(2000); // konto obciążone realnie spłaconą kwotą, nie 2500
        expect(res._json.clamped).toBe(true);
    });

    it('auto-przycięcie ostatniej raty: kapitał > saldo, ale rata > kapitał → odsetki ZACHOWANE', async () => {
        mockMortgage(2000); // pozostało 2000
        const res = makeRes();
        // rata 3000, kapitał 2500 (odsetki 500), ale saldo tylko 2000
        await createPayment(makeReq({ totalAmount: 3000, principalAmount: 2500 }) as Request, res as Response);

        expect(res._status).toBe(201);
        const createArg = tx().mortgagePayment.create.mock.calls[0][0];
        expect(Number(createArg.data.principalAmount)).toBe(2000); // przycięte do salda
        expect(Number(createArg.data.interestAmount)).toBe(500);   // 500 zachowane (nie zawyżone do 1000)
        expect(Number(createArg.data.totalAmount)).toBe(2500);     // 3000 − nadwyżka 500

        const balArg = (updateAccountBalance as any).mock.calls[0][1];
        expect(Number(balArg.amount)).toBe(2500); // konto: kapitał 2000 + odsetki 500
        expect(res._json.clamped).toBe(true);
    });
});
