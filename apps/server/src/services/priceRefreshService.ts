import prisma from '../lib/prisma';
import { getQuote, hasLiveQuotes } from './marketData';
import { getGoldPrice } from './marketData/nbpGoldClient';
import { CurrencyService, SUPPORTED_CURRENCIES } from './currencyService';
import { logger } from '../utils/logger';

/**
 * Odświeżanie wartości rynkowej inwestycji — wspólna logika dla:
 *  - cronu /api/system/cron/refresh-prices (cały portfel, raz dziennie),
 *  - ręcznego przycisku POST /api/investments/refresh-prices (dany użytkownik),
 *  - skryptu CLI scripts/refresh-prices.ts.
 *
 * Bierze instrumenty z ≥1 podlinkowaną inwestycją (po `instrumentId`), pobiera bieżącą cenę
 * (dostawca notowań `getQuote`, złoto `getGoldPrice`) i ustawia `currentValue` wszystkim pozycjom
 * danego instrumentu. Cena jest w walucie natywnej instrumentu — `getPositions` przelicza ją na PLN.
 * Obligacje (BOND) i pozycje bez symbolu są pomijane (brak notowań rynkowych).
 *
 * Bez dostawcy notowań (`MARKET_DATA_PROVIDER` nieustawiony) odświeżamy WYŁĄCZNIE złoto — NBP
 * jest niezależne od dostawcy. Reszta instrumentów jest odfiltrowana zawczasu, żeby nie robić
 * N gwarantowanie nieudanych prób i nie zapychać `failures` szumem.
 */

export interface PriceRefreshResult {
    instrumentsRefreshed: number;
    investmentsUpdated: number;
    failures: { symbol: string; reason: string }[];
}

const GOLD_SYMBOL = 'GOLD_NBP';
const CHUNK = 8;          // ile instrumentów odpytujemy równolegle
const QUOTE_TIMEOUT_MS = 6000; // twardy limit na pojedyncze notowanie (całość musi zmieścić się w limicie czasu żądania)

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);
}

function todayDateOnly(): Date {
    return new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
}

/**
 * Grzanie cache kursów NBP: pobiera i zapisuje dzisiejszy kurs każdej wspieranej waluty
 * (`getExchangeRateWithMeta` sam upsertuje do `exchange_rates`). Dzięki temu awaria NBP
 * zawsze ma świeży „ostatni znany kurs" do zaserwowania zamiast 1:1 (bug I2). Uruchamiane
 * w globalnej ścieżce refreshPrices (cron 22:00 / CLI), nie przy ręcznym odświeżeniu usera.
 */
export async function warmExchangeRates(): Promise<{ warmed: number; failed: string[] }> {
    const failed: string[] = [];
    let warmed = 0;
    const today = todayDateOnly();
    for (const cur of SUPPORTED_CURRENCIES) {
        if (cur === 'PLN') continue;
        try {
            const meta = await CurrencyService.getExchangeRateWithMeta(cur, today);
            if (meta.stale || meta.rateDate === null) failed.push(cur);
            else warmed += 1;
        } catch {
            failed.push(cur);
        }
    }
    logger.info(`[REFRESH] Kursy NBP zagrzane: ${warmed}/${SUPPORTED_CURRENCIES.length - 1}, nieświeże: ${failed.join(',') || '—'}`);
    return { warmed, failed };
}

export async function refreshPrices(opts: { userId?: string; recordHistory?: boolean } = {}): Promise<PriceRefreshResult> {
    const { userId, recordHistory = true } = opts;
    const result: PriceRefreshResult = { instrumentsRefreshed: 0, investmentsUpdated: 0, failures: [] };

    // Ścieżka globalna (cron/CLI, bez userId): przy okazji grzejemy cache kursów NBP.
    if (!userId) {
        await warmExchangeRates();
    }

    const allInstruments = await prisma.instrument.findMany({
        where: {
            type: { not: 'BOND' },
            investments: { some: userId ? { userId } : {} },
        },
        select: { id: true, symbol: true },
    });

    // Bez dostawcy notowań zostaje samo złoto (NBP działa niezależnie).
    const instruments = hasLiveQuotes()
        ? allInstruments
        : allInstruments.filter((inst) => (inst.symbol || '').trim().toUpperCase() === GOLD_SYMBOL);

    if (instruments.length === 0) return result;

    const date = todayDateOnly();
    const now = new Date();

    for (let i = 0; i < instruments.length; i += CHUNK) {
        await Promise.all(instruments.slice(i, i + CHUNK).map(async (inst) => {
            const symbol = (inst.symbol || '').trim();
            if (!symbol) return;
            try {
                const price = symbol.toUpperCase() === GOLD_SYMBOL
                    ? await withTimeout(getGoldPrice(), QUOTE_TIMEOUT_MS, null)
                    : await withTimeout(getQuote(symbol).then((q) => q?.close ?? null), QUOTE_TIMEOUT_MS, null);

                if (price == null || !(price > 0)) {
                    result.failures.push({ symbol, reason: 'brak ceny' });
                    return;
                }

                const where = { instrumentId: inst.id, ...(userId ? { userId } : {}) };
                const ops: any[] = [
                    prisma.investment.updateMany({ where, data: { currentValue: price } }),
                    prisma.instrumentPriceHistory.upsert({
                        where: { instrumentId_date: { instrumentId: inst.id, date } },
                        update: { price },
                        create: { instrumentId: inst.id, date, price },
                    }),
                ];

                let updatedCount = 0;
                if (recordHistory) {
                    // Punkt historii per inwestycja — zasila sparkline trendu w getPositions.
                    const invs = await prisma.investment.findMany({
                        where, select: { id: true, quantity: true, purchasePrice: true },
                    });
                    updatedCount = invs.length;
                    for (const iv of invs) {
                        ops.push(prisma.investmentHistory.create({
                            data: { investmentId: iv.id, date: now, quantity: iv.quantity, purchasePrice: iv.purchasePrice, marketValue: price },
                        }));
                    }
                }

                const tx = await prisma.$transaction(ops);
                if (!recordHistory) updatedCount = (tx[0] as { count: number }).count;

                result.instrumentsRefreshed += 1;
                result.investmentsUpdated += updatedCount;
            } catch (e: any) {
                result.failures.push({ symbol, reason: e?.message || 'błąd' });
            }
        }));
    }

    logger.info(`[REFRESH] Instrumenty: ${result.instrumentsRefreshed}/${instruments.length}, pozycje: ${result.investmentsUpdated}, błędy: ${result.failures.length}`);
    return result;
}
