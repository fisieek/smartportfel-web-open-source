import { describe, it, expect } from 'vitest';
import {
    ppkMonthly,
    costPer100,
    ppkProjection,
    annualTopUpThreshold,
    PPK_WELCOME_BONUS,
    PPK_ANNUAL_BONUS,
} from '../ppkMath';

describe('ppkMonthly', () => {
    it('8000 brutto, 2% + 1,5% (I próg PIT)', () => {
        const m = ppkMonthly(8000, 2, 1.5);
        expect(m.employee).toBe(160); // 8000 × 2%
        expect(m.employer).toBe(120); // 8000 × 1,5%
        expect(m.employerTax).toBe(14.4); // 120 × 12%
        expect(m.toAccount).toBe(280); // 160 + 120 wpływa na konto
        expect(m.netCost).toBe(174.4); // 160 + 14,40 realny koszt
    });

    it('powyżej progu 120 000 zł/rok liczymy PIT 32%', () => {
        const m = ppkMonthly(12000, 2, 1.5); // 144 000/rok > 120 000
        expect(m.employer).toBe(180);
        expect(m.employerTax).toBe(57.6); // 180 × 32%
    });

    it('insight: 100 zł na koncie kosztuje ~62 zł netto', () => {
        const m = ppkMonthly(8000, 2, 1.5);
        expect(costPer100(m)).toBeCloseTo(62.29, 2); // 174,40 / 280 × 100
    });

    it('edge: 0 brutto → zera', () => {
        const m = ppkMonthly(0, 2, 1.5);
        expect(m.toAccount).toBe(0);
        expect(costPer100(m)).toBe(0);
    });
});

describe('annualTopUpThreshold', () => {
    it('2026: 3,5% × 6 × 4806 = 1009,26 zł (zgodne z serwerem)', () => {
        expect(annualTopUpThreshold(2026)).toBeCloseTo(1009.26, 2);
    });
});

describe('ppkProjection', () => {
    it('30 lat @ 5%: struktura serii i dopłaty państwa', () => {
        const p = ppkProjection({ grossMonthly: 8000, employeeRatePct: 2, employerRatePct: 1.5, currentAge: 30, annualReturnPct: 5 });
        expect(p.years).toBe(30);
        expect(p.series).toHaveLength(30);
        expect(p.qualifiesAnnualBonus).toBe(true);

        // Rok 1: wpłaty 1920 (pracownik) + 1440 (pracodawca) + 490 (240 roczna + 250 powitalna)
        const y1 = p.series[0];
        expect(y1.employee).toBe(1920);
        expect(y1.employer).toBe(1440);
        expect(y1.state).toBe(PPK_WELCOME_BONUS + PPK_ANNUAL_BONUS); // 490
        expect(y1.total).toBeCloseTo(4042.5, 1); // (1920+1440+490) × 1,05

        // Sumy na koniec: pracownik 1920×30, pracodawca 1440×30, państwo 490 + 240×29
        expect(p.totalEmployee).toBe(57600);
        expect(p.totalEmployer).toBe(43200);
        expect(p.totalState).toBe(490 + 240 * 29); // 7450
        expect(p.totalGains).toBeGreaterThan(0);
        expect(p.finalCapital).toBeGreaterThan(p.totalEmployee + p.totalEmployer + p.totalState);
    });

    it('bardzo niska wpłata może nie łapać dopłaty rocznej', () => {
        // 0,5% pracownik + 1,5% pracodawca od niskiej pensji → roczne < 1009,26
        const p = ppkProjection({ grossMonthly: 2000, employeeRatePct: 0.5, employerRatePct: 1.5, currentAge: 40, annualReturnPct: 4 });
        // 2000×0,5%×12 + 2000×1,5%×12 = 120 + 360 = 480 < 1009,26
        expect(p.qualifiesAnnualBonus).toBe(false);
        expect(p.totalState).toBe(PPK_WELCOME_BONUS); // tylko powitalna, bez rocznych
    });
});
