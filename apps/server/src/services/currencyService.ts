import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { captureServerError } from '../lib/reportError';

/** Waluty obsługiwane przez aplikację (lustrzane z listą na frontendzie). */
export const SUPPORTED_CURRENCIES = ['PLN', 'USD', 'EUR', 'GBP', 'CHF', 'UAH', 'NOK', 'SEK', 'DKK', 'AUD', 'CAD', 'JPY'];

/** Timeout pojedynczego strzału do NBP — bez tego goły fetch potrafi wisieć bez limitu. */
const NBP_TIMEOUT_MS = 4500;

/** Throttle raportów o awarii NBP (per waluta), żeby jeden request nie zalał logu. */
const NBP_FAILURE_THROTTLE_MS = 5 * 60 * 1000;
const lastNbpFailureReport = new Map<string, number>();

/**
 * Metadane kursu: sam kurs + czy pochodzi z cache (NBP było niedostępne) + data kursu.
 * `rateDate === null` oznacza brak jakiegokolwiek kursu (NBP down I pusty cache) —
 * jedyny przypadek degradacji do 1:1, zawsze jawnie oflagowany (`stale: true`).
 */
export interface RateMeta {
    rate: number;
    stale: boolean;
    rateDate: string | null; // 'YYYY-MM-DD'
}

const formatDate = (d: Date): string => new Date(d).toISOString().split('T')[0];

/**
 * 💱 Currency Service
 *
 * Centralny serwis do obsługi walut i kursów NBP z cache w DB (tabela `exchange_rates`).
 * Gdy NBP nie odpowiada, serwuje OSTATNI ZNANY kurs z cache zamiast cichego 1:1 (bug I2)
 * i oznacza wynik flagą `stale` — którą warstwy odczytowe propagują do UI (badge).
 */
export class CurrencyService {
    /**
     * Pojedynczy strzał do NBP z timeoutem. Zwraca kurs mid albo null (bez rzucania) —
     * rozróżnienie „NBP nieosiągalne" vs „brak kursu na dzień" robi caller.
     */
    private static async fetchNbp(url: string): Promise<number | null> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NBP_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) return null;
            const data = (await response.json()) as any;
            const mid = data?.rates?.[0]?.mid;
            return typeof mid === 'number' ? mid : null;
        } finally {
            clearTimeout(timer);
        }
    }

    private static reportNbpFailure(currency: string, error: unknown): void {
        const now = Date.now();
        const last = lastNbpFailureReport.get(currency) ?? 0;
        if (now - last < NBP_FAILURE_THROTTLE_MS) return;
        lastNbpFailureReport.set(currency, now);
        captureServerError(error, undefined, `CurrencyService: NBP niedostępne dla ${currency} — serwuję kurs z cache`);
    }

    /**
     * Kurs waluty do PLN z metadanymi. Kolejność: NBP (data → last/1) → cache DB (stale) → 1:1 (stale, rateDate=null).
     * Przy udanym pobraniu z NBP zapisuje kurs do cache (`exchange_rates`) pod żądaną datą.
     */
    static async getExchangeRateWithMeta(currency: string, date: Date): Promise<RateMeta> {
        const dateStr = formatDate(date);
        if (currency === 'PLN' || currency === 'PKT') {
            return { rate: 1, stale: false, rateDate: dateStr };
        }

        // 1) Próba pobrania z NBP (kurs z daty, potem ostatni dostępny). Sieć/timeout → null → cache.
        try {
            let mid = await this.fetchNbp(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/${dateStr}/?format=json`);
            if (mid === null) {
                mid = await this.fetchNbp(`https://api.nbp.pl/api/exchangerates/rates/a/${currency}/last/1/?format=json`);
            }
            if (mid !== null) {
                await this.cacheRate(currency, date, mid);
                return { rate: mid, stale: false, rateDate: dateStr };
            }
            // NBP osiągalne, ale brak kursu (np. nieznana waluta) — spróbuj cache, potem degraduj.
        } catch (error) {
            // NBP nieosiągalne (sieć/timeout/abort). Nie zrywamy żądania — czytamy ostatni znany kurs.
            this.reportNbpFailure(currency, error);
        }

        // 2) Fallback: ostatni znany kurs z cache (stale). Preferuj kurs <= żądana data, potem najświeższy.
        const cached =
            (await prisma.exchangeRate.findFirst({
                where: { currency, date: { lte: date } },
                orderBy: { date: 'desc' },
            })) ??
            (await prisma.exchangeRate.findFirst({ where: { currency }, orderBy: { date: 'desc' } }));
        if (cached) {
            return { rate: Number(cached.rate), stale: true, rateDate: formatDate(cached.date) };
        }

        // 3) Brak NBP i pusty cache — jedyny przypadek 1:1, ale JAWNIE oflagowany (nigdy „cicho").
        return { rate: 1, stale: true, rateDate: null };
    }

    /** Zapis kursu do cache (idempotentnie po [currency, date]). Błąd zapisu nie może wywrócić konwersji. */
    private static async cacheRate(currency: string, date: Date, mid: number): Promise<void> {
        const dayStart = new Date(formatDate(date) + 'T00:00:00.000Z');
        try {
            await prisma.exchangeRate.upsert({
                where: { currency_date: { currency, date: dayStart } },
                update: { rate: new Prisma.Decimal(mid), fetchedAt: new Date() },
                create: { currency, date: dayStart, rate: new Prisma.Decimal(mid) },
            });
        } catch (error) {
            console.warn(`[CurrencyService] Nie udało się zapisać kursu ${currency} do cache:`, (error as Error).message);
        }
    }

    /**
     * Pobiera kurs waluty z NBP/cache.
     * @throws Error jeśli kurs nie jest dostępny nigdzie (NBP down I pusty cache) — twarde ścieżki
     * zapisu sald (`convert`) mają wtedy rzucić (mapowane na 400), NIGDY księgować 1:1 (bug B6).
     */
    static async getExchangeRate(currency: string, date: Date): Promise<number> {
        const meta = await this.getExchangeRateWithMeta(currency, date);
        if (meta.rateDate === null) {
            throw new Error(`Błąd przewalutowania: Kurs dla waluty ${currency} na dzień ${date.toLocaleDateString()} jest niedostępny (NBP i cache).`);
        }
        return meta.rate;
    }

    /**
     * Oblicza wartość w walucie docelowej. Rzuca przy braku kursu (twarda ścieżka).
     */
    static async convert(amount: Prisma.Decimal | number, fromCurrency: string, toCurrency: string, date: Date): Promise<Prisma.Decimal> {
        const amountDecimal = new Prisma.Decimal(amount);
        if (fromCurrency === toCurrency) return amountDecimal;

        const fromRate = await this.getExchangeRate(fromCurrency, date);
        const toRate = await this.getExchangeRate(toCurrency, date);

        return amountDecimal.mul(new Prisma.Decimal(fromRate)).div(new Prisma.Decimal(toRate));
    }

    /**
     * Konwersja do agregacji/sum: przy niedostępności kursu NBP degraduje do OSTATNIEGO ZNANEGO
     * kursu z cache (a dopiero przy pustym cache do 1:1) — zamiast zrywać całe żądanie.
     * Kwota liczona po realnym kursie; sygnał „stale" niosą warstwy odczytowe (patrz `rateToPlnWithMeta`).
     */
    static async convertSafe(amount: Prisma.Decimal | number, fromCurrency: string, toCurrency: string, date: Date): Promise<Prisma.Decimal> {
        const amountDecimal = new Prisma.Decimal(amount);
        if (fromCurrency === toCurrency) return amountDecimal;
        const fromMeta = await this.getExchangeRateWithMeta(fromCurrency, date);
        const toMeta = await this.getExchangeRateWithMeta(toCurrency, date);
        return amountDecimal.mul(new Prisma.Decimal(fromMeta.rate)).div(new Prisma.Decimal(toMeta.rate));
    }

    /**
     * Wspólny helper przeliczenia kwoty w walucie `currency` na PLN, z memoizacją per-żądanie
     * i flagą `stale`. Zastępuje rozjechane lokalne kopie `rateToPln`/`toPLN` w warstwach odczytowych.
     * Caller przekazuje własną `Map` (cache w obrębie jednego żądania).
     */
    static async rateToPlnWithMeta(currency: string | null | undefined, date: Date, cache: Map<string, RateMeta>): Promise<RateMeta> {
        const cur = currency || 'PLN';
        if (cur === 'PLN') return { rate: 1, stale: false, rateDate: formatDate(date) };
        const key = `${cur}|${formatDate(date)}`;
        const hit = cache.get(key);
        if (hit) return hit;
        const meta = await this.getExchangeRateWithMeta(cur, date);
        cache.set(key, meta);
        return meta;
    }
}
