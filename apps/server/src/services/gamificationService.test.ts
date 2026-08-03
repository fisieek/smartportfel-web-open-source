import { describe, it, expect } from 'vitest';
import {
    warsawWeekOrdinal,
    isoWeekKey,
    computeStreakFromOrdinals,
    BADGE_FAMILIES,
    type BadgeCtx,
    type BadgeFamily,
} from './gamificationService';

// Południe UTC, żeby cywilna data w Europe/Warsaw zgadzała się z zamierzoną.
const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12));

const ctx = (over: Partial<BadgeCtx> = {}): BadgeCtx => ({
    expenseCount: 0,
    savingsTotalPln: 0,
    investTotalPln: 0,
    longestStreakWeeks: 0,
    completedGoalsCount: 0,
    ...over,
});

const fam = (key: string): BadgeFamily => BADGE_FAMILIES.find((f) => f.key === key)!;
const tiersReached = (family: BadgeFamily, value: number): string[] =>
    family.tiers.filter((t) => value >= t.threshold).map((t) => t.tier);

describe('warsawWeekOrdinal', () => {
    it('ten sam tydzień (Pon–Nd) → ten sam ordinal', () => {
        expect(warsawWeekOrdinal(at(2026, 6, 22))).toBe(warsawWeekOrdinal(at(2026, 6, 28)));
    });
    it('kolejny tydzień → ordinal +1', () => {
        expect(warsawWeekOrdinal(at(2026, 6, 29))).toBe(warsawWeekOrdinal(at(2026, 6, 22)) + 1);
    });
});

describe('isoWeekKey', () => {
    it('tydzień przełomu roku liczony po ISO (czwartek decyduje)', () => {
        expect(isoWeekKey(at(2025, 12, 29))).toBe('2026-W01');
        expect(isoWeekKey(at(2026, 1, 1))).toBe('2026-W01');
        expect(isoWeekKey(at(2026, 1, 4))).toBe('2026-W01');
        expect(isoWeekKey(at(2026, 1, 5))).toBe('2026-W02');
    });
});

describe('computeStreakFromOrdinals', () => {
    it('ACTIVE — ciąg sięga bieżącego tygodnia', () => {
        expect(computeStreakFromOrdinals(new Set([10, 9, 8]), 10)).toEqual({ current: 3, longest: 3, status: 'ACTIVE' });
    });
    it('AT_RISK — ciąg kończy się na poprzednim tygodniu', () => {
        expect(computeStreakFromOrdinals(new Set([9, 8]), 10)).toEqual({ current: 2, longest: 2, status: 'AT_RISK' });
    });
    it('BROKEN — ostatnia aktywność wcześniej niż poprzedni tydzień', () => {
        expect(computeStreakFromOrdinals(new Set([5, 4]), 10)).toEqual({ current: 0, longest: 2, status: 'BROKEN' });
    });
    it('NONE — brak aktywności', () => {
        expect(computeStreakFromOrdinals(new Set(), 10)).toEqual({ current: 0, longest: 0, status: 'NONE' });
    });
    it('luka skraca bieżącą serię, ale rekord liczony z całości', () => {
        const r = computeStreakFromOrdinals(new Set([10, 8, 7, 6]), 10);
        expect(r).toEqual({ current: 1, longest: 3, status: 'ACTIVE' });
    });
});

describe('rodziny i progi (BADGE_FAMILIES)', () => {
    it('5 rodzin, łącznie 19 poziomów (4+4+4+4+3)', () => {
        expect(BADGE_FAMILIES).toHaveLength(5);
        expect(BADGE_FAMILIES.reduce((s, f) => s + f.tiers.length, 0)).toBe(19);
        expect(BADGE_FAMILIES.map((f) => f.key).sort()).toEqual(
            ['goals', 'investing', 'savings', 'streak', 'tracking']
        );
    });

    it('Poduszka: progi 100/10k/100k/500k z dokładnością do granicy', () => {
        const s = fam('savings');
        expect(s.tiers.map((t) => t.threshold)).toEqual([100, 10000, 100000, 500000]);
        expect(tiersReached(s, 99)).toEqual([]);
        expect(tiersReached(s, 100)).toEqual(['bronze']);
        expect(tiersReached(s, 9999)).toEqual(['bronze']);
        expect(tiersReached(s, 10000)).toEqual(['bronze', 'silver']);
        expect(tiersReached(s, 250000)).toEqual(['bronze', 'silver', 'gold']);
    });

    it('Tropiciel: metryka = liczba wydatków, progi 1/100/1000/5000', () => {
        const t = fam('tracking');
        expect(t.metric(ctx({ expenseCount: 250 }))).toBe(250);
        expect(tiersReached(t, 0)).toEqual([]);
        expect(tiersReached(t, 250)).toEqual(['bronze', 'silver']);
        expect(tiersReached(t, 5000)).toEqual(['bronze', 'silver', 'gold', 'platinum']);
    });

    it('Konsekwencja: fold Systematyk/Maraton + złoto/platyna (4/12/26/52)', () => {
        const s = fam('streak');
        expect(s.tiers.map((t) => t.threshold)).toEqual([4, 12, 26, 52]);
        expect(s.tiers[0].name).toBe('Systematyk');
        expect(s.tiers[1].name).toBe('Maraton');
        expect(s.metric(ctx({ longestStreakWeeks: 30 }))).toBe(30);
        expect(tiersReached(s, 30)).toEqual(['bronze', 'silver', 'gold']);
    });

    it('Inwestor: bronze od pierwszego instrumentu', () => {
        const i = fam('investing');
        expect(i.metric(ctx({ investTotalPln: 42000 }))).toBe(42000);
        expect(tiersReached(i, 0)).toEqual([]);
        expect(tiersReached(i, 1)).toEqual(['bronze']);
        expect(tiersReached(i, 42000)).toEqual(['bronze', 'silver']);
    });

    it('Łowca celów: 3 poziomy, metryka = domknięte cele', () => {
        const g = fam('goals');
        expect(g.tiers).toHaveLength(3);
        expect(g.metric(ctx({ completedGoalsCount: 5 }))).toBe(5);
        expect(tiersReached(g, 5)).toEqual(['bronze', 'silver']);
    });
});
