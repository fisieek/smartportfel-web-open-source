/**
 * Kontrakt dostawcy notowań.
 *
 * Notowania akcji/ETF-ów/indeksów/krypto pochodzą z zewnętrznego serwisu i są wymienne —
 * instancja wybiera dostawcę zmienną `MARKET_DATA_PROVIDER` (patrz `./index.ts`).
 * Cena złota (NBP) NIE przechodzi tą drogą: to oficjalne, publiczne API bez klucza,
 * więc `nbpGoldClient` jest wołany bezpośrednio i działa zawsze.
 */

export interface MarketQuote {
    symbol: string;
    date: string; // YYYY-MM-DD
    close: number;
    currency?: string;
}

export interface InstrumentSearchResult {
    symbol: string;
    name: string;
    type: string; // Stock | ETF | Index | Crypto | Fund
    region: string;
    currency: string;
    matchScore: number;
}

export interface MarketDataProvider {
    /** Czy dostawca faktycznie zwraca notowania. `false` = instancja bez wycen live. */
    readonly liveQuotes: boolean;

    /** Aktualne notowanie. `null`, gdy dostawca nie zna symbolu. */
    getQuote(symbol: string): Promise<MarketQuote | null>;

    /** Cena zamknięcia na dany dzień (lub ostatnia wcześniejsza sesja). `null` przy braku danych. */
    getHistoricalClose(symbol: string, date: string): Promise<number | null>;

    /** Wyszukiwanie instrumentów. Pusta tablica przy błędzie — nigdy wyjątek. */
    searchInstruments(query: string, limit?: number): Promise<InstrumentSearchResult[]>;
}
