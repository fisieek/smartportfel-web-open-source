import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

// instrumentController importuje prisma na górze pliku — mock, żeby dał się załadować.
vi.mock('../../lib/prisma', () => ({ prisma: {}, default: {} }));

import { getCapabilities, searchInstruments, getHistoricalPrice } from '../instrumentController';

/**
 * Zachowanie kontrolera notowań wobec dostawcy z `MARKET_DATA_PROVIDER`.
 * Dostawcy NIE mockujemy — chcemy sprawdzić realne przejście przez fasadę,
 * a `fetch` pilnuje, że w trybie domyślnym nic nie wychodzi na zewnątrz.
 */

const ORIGINAL = process.env.MARKET_DATA_PROVIDER;

let jsonMock: ReturnType<typeof vi.fn>;
let statusMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

const makeRes = () => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    return { json: jsonMock, status: statusMock } as unknown as Response;
};

beforeEach(() => {
    fetchMock = vi.fn().mockRejectedValue(new Error('sieć nie powinna być ruszana'));
    vi.stubGlobal('fetch', fetchMock);
    delete process.env.MARKET_DATA_PROVIDER;
});

afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = ORIGINAL;
});

describe('GET /api/instruments/capabilities', () => {
    it('bez dostawcy: brak notowań live, ale cena złota zostaje', async () => {
        const res = makeRes();
        await getCapabilities({} as Request, res);

        expect(jsonMock).toHaveBeenCalledWith({ liveQuotes: false, provider: 'none', goldPrice: true });
    });

    it('nieznany dostawca też raportuje brak notowań live', async () => {
        // Repozytorium nie zawiera żadnego dostawcy notowań — cokolwiek tu wpiszesz,
        // fasada spada na `none`. Patrz services/marketData/index.ts.
        process.env.MARKET_DATA_PROVIDER = 'jakis-dostawca';
        const res = makeRes();
        await getCapabilities({} as Request, res);

        expect(jsonMock).toHaveBeenCalledWith({ liveQuotes: false, provider: 'none', goldPrice: true });
    });
});

describe('GET /api/instruments/search bez dostawcy', () => {
    it('zapytanie o złoto zwraca GOLD_NBP i nie rusza sieci', async () => {
        const res = makeRes();
        await searchInstruments({ query: { q: 'złoto' } } as unknown as Request, res);

        const results = jsonMock.mock.calls[0][0];
        expect(results).toHaveLength(1);
        expect(results[0].symbol).toBe('GOLD_NBP');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('zapytanie o akcje zwraca pustą listę, bez błędu i bez sieci', async () => {
        const res = makeRes();
        await searchInstruments({ query: { q: 'apple' } } as unknown as Request, res);

        expect(jsonMock).toHaveBeenCalledWith([]);
        expect(statusMock).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('GET /api/instruments/price/:symbol bez dostawcy', () => {
    it('dla instrumentu innego niż złoto → 404 (jak nieznany symbol)', async () => {
        const res = makeRes();
        await getHistoricalPrice({ params: { symbol: 'AAPL' }, query: {} } as unknown as Request, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Price data not found' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
