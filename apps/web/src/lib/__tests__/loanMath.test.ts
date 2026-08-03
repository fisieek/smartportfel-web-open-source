import { describe, it, expect } from 'vitest';
import { suggestInstallment, generateSchedule, compareOverpayment } from '../loanMath';

describe('suggestInstallment', () => {
    it('liczy annuitet (EQUAL) dla 300 000 @ 7,5% / 300 mies.', () => {
        const s = suggestInstallment({
            currentBalance: 300000,
            termMonths: 300,
            marginRate: 2.0,
            referenceRate: 5.5,
            installmentType: 'EQUAL',
            paymentsMade: 0,
        });
        expect(s).not.toBeNull();
        // PMT = 300000 * 0.00625 / (1 - 1.00625^-300) ≈ 2216,94
        expect(s!.totalAmount).toBeGreaterThan(2216);
        expect(s!.totalAmount).toBeLessThan(2218);
        expect(s!.interestAmount).toBeCloseTo(1875.0, 1);
        expect(s!.principalAmount).toBeCloseTo(s!.totalAmount - s!.interestAmount, 2);
        expect(s!.remainingMonths).toBe(300);
    });

    it('liczy annuitet dla przykładu z 7,75% / 360 mies.', () => {
        const s = suggestInstallment({
            currentBalance: 300000,
            termMonths: 360,
            marginRate: 2.25,
            referenceRate: 5.5,
            installmentType: 'EQUAL',
            paymentsMade: 0,
        });
        expect(s).not.toBeNull();
        // PMT dla 300k @ 7.75%/360 ≈ 2149,17; odsetki pierwszego miesiąca = 300000*0.0775/12 = 1937,50
        expect(s!.totalAmount).toBeGreaterThan(2100);
        expect(s!.totalAmount).toBeLessThan(2200);
        expect(s!.interestAmount).toBeCloseTo(1937.5, 1);
    });

    it('liczy ratę malejącą (DECREASING)', () => {
        const s = suggestInstallment({
            currentBalance: 120000,
            termMonths: 120,
            marginRate: 3.0,
            referenceRate: 3.0,
            installmentType: 'DECREASING',
            paymentsMade: 0,
        });
        expect(s).not.toBeNull();
        expect(s!.principalAmount).toBeCloseTo(1000, 2); // 120000 / 120
        expect(s!.interestAmount).toBeCloseTo(600, 2); // 120000 * 6% / 12
        expect(s!.totalAmount).toBeCloseTo(1600, 2);
    });

    it('uwzględnia spłacone raty w pozostałym okresie', () => {
        const s = suggestInstallment({
            currentBalance: 100000,
            termMonths: 100,
            marginRate: 0,
            referenceRate: 0,
            installmentType: 'EQUAL',
            paymentsMade: 50,
        });
        expect(s).not.toBeNull();
        expect(s!.remainingMonths).toBe(50);
        expect(s!.totalAmount).toBeCloseTo(2000, 2); // zerowa stopa → B/n
        expect(s!.interestAmount).toBe(0);
    });

    it('zwraca null przy braku parametrów', () => {
        expect(suggestInstallment({
            currentBalance: 300000, termMonths: null, marginRate: 2, referenceRate: 5,
            installmentType: 'EQUAL', paymentsMade: 0,
        })).toBeNull();
        expect(suggestInstallment({
            currentBalance: 300000, termMonths: 300, marginRate: null, referenceRate: null,
            installmentType: 'EQUAL', paymentsMade: 0,
        })).toBeNull();
        expect(suggestInstallment({
            currentBalance: 300000, termMonths: 300, marginRate: 2, referenceRate: 5,
            installmentType: null, paymentsMade: 0,
        })).toBeNull();
        expect(suggestInstallment({
            currentBalance: 0, termMonths: 300, marginRate: 2, referenceRate: 5,
            installmentType: 'EQUAL', paymentsMade: 0,
        })).toBeNull();
    });
});

describe('generateSchedule', () => {
    const base = { principal: 300000, termMonths: 360, annualRatePercent: 7.0, installmentType: 'EQUAL' as const };

    it('annuitet 300 000 @ 7% / 360 mies. — rata ~1995,91, harmonogram domyka saldo', () => {
        const s = generateSchedule(base)!;
        expect(s.months).toBe(360);
        expect(s.firstInstallment).toBeCloseTo(1995.91, 1);
        expect(s.rows[359].balance).toBe(0);
        // suma kapitału = kwota kredytu
        const totalPrincipal = s.rows.reduce((acc, r) => acc + r.principal, 0);
        expect(totalPrincipal).toBeCloseTo(300000, 0);
        expect(s.totalPaid).toBeCloseTo(s.totalInterest + 300000, 0);
    });

    it('raty malejące — pierwsza wyższa od ostatniej, kapitał stały', () => {
        const s = generateSchedule({ ...base, installmentType: 'DECREASING' })!;
        expect(s.months).toBe(360);
        // pierwsza: 833,33 kapitału + 1750 odsetek
        expect(s.firstInstallment).toBeCloseTo(2583.33, 1);
        expect(s.lastInstallment).toBeLessThan(s.firstInstallment);
        expect(s.rows[0].principal).toBeCloseTo(833.33, 1);
        expect(s.rows[200].principal).toBeCloseTo(833.33, 1);
        expect(s.rows[359].balance).toBe(0);
        // malejące mają niższy koszt odsetkowy niż równe
        expect(s.totalInterest).toBeLessThan(generateSchedule(base)!.totalInterest);
    });

    it('stopa 0% — rata = kapitał / okres, zero odsetek', () => {
        const s = generateSchedule({ principal: 120000, termMonths: 120, annualRatePercent: 0, installmentType: 'EQUAL' })!;
        expect(s.firstInstallment).toBeCloseTo(1000, 2);
        expect(s.totalInterest).toBe(0);
        expect(s.months).toBe(120);
    });

    it('nadpłata SHORTEN_TERM skraca okres i nie zmienia raty', () => {
        const s = generateSchedule({ ...base, monthlyOverpayment: 500, overpaymentStrategy: 'SHORTEN_TERM' })!;
        expect(s.months).toBeLessThan(360);
        expect(s.rows[0].payment).toBeCloseTo(2495.91, 1); // rata + 500
        expect(s.rows[0].overpayment).toBe(500);
        expect(s.rows[s.months - 1].balance).toBe(0);
    });

    it('nadpłata LOWER_INSTALLMENT obniża ratę z czasem; okres krótszy niż bazowy, ale dłuższy niż przy SHORTEN_TERM', () => {
        const s = generateSchedule({ ...base, monthlyOverpayment: 500, overpaymentStrategy: 'LOWER_INSTALLMENT' })!;
        const shorten = generateSchedule({ ...base, monthlyOverpayment: 500, overpaymentStrategy: 'SHORTEN_TERM' })!;
        // stała nadpłata domyka kredyt przed terminem także przy obniżaniu raty
        expect(s.months).toBeLessThanOrEqual(360);
        expect(s.months).toBeGreaterThan(shorten.months);
        // rata maleje z czasem (kapitał topnieje szybciej)
        expect(s.rows[120].payment).toBeLessThan(s.rows[0].payment);
        expect(s.rows[s.months - 1].balance).toBe(0);
    });

    it('odrzuca nieprawidłowe parametry', () => {
        expect(generateSchedule({ ...base, principal: 0 })).toBeNull();
        expect(generateSchedule({ ...base, termMonths: 0 })).toBeNull();
        expect(generateSchedule({ ...base, annualRatePercent: -1 })).toBeNull();
    });
});

describe('compareOverpayment', () => {
    it('nadpłata 500 zł przy 300 000 @ 7%/360: realna oszczędność odsetek i skrócenie okresu', () => {
        const c = compareOverpayment(
            { principal: 300000, termMonths: 360, annualRatePercent: 7.0, installmentType: 'EQUAL' },
            500,
            'SHORTEN_TERM'
        )!;
        expect(c.monthsSaved).toBeGreaterThan(90);
        expect(c.interestSaved).toBeGreaterThan(80000);
        expect(c.interestSaved).toBeCloseTo(c.base.totalInterest - c.withOverpayment.totalInterest, 2);
    });

    it('LOWER_INSTALLMENT: odsetki niższe, ale oszczędność mniejsza niż przy skracaniu okresu', () => {
        const c = compareOverpayment(
            { principal: 300000, termMonths: 360, annualRatePercent: 7.0, installmentType: 'EQUAL' },
            500,
            'LOWER_INSTALLMENT'
        )!;
        expect(c.monthsSaved).toBeGreaterThanOrEqual(0);
        expect(c.interestSaved).toBeGreaterThan(0);
        // skracanie okresu oszczędza więcej niż obniżanie raty
        const shorten = compareOverpayment(
            { principal: 300000, termMonths: 360, annualRatePercent: 7.0, installmentType: 'EQUAL' },
            500,
            'SHORTEN_TERM'
        )!;
        expect(shorten.interestSaved).toBeGreaterThan(c.interestSaved);
    });
});
