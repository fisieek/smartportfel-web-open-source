import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    getHistoricalClose,
    getQuote,
    hasLiveQuotes,
    marketDataProviderName,
    searchInstruments,
} from './index';
import { logger } from '../../utils/logger';

/**
 * Fasada dostawców notowań. Najważniejszy test w tym pliku to „szczelność": repozytorium
 * nie zawiera ŻADNEGO dostawcy notowań giełdowych, więc żadne żądanie nie ma prawa wyjść
 * na zewnątrz — niezależnie od tego, co ktoś wpisze w `MARKET_DATA_PROVIDER`. To jest
 * gwarancja, na której stoi publikacja repozytorium — nie kosmetyka.
 */

const ORIGINAL = process.env.MARKET_DATA_PROVIDER;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    // Celowo bez sensownej odpowiedzi: ten mock istnieje po to, żeby WYKRYĆ żądanie,
    // a nie żeby je obsłużyć. Każde wywołanie to błąd, który test ma złapać.
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL === undefined) delete process.env.MARKET_DATA_PROVIDER;
    else process.env.MARKET_DATA_PROVIDER = ORIGINAL;
});

describe('marketData — dostawca domyślny (brak zmiennej)', () => {
    beforeEach(() => {
        delete process.env.MARKET_DATA_PROVIDER;
    });

    it('raportuje brak notowań live', () => {
        expect(hasLiveQuotes()).toBe(false);
        expect(marketDataProviderName()).toBe('none');
    });

    it('nie wysyła ŻADNEGO żądania sieciowego', async () => {
        await getQuote('AAPL');
        await getHistoricalClose('AAPL', '2026-06-10');
        await searchInstruments('apple');

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('zwraca to samo, co „dostawca nie zna symbolu"', async () => {
        expect(await getQuote('AAPL')).toBeNull();
        expect(await getHistoricalClose('AAPL', '2026-06-10')).toBeNull();
        expect(await searchInstruments('apple')).toEqual([]);
    });

    it('puste i białe znaki traktuje jak brak zmiennej', () => {
        process.env.MARKET_DATA_PROVIDER = '   ';
        expect(hasLiveQuotes()).toBe(false);
        expect(marketDataProviderName()).toBe('none');
    });

    it('jawne "none" działa tak samo', async () => {
        process.env.MARKET_DATA_PROVIDER = 'none';
        expect(hasLiveQuotes()).toBe(false);
        expect(await getQuote('AAPL')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('marketData — nieznany dostawca', () => {
    it('spada na brak notowań i ostrzega w logu', async () => {
        const warn = vi.spyOn(logger, 'warn').mockImplementation(() => { });
        process.env.MARKET_DATA_PROVIDER = 'jakis-dostawca';

        expect(hasLiveQuotes()).toBe(false);
        expect(marketDataProviderName()).toBe('none');
        expect(await getQuote('AAPL')).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();

        expect(warn).toHaveBeenCalled();
        expect(warn.mock.calls[0][0]).toContain('jakis-dostawca');
    });
});
