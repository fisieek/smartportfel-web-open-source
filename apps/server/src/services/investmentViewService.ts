import prisma from '../lib/prisma';
import { CurrencyService, RateMeta } from './currencyService';
import { validateInvestmentAccountOwnership } from '../utils/ownershipValidator';
import { getContributionLimit, RetirementAccountType } from './ikeIkzeLimits';

/**
 * Logika biznesowa inwestycji oddzielona od warstwy Express (req/res), żeby mogła być
 * reużyta przez kontrolery oraz serwer MCP. Zachowanie identyczne jak w kontrolerze.
 */

/**
 * Przewalutowanie kwoty operacji inwestycyjnej z waluty instrumentu na walutę konta,
 * po kursie NBP z daty operacji. Używane przy każdej mutacji salda konta inwestycyjnego
 * (kupno/sprzedaż/import/refund), żeby saldo (w walucie konta) nie księgowało kwot 1:1
 * w walucie instrumentu.
 *
 * Rzuca (przez `CurrencyService.convert`) przy niedostępnym kursie — świadomie: cichy
 * fallback 1:1 (`convertSafe`) to dokładnie ten bug (B6). Callerzy mapują rzut na 400.
 */
export async function investmentAmountToAccountCurrency(
    nativeAmount: number,
    instrumentCurrency: string | null | undefined,
    accountCurrency: string,
    date: Date
): Promise<number> {
    const from = instrumentCurrency || 'PLN';
    if (from === accountCurrency) return nativeAmount;
    return Number(await CurrencyService.convert(nativeAmount, from, accountCurrency, date));
}

// ─── PRYMITYW WYCENY: timeline zdarzeń + agregacja carry-forward ─────────────
// Jedno źródło prawdy dla wykresu portfela (history) i sparkline'ów pozycji.
// Wcześniej te same zdarzenia (zakup + wpisy historii + „dzisiaj") i ta sama
// agregacja carry-forward były zaimplementowane dwa razy innym kodem, co
// wyprodukowało realnego buga (wykres w walucie natywnej vs KPI w PLN — I2).

/** Format daty YYYY-MM-DD w UTC — deterministyczny niezależnie od strefy serwera. */
const formatDateUTC = (d: Date | string): string => new Date(d).toISOString().split('T')[0];

/** Punkt wyceny jednej inwestycji w danym dniu (już w PLN). */
export interface TimelineEvent {
    costPLN: number;
    valuePLN: number;
}
/** Mapa dzień(YYYY-MM-DD) → wycena, dla jednej inwestycji. */
export type InvestmentTimeline = Map<string, TimelineEvent>;

/** Minimalny kształt inwestycji potrzebny do zbudowania timeline'u. */
interface TimelineInvestment {
    id: string;
    quantity: number | string | { toString(): string };
    purchasePrice: number | string | { toString(): string };
    currentValue: number | string | { toString(): string };
    currency: string | null;
    purchaseDate: Date | string;
}
/** Minimalny kształt wpisu InvestmentHistory. */
interface TimelineHistoryRecord {
    investmentId: string;
    date: Date | string;
    quantity: number | string | { toString(): string };
    purchasePrice: number | string | { toString(): string };
    marketValue: number | string | { toString(): string };
}

/**
 * Buduje per-inwestycja timeline zdarzeń wyceny (w PLN):
 * - dzień zakupu: koszt/wartość = qty × purchasePrice × (kurs zakupu / kurs bieżący),
 * - każdy wpis InvestmentHistory: qty × purchasePrice × costRate / qty × marketValue × valueRate,
 * - „dzisiaj": nadpisuje wartość świeżą wyceną (qty × currentValue × valueRate); jeśli na
 *   dzisiejszą datę istniał już wpis historii, koszt z niego zostaje, nadpisujemy tylko wartość.
 *
 * costRate = kurs waluty z dnia zakupu; valueRate = kurs bieżący (kształt trendu w PLN).
 */
export async function buildInvestmentTimelines(
    investments: TimelineInvestment[],
    historyRecords: TimelineHistoryRecord[],
    rateToPln: (currency: string, date: Date) => Promise<number>,
    today: Date
): Promise<Map<string, InvestmentTimeline>> {
    const todayStr = formatDateUTC(today);
    const timelines = new Map<string, InvestmentTimeline>();

    for (const inv of investments) {
        const currency = inv.currency || 'PLN';
        const costRate = await rateToPln(currency, new Date(inv.purchaseDate));
        const valueRate = await rateToPln(currency, today);
        const qty = Number(inv.quantity);
        const purchasePrice = Number(inv.purchasePrice);

        const timeline: InvestmentTimeline = new Map();

        // 1. Dzień zakupu.
        timeline.set(formatDateUTC(inv.purchaseDate), {
            costPLN: qty * purchasePrice * costRate,
            valuePLN: qty * purchasePrice * valueRate,
        });

        // 2. Wpisy historyczne tej inwestycji.
        for (const h of historyRecords) {
            if (h.investmentId !== inv.id) continue;
            timeline.set(formatDateUTC(h.date), {
                costPLN: Number(h.quantity) * Number(h.purchasePrice) * costRate,
                valuePLN: Number(h.quantity) * Number(h.marketValue) * valueRate,
            });
        }

        // 3. „Dzisiaj" — najświeższa wycena z tabeli Investment. Wartość nadpisuje
        //    ewentualny wpis historii z dzisiejszą datą; koszt z takiego wpisu zostaje.
        const existing = timeline.get(todayStr);
        timeline.set(todayStr, {
            costPLN: existing ? existing.costPLN : qty * purchasePrice * costRate,
            valuePLN: Number(inv.currentValue) * qty * valueRate,
        });

        timelines.set(inv.id, timeline);
    }

    return timelines;
}

/**
 * Agreguje timeline'y carry-forward po zadanej, posortowanej osi dat: dla każdego dnia
 * z osi bierze ostatni znany stan każdej inwestycji i sumuje. Zwraca punkty wykresu.
 *
 * Oś podaje caller: wykres portfela dostaje gęstą oś dzienną (dzień-po-dniu), sparkline
 * dostaje rzadką oś dat-zdarzeń — ta sama logika, różne rozdzielczości.
 */
export function aggregateTimelines(
    timelines: Map<string, InvestmentTimeline>,
    dates: string[]
): { date: string; totalCost: number; totalValue: number }[] {
    const round = (n: number) => Number(n.toFixed(2));
    const active = new Map<string, TimelineEvent>();
    const out: { date: string; totalCost: number; totalValue: number }[] = [];

    for (const d of dates) {
        for (const [invId, tl] of timelines) {
            const e = tl.get(d);
            if (e) active.set(invId, e);
        }
        let totalCost = 0;
        let totalValue = 0;
        let hasData = false;
        for (const e of active.values()) {
            totalCost += e.costPLN;
            totalValue += e.valuePLN;
            hasData = true;
        }
        if (hasData) out.push({ date: d, totalCost: round(totalCost), totalValue: round(totalValue) });
    }

    return out;
}

// ─── POZYCJE (zagregowane per aktywo, przeliczone na PLN) ────────────────────
export interface PositionsFilters {
    type?: string;
    accountId?: string;
}

export const getPositionsLogic = async (userId: string, filters: PositionsFilters = {}) => {
    const { type, accountId } = filters;

    const where: any = { userId, soldAt: null };
    if (type && type !== 'ALL') where.type = String(type);
    if (accountId && accountId !== 'ALL') where.accountId = String(accountId);
    // Pomijaj instrumenty z zamkniętych kont inwestycyjnych (instrumenty bez konta zostają)
    where.OR = [{ accountId: null }, { account: { closedAt: null } }];

    const [investments, accounts, historyRecords] = await Promise.all([
        prisma.investment.findMany({ where, include: { account: true, instrument: true }, orderBy: { purchaseDate: 'asc' } }),
        prisma.investmentAccount.findMany({ where: { userId, closedAt: null } as any }),
        prisma.investmentHistory.findMany({ where: { investment: { userId } }, orderBy: { date: 'asc' } })
    ]);

    const today = new Date();
    const formatDate = (d: Date) => new Date(d).toISOString().split('T')[0];

    // Memoizacja kursów NBP w obrębie żądania (wspólny helper CurrencyService).
    // Śledzimy „stale" (NBP niedostępne → kurs z cache DB) i najstarszą użytą datę kursu,
    // żeby oznaczyć odpowiedź flagą staleRate/rateAsOf dla badge w UI (bug I2).
    const rateCache = new Map<string, RateMeta>();
    let anyStale = false;
    let oldestRateDate: string | null = null;
    const rateToPlnMeta = async (currency: string, date: Date): Promise<RateMeta> => {
        const meta = await CurrencyService.rateToPlnWithMeta(currency, date, rateCache);
        if (meta.stale) {
            anyStale = true;
            if (meta.rateDate && (!oldestRateDate || meta.rateDate < oldestRateDate)) oldestRateDate = meta.rateDate;
        }
        return meta;
    };
    const rateToPln = async (currency: string, date: Date): Promise<number> => (await rateToPlnMeta(currency, date)).rate;

    type Txn = {
        id: string; accountId: string | null; accountName: string | null;
        quantity: number; purchasePrice: number; currentValue: number;
        currency: string; purchaseDate: string;
    };
    type Acc = {
        key: string; name: string; type: string;
        totalQuantity: number; investedPLN: number; currentValuePLN: number;
        currencies: Set<string>; accountNames: Set<string>; transactions: Txn[]; stale: boolean;
    };

    const groups = new Map<string, Acc>();

    for (const inv of investments) {
        const name = inv.instrument?.name || inv.name;
        const invType = inv.type || 'OTHER';
        const currency = inv.currency || 'PLN';
        const qty = Number(inv.quantity);
        const purchasePrice = Number(inv.purchasePrice);
        const currentValue = Number(inv.currentValue);

        const costNative = qty * purchasePrice;
        const valueNative = qty * currentValue;
        const costMeta = await rateToPlnMeta(currency, new Date(inv.purchaseDate));
        const valueMeta = await rateToPlnMeta(currency, today);
        const costPLN = costNative * costMeta.rate;
        const valuePLN = valueNative * valueMeta.rate;

        const key = inv.instrumentId ? `inst:${inv.instrumentId}` : `${name}||${invType}`;
        let g = groups.get(key);
        if (!g) {
            g = {
                key, name, type: invType,
                totalQuantity: 0, investedPLN: 0, currentValuePLN: 0,
                currencies: new Set(), accountNames: new Set(), transactions: [], stale: false
            };
            groups.set(key, g);
        }
        g.totalQuantity += qty;
        g.investedPLN += costPLN;
        g.currentValuePLN += valuePLN;
        g.stale = g.stale || costMeta.stale || valueMeta.stale;
        g.currencies.add(currency);
        if (inv.account?.name) g.accountNames.add(inv.account.name);
        g.transactions.push({
            id: inv.id, accountId: inv.accountId, accountName: inv.account?.name ?? null,
            quantity: qty, purchasePrice, currentValue, currency, purchaseDate: formatDate(inv.purchaseDate)
        });
    }

    const round = (n: number) => Number(n.toFixed(2));

    const totalInstrumentsPLN = Array.from(groups.values()).reduce((s, g) => s + g.currentValuePLN, 0);

    // Timeline'y wyceny — wspólny prymityw z wykresem portfela (getInvestmentHistoryLogic).
    // Wartość liczona po kursie bieżącym (valueRate), koszt ignorowany w sparkline.
    const allTimelines = await buildInvestmentTimelines(investments, historyRecords, rateToPln, today);

    // Sparkline per aktywo: trend wartości w PLN po rzadkiej osi dat-zdarzeń (ostatnie 30).
    const buildSparkline = (g: Acc): { date: string; valuePLN: number }[] => {
        const sub = new Map<string, InvestmentTimeline>();
        const eventDates = new Set<string>();
        for (const t of g.transactions) {
            const tl = allTimelines.get(t.id);
            if (!tl) continue;
            sub.set(t.id, tl);
            for (const d of tl.keys()) eventDates.add(d);
        }
        const dates = Array.from(eventDates).sort();
        return aggregateTimelines(sub, dates)
            .slice(-30)
            .map(p => ({ date: p.date, valuePLN: p.totalValue }));
    };

    const positions = [];
    for (const g of groups.values()) {
        const plPLN = g.currentValuePLN - g.investedPLN;
        const plPct = g.investedPLN > 0 ? (plPLN / g.investedPLN) * 100 : 0;
        const currency = g.currencies.size === 1 ? Array.from(g.currencies)[0] : 'MIXED';
        const sparkline = buildSparkline(g);
        positions.push({
            key: g.key,
            name: g.name,
            type: g.type,
            currency,
            totalQuantity: g.totalQuantity,
            investedPLN: round(g.investedPLN),
            currentValuePLN: round(g.currentValuePLN),
            plPLN: round(plPLN),
            plPct: round(plPct),
            avgPricePLN: g.totalQuantity > 0 ? round(g.investedPLN / g.totalQuantity) : 0,
            allocationPct: totalInstrumentsPLN > 0 ? round((g.currentValuePLN / totalInstrumentsPLN) * 100) : 0,
            accounts: Array.from(g.accountNames),
            transactionsCount: g.transactions.length,
            sparkline,
            staleRate: g.stale || undefined
        });
    }

    positions.sort((a, b) => b.currentValuePLN - a.currentValuePLN);

    // Gotówka na kontach inwestycyjnych (przeliczona na PLN).
    let cashPLN = 0;
    for (const acc of accounts) {
        const rate = await rateToPln((acc as any).currency || 'PLN', today);
        cashPLN += Number(acc.balance) * rate;
    }

    const investedPLN = positions.reduce((s, p) => s + p.investedPLN, 0);
    const plPLN = totalInstrumentsPLN - investedPLN;

    // Alokacja po typie aktywa.
    const byType = new Map<string, number>();
    for (const p of positions) byType.set(p.type, (byType.get(p.type) || 0) + p.currentValuePLN);
    const allocationByType = Array.from(byType.entries()).map(([t, v]) => ({
        type: t,
        valuePLN: round(v),
        pct: totalInstrumentsPLN > 0 ? round((v / totalInstrumentsPLN) * 100) : 0
    })).sort((a, b) => b.valuePLN - a.valuePLN);

    return {
        positions,
        totals: {
            investedPLN: round(investedPLN),
            currentValuePLN: round(totalInstrumentsPLN),
            plPLN: round(plPLN),
            plPct: investedPLN > 0 ? round((plPLN / investedPLN) * 100) : 0,
            cashPLN: round(cashPLN),
            equityPLN: round(totalInstrumentsPLN + cashPLN),
            staleRate: anyStale || undefined,
            rateAsOf: anyStale ? oldestRateDate ?? undefined : undefined
        },
        allocationByType
    };
};

// ─── HISTORIA PORTFELA (wykres koszt/wartość dzień-po-dniu, PLN) ──────────────
/**
 * Buduje szereg czasowy wartości i kosztu całego portfela inwestycyjnego w PLN,
 * gęsto dzień-po-dniu od najstarszego zdarzenia do dziś (carry-forward).
 *
 * Współdzieli prymityw wyceny z sparkline'ami pozycji (buildInvestmentTimelines),
 * dzięki czemu ostatni punkt `totalValue` == `totals.currentValuePLN` z getPositionsLogic
 * (inwariant „wykres zgadza się z KPI", którego złamanie było bugiem I2).
 *
 * Kontrakt odpowiedzi: [{ date, totalCost, totalValue }] (bez zmian wobec kontrolera).
 */
export const getInvestmentHistoryLogic = async (
    userId: string
): Promise<{ date: string; totalCost: number; totalValue: number }[]> => {
    const [historyRecords, investments] = await Promise.all([
        prisma.investmentHistory.findMany({
            where: { investment: { userId, soldAt: null } },
            orderBy: { date: 'asc' },
        }),
        prisma.investment.findMany({
            where: { userId, soldAt: null, OR: [{ accountId: null }, { account: { closedAt: null } }] } as any,
            select: { id: true, name: true, purchaseDate: true, purchasePrice: true, quantity: true, currentValue: true, currency: true },
        }),
    ]);

    if (investments.length === 0) return [];

    const today = new Date();

    // Memoizacja kursów NBP w obrębie żądania (wspólny helper CurrencyService).
    const rateCache = new Map<string, RateMeta>();
    const rateToPln = async (currency: string, date: Date): Promise<number> =>
        (await CurrencyService.rateToPlnWithMeta(currency, date, rateCache)).rate;

    const timelines = await buildInvestmentTimelines(investments, historyRecords, rateToPln, today);

    // Oś: każdy dzień UTC od najstarszego zdarzenia (zakup lub wpis historii) do dziś.
    let minMs = Date.parse(formatDateUTC(today) + 'T00:00:00Z');
    for (const inv of investments) minMs = Math.min(minMs, Date.parse(formatDateUTC(inv.purchaseDate) + 'T00:00:00Z'));
    for (const h of historyRecords) minMs = Math.min(minMs, Date.parse(formatDateUTC(h.date) + 'T00:00:00Z'));
    const endMs = Date.parse(formatDateUTC(today) + 'T00:00:00Z');

    const dates: string[] = [];
    const DAY_MS = 86400000;
    for (let ms = minMs; ms <= endMs; ms += DAY_MS) dates.push(formatDateUTC(new Date(ms)));

    return aggregateTimelines(timelines, dates);
};

// ─── TWORZENIE INWESTYCJI (transakcja: walidacja konta, saldo, wpis historii) ─
export interface CreateInvestmentInput {
    name: string;
    purchaseDate?: string | Date;
    purchasePrice: number | string;
    currentValue?: number | string;
    quantity?: number | string;
    accountId: string;
    type?: string;
    country?: string;
    currency?: string;
    bondDuration?: number | string;
    bondInterestRate?: number | string;
    isHistorical?: boolean;
}

export const createInvestmentBusinessLogic = async (userId: string, input: CreateInvestmentInput) => {
    const {
        name, purchaseDate, purchasePrice, currentValue, quantity, accountId,
        type, country, currency, bondDuration, bondInterestRate, isHistorical
    } = input;

    if (!name || purchasePrice === undefined || !accountId) {
        throw new Error('Nazwa, cena zakupu i konto inwestycyjne są wymagane');
    }

    const numericQuantity = quantity || 1;
    const totalCost = parseFloat(String(purchasePrice)) * parseFloat(String(numericQuantity));
    const opDate = purchaseDate ? new Date(purchaseDate) : new Date();

    // Ownership + waluta konta liczone PRZED transakcją: konwersja NBP nie może biec
    // wewnątrz $transaction (trzymałaby ją otwartą na czas requestu sieciowego).
    const isOwner = await validateInvestmentAccountOwnership(accountId, userId);
    if (!isOwner) {
        throw new Error('Brak dostępu do konta inwestycyjnego');
    }
    const accountForCurrency = await prisma.investmentAccount.findUnique({ where: { id: accountId } });
    if (!accountForCurrency) {
        throw new Error('Konto inwestycyjne nie istnieje');
    }
    const accountCurrency = accountForCurrency.currency || 'PLN';
    // Kwota mutująca saldo — w walucie konta (cena instrumentu jest w walucie instrumentu).
    const costInAccountCurrency = isHistorical
        ? totalCost
        : await investmentAmountToAccountCurrency(totalCost, currency, accountCurrency, opDate);

    const investment = await prisma.$transaction(async (tx) => {
        const account = await tx.investmentAccount.findUnique({ where: { id: accountId } });
        if (!account) {
            throw new Error('Konto inwestycyjne nie istnieje');
        }

        if (!isHistorical) {
            const currentBalance = Number(account.balance);
            const newBalance = currentBalance - costInAccountCurrency;

            const providerLower = account.provider.toLowerCase();
            const isBroker = providerLower === 'xtb' || providerLower === 'revolut';
            const minAllowedBalance = isBroker ? -50 : 0;

            if (newBalance < minAllowedBalance) {
                const errorMsg = isBroker
                    ? `Na koncie ${account.name} brakuje środków. Limit debetu to -50 ${accountCurrency}, a Twoje saldo po operacji wyniosłoby ${newBalance.toFixed(2)} ${accountCurrency}.`
                    : `Na koncie ${account.name} brakuje środków (${currentBalance.toFixed(2)} ${accountCurrency}). Wymagane: ${costInAccountCurrency.toFixed(2)} ${accountCurrency}. Użyj opcji "Wpis historyczny", aby dodać aktywo bez pobierania środków.`;
                throw new Error(errorMsg);
            }

            await tx.investmentAccount.update({
                where: { id: accountId },
                data: { balance: { decrement: costInAccountCurrency } }
            });
        }

        return await tx.investment.create({
            data: {
                userId,
                accountId,
                name,
                type,
                country,
                currency: currency || 'PLN',
                bondDuration: bondDuration ? parseInt(String(bondDuration)) : null,
                bondInterestRate: bondInterestRate ? parseFloat(String(bondInterestRate)) : null,
                quantity: parseFloat(String(numericQuantity)),
                purchasePrice: parseFloat(String(purchasePrice)),
                currentValue: currentValue ? parseFloat(String(currentValue)) : parseFloat(String(purchasePrice)),
                isHistorical: !!isHistorical,
                purchaseDate: opDate
            }
        });
    });

    await prisma.investmentHistory.create({
        data: {
            investmentId: investment.id,
            date: investment.purchaseDate,
            quantity: investment.quantity,
            purchasePrice: investment.purchasePrice,
            marketValue: investment.currentValue
        }
    });

    return investment;
};

// ─── LIMITY IKE / IKZE (ile wpłacono w roku vs limit) ────────────────────────
export interface RetirementAccountStatus {
    accountName: string;
    type: RetirementAccountType;
    ikzeBusiness: boolean;
    contributed: number;
    limit: number;
    remaining: number;
    currency: string;
    year: number;
}

/**
 * Status wpłat na konta IKE/IKZE w danym roku. Wpłaty = transfery wpływające na konto
 * inwestycyjne (relacja Expense.investmentAccountId / "AccountIncome"); kwoty w PLN.
 */
export const getRetirementContributionStatus = async (
    userId: string,
    year: number = new Date().getFullYear()
): Promise<RetirementAccountStatus[]> => {
    const accounts = await prisma.investmentAccount.findMany({
        where: { userId, accountType: { in: ['IKE', 'IKZE'] }, closedAt: null } as any,
        orderBy: { createdAt: 'asc' }
    });
    if (accounts.length === 0) return [];

    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    const result: RetirementAccountStatus[] = [];
    for (const acc of accounts) {
        const transfers = await prisma.expense.findMany({
            where: {
                userId,
                investmentAccountId: acc.id,
                transactionDate: { gte: start, lt: end }
            },
            select: { amount: true, plnAmount: true }
        });
        const contributed = transfers.reduce(
            (s, t) => s + Number(t.plnAmount ?? t.amount ?? 0),
            0
        );
        const type = acc.accountType as RetirementAccountType;
        const limit = getContributionLimit(type, year, acc.ikzeBusiness);
        result.push({
            accountName: acc.name,
            type,
            ikzeBusiness: acc.ikzeBusiness,
            contributed,
            limit,
            remaining: Math.max(0, limit - contributed),
            currency: acc.currency || 'PLN',
            year
        });
    }
    return result;
};
