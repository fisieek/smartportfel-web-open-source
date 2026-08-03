import { describe, it, expect } from 'vitest';
import { creditCapacity, STRESS_BUFFER_PP } from '../creditCapacityMath';

describe('creditCapacity', () => {
    it('maks. rata = dochód × DStI − zobowiązania', () => {
        const r = creditCapacity({ netIncome: 10000, monthlyObligations: 500, annualRatePct: 7, termYears: 25, maxDStI: 0.5 });
        expect(r.maxPayment).toBe(4500); // 10000 × 50% − 500
    });

    it('zdolność jest spójna: annuitet maks. kwoty przy stopie z buforem ≈ maks. rata', () => {
        const r = creditCapacity({ netIncome: 10000, monthlyObligations: 0, annualRatePct: 7, termYears: 25, maxDStI: 0.5 });
        // rata annuitetowa od maxLoanAmount przy stopie 9,5% (7 + bufor 2,5) powinna wrócić ~maxPayment 5000
        const rMonthly = (7 + STRESS_BUFFER_PP) / 1200;
        const n = 25 * 12;
        const backPayment = (r.maxLoanAmount * rMonthly) / (1 - Math.pow(1 + rMonthly, -n));
        expect(backPayment).toBeCloseTo(r.maxPayment, 0);
        expect(r.maxPayment).toBe(5000);
    });

    it('bufor KNF podnosi stopę użytą do zdolności o 2,5 p.p.', () => {
        const r = creditCapacity({ netIncome: 8000, monthlyObligations: 0, annualRatePct: 7, termYears: 30, maxDStI: 0.5 });
        expect(r.stressedRatePct).toBe(9.5);
        // realna rata (przy 7%) jest niższa niż maks. rata (policzona buforem 9,5%) — to margines
        expect(r.realInstallment).toBeLessThan(r.maxPayment);
    });

    it('kredyt na stałą stopę: bez bufora', () => {
        const r = creditCapacity({ netIncome: 8000, monthlyObligations: 0, annualRatePct: 7, termYears: 30, maxDStI: 0.5, fixedRate: true });
        expect(r.stressedRatePct).toBe(7);
        // bez bufora realna rata ≈ maks. rata
        expect(r.realInstallment).toBeCloseTo(r.maxPayment, 0);
    });

    it('wyższy DStI = wyższa zdolność', () => {
        const base = { netIncome: 9000, monthlyObligations: 0, annualRatePct: 7, termYears: 25 };
        const ostrozny = creditCapacity({ ...base, maxDStI: 0.4 });
        const agresywny = creditCapacity({ ...base, maxDStI: 0.6 });
        expect(agresywny.maxLoanAmount).toBeGreaterThan(ostrozny.maxLoanAmount);
    });

    it('edge: zobowiązania większe niż limit raty → zdolność zerowa', () => {
        const r = creditCapacity({ netIncome: 5000, monthlyObligations: 3000, annualRatePct: 7, termYears: 25, maxDStI: 0.5 });
        expect(r.maxPayment).toBe(0);
        expect(r.maxLoanAmount).toBe(0);
        expect(r.warnings.some((w) => w.includes('zerowa'))).toBe(true);
    });

    it('całkowity koszt = suma rat, odsetki = koszt − kapitał', () => {
        const r = creditCapacity({ netIncome: 12000, monthlyObligations: 1000, annualRatePct: 6.5, termYears: 30, maxDStI: 0.5 });
        expect(r.totalCost).toBeCloseTo(r.realInstallment * 30 * 12, 0);
        expect(r.totalInterest).toBeCloseTo(r.totalCost - r.maxLoanAmount, 1);
        expect(r.maxLoanAmount).toBeGreaterThan(0);
    });
});
