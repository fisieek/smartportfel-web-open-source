import { describe, it, expect } from 'vitest';
import { calculateSavings, BELKA_RATE } from '../savingsMath';

describe('calculateSavings', () => {
    it('bez oprocentowania: saldo = suma wpłat', () => {
        // 1000 startu + 100 × 12 mies. = 2200 zł, zero odsetek
        const r = calculateSavings({ initial: 1000, monthly: 100, annualRatePct: 0, years: 1, compounding: 'monthly', taxBelka: false });
        expect(r.finalGross).toBe(2200);
        expect(r.totalContributions).toBe(2200);
        expect(r.totalInterestGross).toBe(0);
        expect(r.taxPaid).toBe(0);
    });

    it('kapitalizacja miesięczna: 10 000 @ 6% przez rok ≈ 10 616,78 (procent składany co miesiąc)', () => {
        // 10000 × (1 + 0.06/12)^12 = 10000 × 1.005^12 = 10 616,78
        const r = calculateSavings({ initial: 10000, monthly: 0, annualRatePct: 6, years: 1, compounding: 'monthly', taxBelka: false });
        expect(r.finalGross).toBeCloseTo(10616.78, 1);
        expect(r.totalInterestGross).toBeCloseTo(616.78, 1);
    });

    it('kapitalizacja roczna: 10 000 @ 6% przez rok = 10 600 (odsetki dopisane raz na koniec)', () => {
        // odsetki naliczane co miesiąc od 10 000 (0,5% × 12 = 6%), dopisane raz → 600 zł
        const r = calculateSavings({ initial: 10000, monthly: 0, annualRatePct: 6, years: 1, compounding: 'annual', taxBelka: false });
        expect(r.finalGross).toBeCloseTo(10600, 2);
        expect(r.totalInterestGross).toBeCloseTo(600, 2);
    });

    it('podatek Belki 19% zabiera 19% odsetek', () => {
        const gross = calculateSavings({ initial: 10000, monthly: 0, annualRatePct: 6, years: 1, compounding: 'monthly', taxBelka: false });
        const net = calculateSavings({ initial: 10000, monthly: 0, annualRatePct: 6, years: 1, compounding: 'monthly', taxBelka: true });
        expect(net.taxPaid).toBeCloseTo(gross.totalInterestGross * BELKA_RATE, 1);
        expect(net.finalNet).toBeCloseTo(gross.finalGross - gross.totalInterestGross * BELKA_RATE, 1);
        expect(net.totalInterestNet).toBeCloseTo(gross.totalInterestGross * (1 - BELKA_RATE), 1);
    });

    it('seria narastania ma punkt na start i po każdym roku', () => {
        const r = calculateSavings({ initial: 5000, monthly: 500, annualRatePct: 5, years: 10, compounding: 'monthly', taxBelka: true });
        expect(r.series).toHaveLength(11); // rok 0..10
        expect(r.series[0]).toMatchObject({ year: 0, contributions: 5000, balanceGross: 5000 });
        expect(r.series[10].year).toBe(10);
        // saldo końcowe = ostatni punkt serii
        expect(r.series[10].balanceGross).toBeCloseTo(r.finalGross, 2);
        expect(r.series[10].balanceNet).toBeCloseTo(r.finalNet, 2);
    });

    it('dopłaty miesięczne procentują (saldo > suma wpłat)', () => {
        // 100 zł/mies przez 30 lat @ 5% mies. → kapitał 36 000, saldo znacznie wyższe
        const r = calculateSavings({ initial: 0, monthly: 100, annualRatePct: 5, years: 30, compounding: 'monthly', taxBelka: false });
        expect(r.totalContributions).toBe(36000);
        expect(r.finalGross).toBeGreaterThan(80000); // efekt procentu składanego
    });

    it('edge: 0 lat zwraca kapitał startowy', () => {
        const r = calculateSavings({ initial: 2500, monthly: 300, annualRatePct: 8, years: 0, compounding: 'monthly', taxBelka: true });
        expect(r.finalGross).toBe(2500);
        expect(r.finalNet).toBe(2500);
        expect(r.series).toHaveLength(1);
    });
});
