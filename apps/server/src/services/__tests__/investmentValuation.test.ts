import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
    buildInvestmentTimelines,
    aggregateTimelines,
    getInvestmentHistoryLogic,
    getPositionsLogic,
} from '../investmentViewService';
import prisma from '../../lib/prisma';
import { CurrencyService } from '../currencyService';

vi.mock('../../lib/prisma', () => ({
    default: {
        investment: { findMany: vi.fn() },
        investmentAccount: { findMany: vi.fn() },
        investmentHistory: { findMany: vi.fn() },
    },
}));

// Kurs stały per waluta (niezależny od daty): PLN 1:1, USD 4.0; domyślnie świeży.
vi.mock('../currencyService', () => ({
    CurrencyService: {
        rateToPlnWithMeta: vi.fn(async (currency: string) => ({
            rate: currency === 'USD' ? 4.0 : 1.0,
            stale: false,
            rateDate: '2026-07-09',
        })),
    },
}));

// Prosta funkcja kursowa dla testów prymitywu (bez prismy).
const constRate = (rates: Record<string, number>) =>
    async (currency: string) => rates[currency] ?? 1;

describe('buildInvestmentTimelines (prymityw wyceny)', () => {
    it('zakup + wpis historii + „dzisiaj" (PLN 1:1)', async () => {
        const today = new Date('2025-07-01T12:00:00Z');
        const timelines = await buildInvestmentTimelines(
            [{ id: 'i1', quantity: 10, purchasePrice: 100, currentValue: 120, currency: 'PLN', purchaseDate: new Date('2025-01-01') }],
            [{ investmentId: 'i1', date: new Date('2025-06-01'), quantity: 10, purchasePrice: 100, marketValue: 110 }],
            constRate({ PLN: 1 }),
            today
        );
        const tl = timelines.get('i1')!;
        expect(tl.get('2025-01-01')).toEqual({ costPLN: 1000, valuePLN: 1000 });
        expect(tl.get('2025-06-01')).toEqual({ costPLN: 1000, valuePLN: 1100 });
        // „dzisiaj": brak wpisu historii na dziś → koszt z zakupu, wartość ze świeżej wyceny.
        expect(tl.get('2025-07-01')).toEqual({ costPLN: 1000, valuePLN: 1200 });
    });

    it('wpis historii na dzisiejszą datę → koszt z wpisu zostaje, wartość nadpisana świeżą wyceną', async () => {
        const today = new Date('2025-07-01T12:00:00Z');
        const timelines = await buildInvestmentTimelines(
            [{ id: 'i1', quantity: 10, purchasePrice: 100, currentValue: 120, currency: 'PLN', purchaseDate: new Date('2025-01-01') }],
            [{ investmentId: 'i1', date: new Date('2025-07-01'), quantity: 10, purchasePrice: 90, marketValue: 105 }],
            constRate({ PLN: 1 }),
            today
        );
        // koszt z wpisu (10*90=900) zostaje; wartość = currentValue*qty = 120*10 = 1200 (nie 1050).
        expect(timelines.get('i1')!.get('2025-07-01')).toEqual({ costPLN: 900, valuePLN: 1200 });
    });

    it('waluta obca: koszt po kursie z dnia zakupu, wartość po kursie bieżącym', async () => {
        const today = new Date('2025-07-01T12:00:00Z');
        // Kurs zależny od daty: USD 4.0 w dniu zakupu, 5.0 dziś.
        const rate = async (currency: string, date: Date) =>
            currency === 'USD' ? (date.getTime() >= new Date('2025-07-01').getTime() ? 5 : 4) : 1;
        const timelines = await buildInvestmentTimelines(
            [{ id: 'i1', quantity: 2, purchasePrice: 100, currentValue: 150, currency: 'USD', purchaseDate: new Date('2025-01-01') }],
            [],
            rate,
            today
        );
        const tl = timelines.get('i1')!;
        // zakup: koszt 2*100*4=800, wartość 2*100*5=1000 (wartość zawsze po kursie bieżącym)
        expect(tl.get('2025-01-01')).toEqual({ costPLN: 800, valuePLN: 1000 });
        // dziś: koszt 2*100*4=800, wartość 2*150*5=1500
        expect(tl.get('2025-07-01')).toEqual({ costPLN: 800, valuePLN: 1500 });
    });
});

describe('aggregateTimelines (carry-forward po osi dat)', () => {
    it('carry-forward przez dni bez wpisów (gęsta oś dzienna)', () => {
        const a: Map<string, { costPLN: number; valuePLN: number }> = new Map([['2025-01-01', { costPLN: 100, valuePLN: 100 }]]);
        const b: Map<string, { costPLN: number; valuePLN: number }> = new Map([['2025-01-03', { costPLN: 50, valuePLN: 60 }]]);
        const out = aggregateTimelines(new Map([['a', a], ['b', b]]), ['2025-01-01', '2025-01-02', '2025-01-03']);
        expect(out).toEqual([
            { date: '2025-01-01', totalCost: 100, totalValue: 100 },
            { date: '2025-01-02', totalCost: 100, totalValue: 100 }, // A przeniesione, B jeszcze nieaktywne
            { date: '2025-01-03', totalCost: 150, totalValue: 160 },
        ]);
    });

    it('pomija dni bez żadnego aktywnego stanu (przed pierwszym zdarzeniem)', () => {
        const a: Map<string, { costPLN: number; valuePLN: number }> = new Map([['2025-01-02', { costPLN: 10, valuePLN: 12 }]]);
        const out = aggregateTimelines(new Map([['a', a]]), ['2025-01-01', '2025-01-02']);
        expect(out).toEqual([{ date: '2025-01-02', totalCost: 10, totalValue: 12 }]);
    });
});

describe('getInvestmentHistoryLogic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (CurrencyService.rateToPlnWithMeta as any).mockImplementation(async (currency: string) => ({
            rate: currency === 'USD' ? 4.0 : 1.0, stale: false, rateDate: '2026-07-09',
        }));
    });

    it('pusty portfel → pusta lista', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([]);
        (prisma.investmentHistory.findMany as any).mockResolvedValue([]);
        expect(await getInvestmentHistoryLogic('u1')).toEqual([]);
    });

    it('zwraca gęsty szereg dzień-po-dniu z carry-forward do dziś', async () => {
        const purchase = new Date();
        purchase.setUTCDate(purchase.getUTCDate() - 2); // 2 dni temu
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 'i1', name: 'Złoto', purchaseDate: purchase, purchasePrice: 100, quantity: 10, currentValue: 120, currency: 'PLN' },
        ]);
        (prisma.investmentHistory.findMany as any).mockResolvedValue([]);

        const res = await getInvestmentHistoryLogic('u1');
        expect(res.length).toBe(3); // dziś-2, dziś-1, dziś
        expect(res[0].totalValue).toBe(1000); // zakup: 10*100
        expect(res[1].totalValue).toBe(1000); // carry-forward
        expect(res[2].totalValue).toBe(1200); // dziś: 10*120
    });
});

// ─── INWARIANT (regresja I2): ostatni punkt wykresu == KPI wartości bieżącej ──
describe('inwariant wykres == KPI (getInvestmentHistoryLogic vs getPositionsLogic)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (CurrencyService.rateToPlnWithMeta as any).mockImplementation(async (currency: string) => ({
            rate: currency === 'USD' ? 4.0 : 1.0, stale: false, rateDate: '2026-07-09',
        }));
        (prisma.investmentAccount.findMany as any).mockResolvedValue([]); // brak gotówki
    });

    it('ostatni totalValue == totals.currentValuePLN na tych samych danych (mix walut)', async () => {
        const investments = [
            { id: 'i1', name: 'Złoto', type: 'GOLD', currency: 'PLN', quantity: 10, purchasePrice: 100, currentValue: 120, purchaseDate: new Date('2025-01-01'), accountId: 'a1', account: { name: 'XTB' } },
            { id: 'i2', name: 'AAPL', type: 'STOCK', currency: 'USD', quantity: 2, purchasePrice: 100, currentValue: 150, purchaseDate: new Date('2025-02-01'), accountId: 'a2', account: { name: 'Revolut' } },
        ];
        const history = [
            { investmentId: 'i1', date: new Date('2025-03-01'), quantity: 10, purchasePrice: 100, marketValue: 110 },
            { investmentId: 'i2', date: new Date('2025-04-01'), quantity: 2, purchasePrice: 100, marketValue: 130 },
        ];
        (prisma.investment.findMany as any).mockResolvedValue(investments);
        (prisma.investmentHistory.findMany as any).mockResolvedValue(history);

        const positions = await getPositionsLogic('u1');
        const historySeries = await getInvestmentHistoryLogic('u1');

        // Złoto: 10*120*1 = 1200; AAPL: 2*150*4 = 1200 → razem 2400.
        expect(positions.totals.currentValuePLN).toBe(2400);
        expect(historySeries[historySeries.length - 1].totalValue).toBe(positions.totals.currentValuePLN);
    });
});
