/**
 * Dane rynkowe — fasada nad wymienialnym dostawcą notowań.
 *
 * Repozytorium NIE zawiera żadnego dostawcy notowań giełdowych. Jedyny wbudowany to
 * `none`: zero żądań na zewnątrz, wartość rynkową pozycji wpisujesz ręcznie.
 *
 * Dostawcę wybiera zmienna `MARKET_DATA_PROVIDER`:
 *
 *   (brak) / "none"  → zero żądań na zewnątrz; ceny wpisywane ręcznie  ← DOMYŚLNIE
 *   cokolwiek innego → "none" + ostrzeżenie w logu
 *
 * WŁASNY DOSTAWCA: zaimplementuj interfejs `MarketDataProvider` (patrz `types.ts`),
 * zaimportuj go niżej i dopisz do mapy `PROVIDERS` pod wybraną nazwą. Tyle — reszta
 * aplikacji (przycisk „Odśwież ceny", wyszukiwarka instrumentów, cron notowań) włącza
 * się sama, gdy dostawca zgłosi `liveQuotes: true`. Sprawdź warunki licencyjne
 * i regulamin źródła danych, z którego chcesz korzystać.
 *
 * Cena złota (`nbpGoldClient`) i kursy walut (`currencyService`) NIE przechodzą tą drogą —
 * NBP to oficjalne publiczne API bez klucza, więc działa niezależnie od tej zmiennej.
 */

import { logger } from '../../utils/logger';
import type { InstrumentSearchResult, MarketDataProvider, MarketQuote } from './types';
import { noneProvider } from './providers/noneProvider';

export type { InstrumentSearchResult, MarketDataProvider, MarketQuote } from './types';

const PROVIDERS: Record<string, MarketDataProvider> = {
    none: noneProvider,
};

const DEFAULT_PROVIDER = 'none';

// Ostatnio zalogowany wybór. Dostawcy NIE cache'ujemy — odczyt zmiennej i podejrzenie mapy
// są darmowe, a brak cache'u pozwala testom przestawiać `MARKET_DATA_PROVIDER` bez
// resetowania modułu. Log pilnuje tylko, żeby nie powtarzać się przy każdym żądaniu.
let loggedChoice: string | null = null;

function resolve(): { name: string; provider: MarketDataProvider } {
    const requested = (process.env.MARKET_DATA_PROVIDER || '').trim().toLowerCase();
    const name = requested || DEFAULT_PROVIDER;
    const provider = PROVIDERS[name];

    if (!provider) {
        if (loggedChoice !== name) {
            loggedChoice = name;
            logger.warn(
                `[MARKET DATA] Nieznany dostawca notowań "${requested}" — notowania live wyłączone. ` +
                `Dostępne: ${Object.keys(PROVIDERS).join(', ')}.`
            );
        }
        return { name: DEFAULT_PROVIDER, provider: noneProvider };
    }

    if (loggedChoice !== name) {
        loggedChoice = name;
        logger.info(
            provider.liveQuotes
                ? `[MARKET DATA] Dostawca notowań: ${name}.`
                : '[MARKET DATA] Brak dostawcy notowań — wartości rynkowe wpisywane ręcznie ' +
                  '(złoto i kursy NBP działają normalnie). Włącz przez MARKET_DATA_PROVIDER.'
        );
    }

    return { name, provider };
}

/** Nazwa aktywnego dostawcy (`none`, gdy nieustawiony lub nieznany). */
export function marketDataProviderName(): string {
    return resolve().name;
}

/** Czy ta instancja ma notowania live. Frontend pyta o to przez `/api/instruments/capabilities`. */
export function hasLiveQuotes(): boolean {
    return resolve().provider.liveQuotes;
}

/** Wypisuje wybór dostawcy do logu przy starcie — żeby „ceny się nie odświeżają" nie kosztowało godziny. */
export function logMarketDataProvider(): void {
    resolve();
}

export function getQuote(symbol: string): Promise<MarketQuote | null> {
    return resolve().provider.getQuote(symbol);
}

export function getHistoricalClose(symbol: string, date: string): Promise<number | null> {
    return resolve().provider.getHistoricalClose(symbol, date);
}

export function searchInstruments(query: string, limit?: number): Promise<InstrumentSearchResult[]> {
    return resolve().provider.searchInstruments(query, limit);
}
