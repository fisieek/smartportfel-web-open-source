/**
 * Gamifikacja — silnik: serie tygodniowe + odznaki WIELOPOZIOMOWE (kamienie milowe).
 *
 * Etap 2: zamiast pojedynczych odznak — rodziny z poziomami brąz→srebro→złoto→platyna
 * i konkretnymi progami (np. Poduszka 100/10k/100k/500k zł). `UserBadge.badgeKey` =
 * `"${family}_${tier}"` (np. `savings_silver`) → bez migracji, z datą każdego awansu.
 *
 * Zasady (patrz plan): nagradzamy dobre nawyki; ocena leniwa (read-time) + po dodaniu
 * transakcji; automatyczny backfill (kryteria/metryki to czyste funkcje nad danymi);
 * odporność na błędy (nigdy nie wywala mutacji/odczytu). System indywidualny, bez crona/maili.
 */
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { CurrencyService, RateMeta } from './currencyService';

const TZ = 'Europe/Warsaw';
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

// ── Czas / tygodnie ─────────────────────────────────────────────────────────

/** Data cywilna (Y-M-D) w strefie Europe/Warsaw dla podanego momentu. */
function warsawCivil(date: Date): { y: number; m: number; d: number } {
    const s = new Intl.DateTimeFormat('en-CA', {
        timeZone: TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
}

/**
 * Monotoniczny numer tygodnia (poniedziałkowy) — kolejne tygodnie różnią się o 1.
 * Wartość bezwzględna nieistotna; liczy się tylko różnica między tygodniami.
 */
export function warsawWeekOrdinal(date: Date): number {
    const { y, m, d } = warsawCivil(date);
    const utcMid = Date.UTC(y, m - 1, d);
    const dow = (new Date(utcMid).getUTCDay() + 6) % 7; // poniedziałek = 0
    const monday = utcMid - dow * 24 * 60 * 60 * 1000;
    return Math.round(monday / MS_PER_WEEK);
}

/** Klucz ISO tygodnia, np. "2026-W26" (do zapisu lastActiveWeek / wyświetlania). */
export function isoWeekKey(date: Date): string {
    const { y, m, d } = warsawCivil(date);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dayNum = (dt.getUTCDay() + 6) % 7; // poniedziałek = 0
    dt.setUTCDate(dt.getUTCDate() - dayNum + 3); // czwartek danego tygodnia
    const isoYear = dt.getUTCFullYear();
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((dt.getTime() - firstThursday.getTime()) / MS_PER_WEEK);
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

export type StreakStatus = 'ACTIVE' | 'AT_RISK' | 'BROKEN' | 'NONE';

export interface StreakResult {
    current: number;
    longest: number;
    status: StreakStatus;
}

/**
 * Liczy serię ze zbioru aktywnych tygodni (ordinali) względem bieżącego tygodnia.
 * Czysta funkcja — sedno logiki serii, testowane jednostkowo.
 */
export function computeStreakFromOrdinals(active: Set<number>, currentOrdinal: number): StreakResult {
    const longest = longestRun(active);
    if (active.size === 0) return { current: 0, longest: 0, status: 'NONE' };

    let startOrd: number;
    let status: StreakStatus;
    if (active.has(currentOrdinal)) {
        startOrd = currentOrdinal;
        status = 'ACTIVE';
    } else if (active.has(currentOrdinal - 1)) {
        startOrd = currentOrdinal - 1;
        status = 'AT_RISK';
    } else {
        return { current: 0, longest, status: 'BROKEN' };
    }

    let current = 0;
    let ord = startOrd;
    while (active.has(ord)) {
        current++;
        ord--;
    }
    return { current, longest, status };
}

/** Najdłuższy ciąg kolejnych tygodni w zbiorze ordinali. */
function longestRun(active: Set<number>): number {
    if (active.size === 0) return 0;
    const sorted = [...active].sort((a, b) => a - b);
    let best = 1;
    let run = 1;
    for (let i = 1; i < sorted.length; i++) {
        run = sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1;
        if (run > best) best = run;
    }
    return best;
}

// ── Katalog rodzin (wielopoziomowe odznaki) ─────────────────────────────────

export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum'];
export const METAL_PL: Record<Tier, string> = {
    bronze: 'Brąz',
    silver: 'Srebro',
    gold: 'Złoto',
    platinum: 'Platyna',
};

interface TierDef {
    tier: Tier;
    threshold: number;
    name?: string; // opcjonalna nazwa flavor; gdy brak → etykieta metalu
}

/** Kontekst metryk do oceny progów — zbierany raz w evaluate(). */
export interface BadgeCtx {
    expenseCount: number; // liczba wydatków (type='expense')
    savingsTotalPln: number;
    investTotalPln: number;
    longestStreakWeeks: number;
    completedGoalsCount: number;
}

export interface BadgeFamily {
    key: string;
    name: string;
    icon: string; // nazwa ikony lucide (mapowana na froncie)
    unit: 'count' | 'PLN' | 'weeks';
    metric: (ctx: BadgeCtx) => number;
    tiers: TierDef[]; // progi rosnące
}

export const BADGE_FAMILIES: BadgeFamily[] = [
    {
        key: 'tracking',
        name: 'Tropiciel wydatków',
        icon: 'Footprints',
        unit: 'count',
        metric: (c) => c.expenseCount,
        tiers: [
            { tier: 'bronze', threshold: 1, name: 'Pierwszy krok' },
            { tier: 'silver', threshold: 100, name: 'Setka' },
            { tier: 'gold', threshold: 1000, name: 'Tysięcznik' },
            { tier: 'platinum', threshold: 5000, name: 'Kronikarz' },
        ],
    },
    {
        key: 'savings',
        name: 'Poduszka bezpieczeństwa',
        icon: 'Umbrella',
        unit: 'PLN',
        metric: (c) => c.savingsTotalPln,
        tiers: [
            { tier: 'bronze', threshold: 100, name: 'Pierwsza poduszka' },
            { tier: 'silver', threshold: 10000 },
            { tier: 'gold', threshold: 100000 },
            { tier: 'platinum', threshold: 500000 },
        ],
    },
    {
        key: 'investing',
        name: 'Inwestor',
        icon: 'TrendingUp',
        unit: 'PLN',
        metric: (c) => c.investTotalPln,
        tiers: [
            { tier: 'bronze', threshold: 1, name: 'Pierwszy instrument' },
            { tier: 'silver', threshold: 10000 },
            { tier: 'gold', threshold: 100000 },
            { tier: 'platinum', threshold: 500000 },
        ],
    },
    {
        key: 'streak',
        name: 'Konsekwencja',
        icon: 'Flame',
        unit: 'weeks',
        metric: (c) => c.longestStreakWeeks,
        tiers: [
            { tier: 'bronze', threshold: 4, name: 'Systematyk' },
            { tier: 'silver', threshold: 12, name: 'Maraton' },
            { tier: 'gold', threshold: 26, name: 'Pół roku' },
            { tier: 'platinum', threshold: 52, name: 'Rok z SmartPortfel' },
        ],
    },
    {
        key: 'goals',
        name: 'Łowca celów',
        icon: 'Target',
        unit: 'count',
        metric: (c) => c.completedGoalsCount,
        tiers: [
            { tier: 'bronze', threshold: 1, name: 'Cel osiągnięty' },
            { tier: 'silver', threshold: 3 },
            { tier: 'gold', threshold: 10 },
        ],
    },
];

const tierTitle = (t: TierDef): string => t.name ?? METAL_PL[t.tier];
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── Typy podsumowania (kontrakt z frontendem) ───────────────────────────────

export interface FamilyTierView {
    tier: Tier;
    name: string;
    threshold: number;
    unlocked: boolean;
    unlockedAt: string | null;
}

export interface NextTierView {
    tier: Tier;
    name: string;
    threshold: number;
    progress: number; // 0..1 (metric / threshold)
}

export interface FamilyView {
    key: string;
    name: string;
    icon: string;
    unit: 'count' | 'PLN' | 'weeks';
    metric: number;
    currentTier: Tier | null; // najwyższy zdobyty
    currentTierName: string | null;
    tiers: FamilyTierView[];
    nextTier: NextTierView | null;
}

export interface TierUpView {
    family: string;
    familyName: string;
    tier: Tier;
    tierName: string;
}

export interface GlobalNextTier extends NextTierView {
    family: string;
    familyName: string;
    unit: 'count' | 'PLN' | 'weeks';
}

export interface GamificationSummary {
    streak: { current: number; longest: number; status: StreakStatus; lastActiveWeek: string | null };
    families: FamilyView[];
    tierUps: TierUpView[];
    backfilledCount: number;
    tiersUnlocked: number;
    tiersTotal: number;
    nextTier: GlobalNextTier | null;
}

// ── Zbieranie danych ────────────────────────────────────────────────────────

/** Liczy serię z transakcji użytkownika (createdAt → tygodnie). */
async function computeStreak(userId: string): Promise<{ streak: StreakResult; lastActiveWeek: string | null }> {
    const rows = await prisma.expense.findMany({
        where: { userId },
        select: { createdAt: true },
    });
    const active = new Set<number>();
    let latest: Date | null = null;
    for (const r of rows) {
        active.add(warsawWeekOrdinal(r.createdAt));
        if (!latest || r.createdAt > latest) latest = r.createdAt;
    }
    const streak = computeStreakFromOrdinals(active, warsawWeekOrdinal(new Date()));
    return { streak, lastActiveWeek: latest ? isoWeekKey(latest) : null };
}

/**
 * Suma oszczędności (PLN, z konwersją walut) i wartość portfela.
 * Wartość instrumentów liczona jak `totalInstruments` na dashboardzie
 * (`currentValue * quantity`, bez konwersji) — spójnie z kartą „Inwestycje".
 */
async function sumSavingsAndInvestmentsPln(userId: string): Promise<{ savingsTotalPln: number; investTotalPln: number }> {
    const [savingsAccounts, investments] = await Promise.all([
        prisma.savingsAccount.findMany({ where: { userId, closedAt: null } as any, select: { balance: true, currency: true } }),
        prisma.investment.findMany({ where: { userId, soldAt: null, OR: [{ accountId: null }, { account: { closedAt: null } }] } as any, select: { currentValue: true, quantity: true } }),
    ]);

    // Kurs przez wspólny helper: przy awarii NBP kurs z cache DB, nie ciche 1:1 (bug I2).
    const rateCache = new Map<string, RateMeta>();
    const now = new Date();
    const toPLN = async (amount: number, currency: string | null): Promise<number> => {
        const cur = currency || 'PLN';
        if (cur === 'PLN') return amount;
        if (cur === 'PKT') return 0; // punkty, nie pieniądze
        return amount * (await CurrencyService.rateToPlnWithMeta(cur, now, rateCache)).rate;
    };

    let savingsTotalPln = 0;
    for (const a of savingsAccounts) savingsTotalPln += await toPLN(Number(a.balance), a.currency);

    const investTotalPln = investments.reduce((s, i) => s + Number(i.currentValue) * Number(i.quantity), 0);

    return { savingsTotalPln, investTotalPln };
}

/** Zbiera metryki do oceny progów. */
async function gatherCtx(userId: string, longestStreakWeeks: number): Promise<BadgeCtx> {
    const [expenseCount, goals, totals] = await Promise.all([
        prisma.expense.count({ where: { userId, type: 'expense' } }),
        prisma.savingsGoal.findMany({ where: { userId }, select: { targetAmount: true, allocatedAmount: true } }),
        sumSavingsAndInvestmentsPln(userId),
    ]);

    const completedGoalsCount = goals.filter(
        (g) => Number(g.targetAmount) > 0 && Number(g.allocatedAmount) >= Number(g.targetAmount)
    ).length;

    return {
        expenseCount,
        savingsTotalPln: totals.savingsTotalPln,
        investTotalPln: totals.investTotalPln,
        longestStreakWeeks,
        completedGoalsCount,
    };
}

// ── Rdzeń: evaluate ─────────────────────────────────────────────────────────

const TIERS_TOTAL = BADGE_FAMILIES.reduce((s, f) => s + f.tiers.length, 0);
const badgeKeyFor = (familyKey: string, tier: Tier) => `${familyKey}_${tier}`;

function emptyFamilies(): FamilyView[] {
    return BADGE_FAMILIES.map((f) => ({
        key: f.key,
        name: f.name,
        icon: f.icon,
        unit: f.unit,
        metric: 0,
        currentTier: null,
        currentTierName: null,
        tiers: f.tiers.map((t) => ({
            tier: t.tier,
            name: tierTitle(t),
            threshold: t.threshold,
            unlocked: false,
            unlockedAt: null,
        })),
        nextTier: f.tiers[0]
            ? { tier: f.tiers[0].tier, name: tierTitle(f.tiers[0]), threshold: f.tiers[0].threshold, progress: 0 }
            : null,
    }));
}

function emptySummary(): GamificationSummary {
    return {
        streak: { current: 0, longest: 0, status: 'NONE', lastActiveWeek: null },
        families: emptyFamilies(),
        tierUps: [],
        backfilledCount: 0,
        tiersUnlocked: 0,
        tiersTotal: TIERS_TOTAL,
        nextTier: null,
    };
}

/**
 * Główny punkt: przelicza serię, sprawdza progi rodzin, zapisuje nowe awanse,
 * aktualizuje stan i zwraca podsumowanie. Odporne na błędy — przy awarii zwraca
 * bezpieczne, puste podsumowanie (nigdy nie rzuca do wywołującego).
 */
export async function evaluate(userId: string): Promise<GamificationSummary> {
    try {
        // 1) Stan gamifikacji (utwórz przy pierwszym razie).
        let gam = await prisma.userGamification.findUnique({ where: { userId } });
        const isInitial = !gam || gam.lastSeenBadgeAt == null;
        if (!gam) {
            gam = await prisma.userGamification.create({ data: { userId } }).catch(async (e) => {
                logger.warn('[gamification] create race, refetching', e?.code);
                return prisma.userGamification.findUniqueOrThrow({ where: { userId } });
            });
        }

        // 2) Seria.
        const { streak, lastActiveWeek } = await computeStreak(userId);

        // 3) Już zdobyte poziomy.
        const existing = await prisma.userBadge.findMany({ where: { userId } });
        const unlockedMap = new Map(existing.map((b) => [b.badgeKey, b]));

        // 4) Metryki.
        const ctx = await gatherCtx(userId, streak.longest);

        // 5) Sprawdź progi wszystkich rodzin; utwórz nowe awanse.
        const newlyCreated: TierUpView[] = [];
        for (const fam of BADGE_FAMILIES) {
            const value = fam.metric(ctx);
            for (const t of fam.tiers) {
                const key = badgeKeyFor(fam.key, t.tier);
                if (unlockedMap.has(key)) continue;
                if (value >= t.threshold) {
                    try {
                        const created = await prisma.userBadge.create({
                            data: { userId, badgeKey: key, progress: 1 },
                        });
                        unlockedMap.set(key, created);
                        newlyCreated.push({ family: fam.key, familyName: fam.name, tier: t.tier, tierName: tierTitle(t) });
                    } catch (e: any) {
                        if (e?.code === 'P2002') {
                            const found = await prisma.userBadge.findUnique({
                                where: { userId_badgeKey: { userId, badgeKey: key } },
                            });
                            if (found) unlockedMap.set(key, found);
                        } else {
                            throw e;
                        }
                    }
                }
            }
        }

        // 6) Celebracja: przy pierwszej ocenie z dużym backfillem nie spamujemy confetti.
        const isBackfillBurst = isInitial && newlyCreated.length > 2;
        const tierUps = isBackfillBurst ? [] : newlyCreated;
        const backfilledCount = isBackfillBurst ? newlyCreated.length : 0;

        // 7) Zapis stanu serii (+ lastSeenBadgeAt po pierwszej ocenie / nowych awansach).
        const shouldStampSeen = isInitial || newlyCreated.length > 0;
        await prisma.userGamification.update({
            where: { userId },
            data: {
                currentStreakWeeks: streak.current,
                longestStreakWeeks: Math.max(streak.longest, gam.longestStreakWeeks),
                lastActiveWeek,
                ...(shouldStampSeen ? { lastSeenBadgeAt: new Date() } : {}),
            },
        });

        // 8) Złóż widok rodzin.
        const families: FamilyView[] = BADGE_FAMILIES.map((fam) => {
            const value = fam.metric(ctx);
            const tiers: FamilyTierView[] = fam.tiers.map((t) => {
                const row = unlockedMap.get(badgeKeyFor(fam.key, t.tier));
                return {
                    tier: t.tier,
                    name: tierTitle(t),
                    threshold: t.threshold,
                    unlocked: !!row,
                    unlockedAt: row ? row.unlockedAt.toISOString() : null,
                };
            });
            const highest = [...tiers].reverse().find((t) => t.unlocked) ?? null;
            const nextDef = fam.tiers.find((t) => !unlockedMap.has(badgeKeyFor(fam.key, t.tier)));
            return {
                key: fam.key,
                name: fam.name,
                icon: fam.icon,
                unit: fam.unit,
                metric: value,
                currentTier: highest ? highest.tier : null,
                currentTierName: highest ? highest.name : null,
                tiers,
                nextTier: nextDef
                    ? {
                          tier: nextDef.tier,
                          name: tierTitle(nextDef),
                          threshold: nextDef.threshold,
                          progress: clamp01(value / nextDef.threshold),
                      }
                    : null,
            };
        });

        const tiersUnlocked = families.reduce((s, f) => s + f.tiers.filter((t) => t.unlocked).length, 0);

        // następny awans globalnie: rodzina z najbliższym progiem
        let nextTier: GlobalNextTier | null = null;
        for (const f of families) {
            if (!f.nextTier) continue;
            if (!nextTier || f.nextTier.progress > nextTier.progress) {
                nextTier = { ...f.nextTier, family: f.key, familyName: f.name, unit: f.unit };
            }
        }

        return {
            streak: { ...streak, lastActiveWeek },
            families,
            tierUps,
            backfilledCount,
            tiersUnlocked,
            tiersTotal: TIERS_TOTAL,
            nextTier,
        };
    } catch (error) {
        logger.error('[gamification] evaluate failed:', error);
        return emptySummary();
    }
}

/** Ustawia znacznik „widziane" — zbija celebrację po stronie klienta. */
export async function markSeen(userId: string): Promise<void> {
    try {
        await prisma.userGamification.upsert({
            where: { userId },
            create: { userId, lastSeenBadgeAt: new Date() },
            update: { lastSeenBadgeAt: new Date() },
        });
    } catch (error) {
        logger.error('[gamification] markSeen failed:', error);
    }
}
