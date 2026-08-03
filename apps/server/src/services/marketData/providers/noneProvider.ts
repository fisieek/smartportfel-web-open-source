/**
 * Dostawca „brak notowań" — stan DOMYŚLNY.
 *
 * Nie wykonuje żadnych żądań sieciowych. Instancja bez skonfigurowanego dostawcy działa
 * normalnie, tylko wartość rynkową pozycji wpisuje się ręcznie. Cena złota (NBP) i kursy
 * walut (NBP) są niezależne od dostawcy i działają dalej.
 *
 * Zwracane wartości są takie same jak „dostawca nie zna symbolu" (`null` / `[]`), więc
 * wołający nie potrzebują osobnej gałęzi — ścieżka braku danych już u nich istnieje.
 */

import type { InstrumentSearchResult, MarketDataProvider, MarketQuote } from '../types';

export const noneProvider: MarketDataProvider = {
    liveQuotes: false,

    async getQuote(): Promise<MarketQuote | null> {
        return null;
    },

    async getHistoricalClose(): Promise<number | null> {
        return null;
    },

    async searchInstruments(): Promise<InstrumentSearchResult[]> {
        return [];
    },
};
