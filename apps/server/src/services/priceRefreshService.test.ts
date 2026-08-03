import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: mock prisma musi istnieć ZANIM vi.mock (hoistowane) go użyje.
const prismaMock = vi.hoisted(() => ({
    instrument: { findMany: vi.fn() },
    investment: { findMany: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) },
    investmentHistory: { create: vi.fn(() => ({ _op: 'history' })) },
    instrumentPriceHistory: { upsert: vi.fn(() => ({ _op: 'price' })) },
    $transaction: vi.fn(async (ops: any[]) => ops),
}));

vi.mock('./marketData', () => ({
    getQuote: vi.fn(async (symbol: string) => (symbol === 'GOOGL' ? { close: 123 } : null)),
    hasLiveQuotes: vi.fn(() => true),
}));
vi.mock('./marketData/nbpGoldClient', () => ({
    getGoldPrice: vi.fn(async () => 333),
}));
vi.mock('../lib/prisma', () => ({ default: prismaMock, prisma: prismaMock }));
// Grzanie kursów w globalnej ścieżce nie może bić do realnego NBP w teście.
vi.mock('./currencyService', () => ({
    CurrencyService: { getExchangeRateWithMeta: vi.fn().mockResolvedValue({ rate: 4, stale: false, rateDate: '2026-07-09' }) },
    SUPPORTED_CURRENCIES: ['PLN', 'USD', 'EUR'],
}));

import { refreshPrices } from './priceRefreshService';
import { getQuote, hasLiveQuotes } from './marketData';

beforeEach(() => {
    vi.clearAllMocks();
    // Domyślnie testujemy instancję Z dostawcą; wariant „bez" ustawia to jawnie.
    vi.mocked(hasLiveQuotes).mockReturnValue(true);
});

describe('refreshPrices', () => {
    it('odświeża cenę instrumentu i aktualizuje jego pozycje', async () => {
        prismaMock.instrument.findMany.mockResolvedValue([{ id: 'i1', symbol: 'GOOGL' }] as any);
        prismaMock.investment.findMany.mockResolvedValue([{ id: 'inv1', quantity: '2', purchasePrice: '10' }] as any);

        const res = await refreshPrices();

        expect(res.instrumentsRefreshed).toBe(1);
        expect(res.investmentsUpdated).toBe(1);
        expect(res.failures).toHaveLength(0);
        expect(prismaMock.investment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ instrumentId: 'i1' }), data: { currentValue: 123 } })
        );
    });

    it('pomija obligacje (where type != BOND) i pozycje bez symbolu', async () => {
        prismaMock.instrument.findMany.mockResolvedValue([
            { id: 'i1', symbol: 'GOOGL' },
            { id: 'i2', symbol: '' },
        ] as any);
        prismaMock.investment.findMany.mockResolvedValue([{ id: 'inv1', quantity: '1', purchasePrice: '5' }] as any);

        const res = await refreshPrices();

        expect(prismaMock.instrument.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ type: { not: 'BOND' } }) })
        );
        expect(getQuote).toHaveBeenCalledTimes(1);
        expect(getQuote).toHaveBeenCalledWith('GOOGL');
        expect(res.instrumentsRefreshed).toBe(1);
    });

    it('gdy dostawca nie zna symbolu → failures, bez aktualizacji', async () => {
        prismaMock.instrument.findMany.mockResolvedValue([{ id: 'i9', symbol: 'NOPE' }] as any);

        const res = await refreshPrices();

        expect(res.instrumentsRefreshed).toBe(0);
        expect(res.failures).toEqual([{ symbol: 'NOPE', reason: 'brak ceny' }]);
        expect(prismaMock.investment.updateMany).not.toHaveBeenCalled();
    });

    // Instancja bez MARKET_DATA_PROVIDER: NBP jest niezależne od dostawcy, więc złoto
    // musi się odświeżać dalej, a akcje nie mogą nawet próbować (zero żądań na zewnątrz).
    it('bez dostawcy notowań odświeża TYLKO złoto', async () => {
        vi.mocked(hasLiveQuotes).mockReturnValue(false);
        prismaMock.instrument.findMany.mockResolvedValue([
            { id: 'i1', symbol: 'GOOGL' },
            { id: 'gold', symbol: 'GOLD_NBP' },
        ] as any);
        prismaMock.investment.findMany.mockResolvedValue([{ id: 'inv1', quantity: '3', purchasePrice: '300' }] as any);

        const res = await refreshPrices();

        expect(getQuote).not.toHaveBeenCalled();
        expect(res.instrumentsRefreshed).toBe(1);
        expect(res.failures).toHaveLength(0);
        expect(prismaMock.investment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ instrumentId: 'gold' }), data: { currentValue: 333 } })
        );
    });
});
