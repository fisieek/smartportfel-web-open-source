import { describe, it, expect } from 'vitest';
import {
    uopGrossToNet,
    uopNetToGross,
    zlecenieGrossToNet,
    b2bMonthly,
    b2bCompareForms,
    PARAMS_BY_YEAR,
    DEFAULT_YEAR,
} from '../salaryMath';

import type { SalaryResult } from '../salaryMath';

const row = (result: SalaryResult, key: string) => result.rows.find((r) => r.key === key);

describe('salaryMath — parametry', () => {
    it('rok domyślny ma komplet parametrów', () => {
        const p = PARAMS_BY_YEAR[DEFAULT_YEAR];
        expect(p.minWage).toBe(4806);
        expect(p.b2b.bases.duzy).toBe(5652);
        expect(p.b2b.bases.preferencyjny).toBeCloseTo(0.3 * p.minWage, 2);
        expect(p.b2b.health.minimum).toBeCloseTo(0.09 * p.minWage, 2);
        expect(p.b2b.health.ryczaltTiers).toHaveLength(3);
    });
});

describe('uopGrossToNet', () => {
    it('minimalna krajowa 2026 (4806, PIT-2, KUP 250, bez PPK)', () => {
        // emerytalna 469.07 + rentowa 72.09 + chorobowa 117.75 = 658.91
        // zdrowotna 9% × 4147.09 = 373.24
        // podstawa 4806 − 658.91 − 250 = 3897 → zaliczka 12% − 300 = 167.64 → 168
        // netto 4806 − 658.91 − 373.24 − 168 = 3605.85
        const r = uopGrossToNet({ grossMonthly: 4806 });
        expect(row(r, 'emerytalna')!.amount).toBeCloseTo(469.07, 2);
        expect(row(r, 'rentowa')!.amount).toBeCloseTo(72.09, 2);
        expect(row(r, 'chorobowa')!.amount).toBeCloseTo(117.75, 2);
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(373.24, 2);
        expect(row(r, 'pit')!.amount).toBe(168);
        expect(r.netMonthly).toBeCloseTo(3605.85, 2);
        expect(r.warnings).toHaveLength(0);
    });

    it('8000 brutto (PIT-2, KUP 250, bez PPK)', () => {
        // społeczne 1096.80; zdrowotna 9% × 6903.20 = 621.29
        // podstawa 8000 − 1096.80 − 250 = 6653 → zaliczka 798.36 − 300 = 498.36 → 498
        // netto 8000 − 1096.80 − 621.29 − 498 = 5783.91
        const r = uopGrossToNet({ grossMonthly: 8000 });
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(621.29, 2);
        expect(row(r, 'pit')!.amount).toBe(498);
        expect(r.netMonthly).toBeCloseTo(5783.91, 2);
    });

    it('8000 brutto + PPK 2%/1,5% — wpłata pracodawcy podnosi podstawę PIT', () => {
        // ppk pracownika 160; ppk pracodawcy 120 (przychód)
        // podstawa 8000 − 1096.80 − 250 + 120 = 6773 → zaliczka 812.76 − 300 = 513
        // netto 8000 − 1096.80 − 621.29 − 513 − 160 = 5608.91
        const r = uopGrossToNet({ grossMonthly: 8000, ppkEmployeeRate: 0.02, ppkEmployerRate: 0.015 });
        expect(row(r, 'ppkEmployee')!.amount).toBeCloseTo(160, 2);
        expect(row(r, 'ppkEmployer')!.amount).toBeCloseTo(120, 2);
        expect(row(r, 'ppkEmployer')!.kind).toBe('info');
        expect(row(r, 'pit')!.amount).toBe(513);
        expect(r.netMonthly).toBeCloseTo(5608.91, 2);
    });

    it('ulga dla młodych: zaliczka 0, warning powyżej limitu rocznego', () => {
        // netto 8000 − 1096.80 − 621.29 = 6281.91; 96 000 > 85 528 → warning
        const r = uopGrossToNet({ grossMonthly: 8000, under26: true });
        expect(row(r, 'pit')!.amount).toBe(0);
        expect(r.netMonthly).toBeCloseTo(6281.91, 2);
        expect(r.warnings.some((w) => w.includes('85'))).toBe(true);
    });

    it('25 000 brutto — drugi próg 32% (miesięcznie) + warning 30-krotności', () => {
        // społeczne 3427.50; podstawa 21 323
        // zaliczka 12%×10000 + 32%×11323 − 300 = 4523.36 → 4523
        const r = uopGrossToNet({ grossMonthly: 25000 });
        expect(row(r, 'pit')!.amount).toBe(4523);
        expect(r.netMonthly).toBeCloseTo(25000 - 3427.5 - 1941.53 - 4523, 1);
        expect(r.warnings.some((w) => w.includes('30-krotności'))).toBe(true);
        expect(r.warnings.some((w) => w.includes('32%'))).toBe(true);
    });

    it('KUP 300 obniża zaliczkę względem KUP 250', () => {
        const std = uopGrossToNet({ grossMonthly: 8000, kup: 'standard' });
        const inc = uopGrossToNet({ grossMonthly: 8000, kup: 'increased' });
        expect(inc.netMonthly).toBeGreaterThan(std.netMonthly);
    });

    it('brutto 0 → netto 0, bez wierszy', () => {
        const r = uopGrossToNet({ grossMonthly: 0 });
        expect(r.netMonthly).toBe(0);
        expect(r.rows).toHaveLength(0);
    });
});

describe('uopNetToGross', () => {
    it('round-trip: netto 5783.91 → brutto ≈ 8000', () => {
        const r = uopNetToGross(5783.91);
        expect(r.grossMonthly).toBeCloseTo(8000, 0);
        expect(r.netMonthly).toBeCloseTo(5783.91, 1);
    });

    it('round-trip przy minimalnej', () => {
        const r = uopNetToGross(3605.85);
        expect(r.grossMonthly).toBeCloseTo(4806, 0);
    });
});

describe('zlecenieGrossToNet', () => {
    it('uczeń/student do 26 r.ż.: netto = brutto, zero potrąceń', () => {
        const r = zlecenieGrossToNet({ grossMonthly: 3000, studentUnder26: true });
        expect(r.netMonthly).toBe(3000);
        expect(r.rows.filter((x) => x.kind === 'deduction')).toHaveLength(0);
    });

    it('8000 brutto, bez chorobowej, bez PIT-2', () => {
        // społeczne 900.80 (em. 780.80 + rent. 120.00); zdrowotna 9% × 7099.20 = 638.93
        // KUP 20% × 7099.20 = 1419.84; podstawa 5679 → zaliczka 681.48 → 681
        // netto 8000 − 900.80 − 638.93 − 681 = 5779.27
        const r = zlecenieGrossToNet({ grossMonthly: 8000 });
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(638.93, 2);
        expect(row(r, 'kup')!.amount).toBeCloseTo(1419.84, 2);
        expect(row(r, 'pit')!.amount).toBe(681);
        expect(r.netMonthly).toBeCloseTo(5779.27, 2);
    });

    it('dobrowolna chorobowa obniża netto', () => {
        const bez = zlecenieGrossToNet({ grossMonthly: 8000 });
        const z = zlecenieGrossToNet({ grossMonthly: 8000, chorobowa: true });
        expect(z.netMonthly).toBeLessThan(bez.netMonthly);
        expect(row(z, 'chorobowa')!.amount).toBeCloseTo(196, 2);
    });

    it('warning o hipotetycznej zaliczce przy niskiej kwocie', () => {
        const r = zlecenieGrossToNet({ grossMonthly: 1500 });
        expect(r.warnings.some((w) => w.includes('hipotetycznej'))).toBe(true);
    });
});

describe('b2bMonthly', () => {
    const p = PARAMS_BY_YEAR[DEFAULT_YEAR];

    it('liniowy, duży ZUS, 20 000 przychód / 2 000 kosztów', () => {
        // Społeczne (podstawa 5652, z chorobową i FP) — liczone z parametrów:
        const r5 = p.b2b.rates;
        const base = p.b2b.bases.duzy;
        const social =
            Math.round(base * r5.emerytalna * 100) / 100 +
            Math.round(base * r5.rentowa * 100) / 100 +
            Math.round(base * r5.chorobowa * 100) / 100 +
            Math.round(base * r5.wypadkowa * 100) / 100 +
            Math.round(base * r5.funduszPracy * 100) / 100; // 1926.76
        expect(social).toBeCloseTo(1926.76, 2);

        // dochód 16 073.24; zdrowotna 4,9% = 787.59 (odliczalna, poniżej limitu 1175/mies.)
        // podstawa 15 286 → PIT 19% = 2904; netto 12 381.65
        const r = b2bMonthly({ monthlyRevenue: 20000, monthlyCosts: 2000, taxForm: 'liniowy', zusVariant: 'duzy' });
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(787.59, 2);
        expect(row(r, 'pit')!.amount).toBe(2904);
        expect(r.netMonthly).toBeCloseTo(20000 - 2000 - social - 787.59 - 2904, 2); // 12 381.65
    });

    it('ryczałt 12%, preferencyjny ZUS, 15 000 przychodu — tier 2 zdrowotnej', () => {
        // społeczne (podstawa 1441.80, z chorobową, bez FP): 281.44+115.34+35.32+24.08 = 456.18
        // przychód roczny 180 000 → zdrowotna 830.58; podstawa 15000−456.18−415.29 = 14 129
        // ryczałt 12% = 1695; netto 15 000 − 456.18 − 830.58 − 1695 = 12 018.24
        const r = b2bMonthly({ monthlyRevenue: 15000, taxForm: 'ryczalt', ryczaltRate: 0.12, zusVariant: 'preferencyjny' });
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(830.58, 2);
        expect(row(r, 'pit')!.amount).toBe(1695);
        expect(r.netMonthly).toBeCloseTo(12018.24, 2);
        expect(row(r, 'funduszPracy')).toBeUndefined();
    });

    it('skala: zdrowotna 9% dochodu nieodliczalna, kwota zmniejszająca stosowana', () => {
        // przychód 10 000, koszty 0, duży ZUS: dochód 8073.24
        // zdrowotna 9% = 726.59; podstawa 8073 → zaliczka 968.76 − 300 = 668.76 → 669
        const r = b2bMonthly({ monthlyRevenue: 10000, taxForm: 'skala', zusVariant: 'duzy' });
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(726.59, 2);
        expect(row(r, 'pit')!.amount).toBe(669);
    });

    it('ulga na start: zero społecznych, tylko zdrowotna + podatek', () => {
        const r = b2bMonthly({ monthlyRevenue: 10000, taxForm: 'liniowy', zusVariant: 'ulga_na_start' });
        expect(row(r, 'emerytalna')).toBeUndefined();
        expect(r.warnings.some((w) => w.includes('Ulga na start'))).toBe(true);
    });

    it('koszty > przychód: PIT 0, zdrowotna na minimum ustawowym', () => {
        const r = b2bMonthly({ monthlyRevenue: 3000, monthlyCosts: 5000, taxForm: 'liniowy', zusVariant: 'duzy' });
        expect(row(r, 'pit')!.amount).toBe(0);
        expect(row(r, 'zdrowotna')!.amount).toBeCloseTo(p.b2b.health.minimum, 2);
        expect(r.netMonthly).toBeLessThan(0);
    });

    it('przychód 0 → netto 0', () => {
        const r = b2bMonthly({ monthlyRevenue: 0, taxForm: 'skala', zusVariant: 'duzy' });
        expect(r.netMonthly).toBe(0);
    });
});

describe('b2bCompareForms', () => {
    it('zwraca wyniki dla 3 form przy tych samych danych', () => {
        const c = b2bCompareForms({ monthlyRevenue: 15000, monthlyCosts: 1500, zusVariant: 'duzy' }, 0.12);
        expect(c.skala.netMonthly).toBeGreaterThan(0);
        expect(c.liniowy.netMonthly).toBeGreaterThan(0);
        expect(c.ryczalt.netMonthly).toBeGreaterThan(0);
        // przy 15k/1.5k skala jeszcze wygrywa z liniowym (kwota zmniejszająca + 12% do 10k/mies.)
        expect(c.skala.netMonthly).toBeGreaterThan(c.liniowy.netMonthly);
    });

    it('przy wysokim dochodzie liniowy wygrywa ze skalą (32% od nadwyżki)', () => {
        const c = b2bCompareForms({ monthlyRevenue: 40000, monthlyCosts: 5000, zusVariant: 'duzy' }, 0.12);
        expect(c.liniowy.netMonthly).toBeGreaterThan(c.skala.netMonthly);
    });
});
