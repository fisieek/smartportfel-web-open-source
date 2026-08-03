import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { getPositions } from '../investmentController';
import prisma from '../../lib/prisma';
import { CurrencyService } from '../../services/currencyService';

vi.mock('../../lib/prisma', () => ({
    default: {
        investment: { findMany: vi.fn() },
        investmentAccount: { findMany: vi.fn() },
        investmentHistory: { findMany: vi.fn() },
    },
}));

// Kurs: PLN 1:1, USD 4.0 — niezależnie od daty; domyślnie świeży (stale=false).
vi.mock('../../services/currencyService', () => ({
    CurrencyService: {
        rateToPlnWithMeta: vi.fn(async (currency: string) => ({
            rate: currency === 'USD' ? 4.0 : 1.0,
            stale: false,
            rateDate: '2026-07-09',
        })),
    },
}));

let jsonMock: any;
let statusMock: any;
let res: Response;

const makeRes = () => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    return { json: jsonMock, status: statusMock } as any;
};

beforeEach(() => {
    vi.clearAllMocks();
    res = makeRes();
    (prisma.investmentAccount.findMany as any).mockResolvedValue([]);
    (prisma.investmentHistory.findMany as any).mockResolvedValue([]);
});

describe('getPositions', () => {
    it('scala dwa zakupy tego samego aktywa z różnych kont w jedną pozycję', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 'i1', name: 'Złoto', type: 'GOLD', currency: 'PLN', quantity: 10, purchasePrice: 100, currentValue: 120, purchaseDate: new Date('2025-01-01'), accountId: 'a1', account: { name: 'XTB' } },
            { id: 'i2', name: 'Złoto', type: 'GOLD', currency: 'PLN', quantity: 5, purchasePrice: 200, currentValue: 120, purchaseDate: new Date('2025-02-01'), accountId: 'a2', account: { name: 'Revolut' } },
        ]);

        await getPositions({ user: { userId: 'u1' }, query: {} } as any, res);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload.positions).toHaveLength(1);
        const p = payload.positions[0];
        expect(p.name).toBe('Złoto');
        expect(p.totalQuantity).toBe(15);
        // invested = 10*100 + 5*200 = 2000; value = 15*120 = 1800
        expect(p.investedPLN).toBe(2000);
        expect(p.currentValuePLN).toBe(1800);
        expect(p.plPLN).toBe(-200);
        expect(p.avgPricePLN).toBeCloseTo(133.33, 1);
        expect(p.accounts.sort()).toEqual(['Revolut', 'XTB']);
        expect(p.transactionsCount).toBe(2);
    });

    it('scala pozycje o tym samym instrumentId mimo różnych nazw, używając nazwy instrumentu', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 'i1', name: 'Apple Inc. Common Stock (AAPL)', type: 'STOCK', currency: 'USD', quantity: 4, purchasePrice: 100, currentValue: 150, purchaseDate: new Date('2025-01-01'), accountId: 'a1', account: { name: 'XTB' }, instrumentId: 'inst-aapl', instrument: { name: 'Apple Inc.' } },
            { id: 'i2', name: 'Apple Inc. (AAPL)', type: 'STOCK', currency: 'USD', quantity: 1, purchasePrice: 120, currentValue: 150, purchaseDate: new Date('2025-02-01'), accountId: 'a2', account: { name: 'XTB E2E' }, instrumentId: 'inst-aapl', instrument: { name: 'Apple Inc.' } },
        ]);

        await getPositions({ user: { userId: 'u1' }, query: {} } as any, res);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload.positions).toHaveLength(1);
        const p = payload.positions[0];
        expect(p.name).toBe('Apple Inc.'); // kanoniczna nazwa z instrumentu
        expect(p.totalQuantity).toBe(5);
        expect(p.transactionsCount).toBe(2);
    });

    it('przelicza pozycję w USD na PLN (kurs 4.0)', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 'i1', name: 'AAPL', type: 'STOCK', currency: 'USD', quantity: 2, purchasePrice: 100, currentValue: 150, purchaseDate: new Date('2025-01-01'), accountId: 'a1', account: { name: 'XTB' } },
        ]);

        await getPositions({ user: { userId: 'u1' }, query: {} } as any, res);

        const payload = jsonMock.mock.calls[0][0];
        const p = payload.positions[0];
        // invested = 2*100*4 = 800 PLN; value = 2*150*4 = 1200 PLN
        expect(p.currency).toBe('USD');
        expect(p.investedPLN).toBe(800);
        expect(p.currentValuePLN).toBe(1200);
        expect(p.plPLN).toBe(400);
        expect(p.plPct).toBe(50);
        expect(payload.totals.currentValuePLN).toBe(1200);
        expect(CurrencyService.rateToPlnWithMeta).toHaveBeenCalled();
        // Kurs świeży → brak flagi stale
        expect(payload.totals.staleRate).toBeUndefined();
        expect(p.staleRate).toBeUndefined();
    });

    it('kurs z cache (stale) → staleRate na pozycji i totals + rateAsOf', async () => {
        (CurrencyService.rateToPlnWithMeta as any).mockResolvedValue({ rate: 4.0, stale: true, rateDate: '2026-07-07' });
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 'i1', name: 'AAPL', type: 'STOCK', currency: 'USD', quantity: 2, purchasePrice: 100, currentValue: 150, purchaseDate: new Date('2025-01-01'), accountId: 'a1', account: { name: 'XTB' } },
        ]);

        await getPositions({ user: { userId: 'u1' }, query: {} } as any, res);

        const payload = jsonMock.mock.calls[0][0];
        expect(payload.positions[0].staleRate).toBe(true);
        expect(payload.totals.staleRate).toBe(true);
        expect(payload.totals.rateAsOf).toBe('2026-07-07');
        // Mimo stale kwoty liczone po realnym kursie 4.0, nie 1:1
        expect(payload.positions[0].currentValuePLN).toBe(1200);
    });
});
