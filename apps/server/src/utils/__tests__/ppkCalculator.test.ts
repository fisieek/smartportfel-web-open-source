import { describe, it, expect, vi } from 'vitest';
import { annualTopUpThreshold, WELCOME_BONUS, ANNUAL_BONUS } from '../ppkCalculator';

describe('ppkCalculator — dotacje państwowe', () => {
    it('kwoty ustawowe są stałe', () => {
        expect(WELCOME_BONUS).toBe(250);
        expect(ANNUAL_BONUS).toBe(240);
    });

    it('annualTopUpThreshold = 3,5% × 6 × min. wynagrodzenie danego roku', () => {
        // 2024: 3,5% × 6 × 4300 = 903
        expect(annualTopUpThreshold(2024)).toBeCloseTo(903, 2);
        // 2023: 3,5% × 6 × 3600 = 756
        expect(annualTopUpThreshold(2023)).toBeCloseTo(756, 2);
        // 2019: 3,5% × 6 × 2250 = 472,5
        expect(annualTopUpThreshold(2019)).toBeCloseTo(472.5, 2);
    });

    it('rok spoza tabeli → fallback do ostatniej znanej wartości (z warnem)', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // 2035 nieznany → fallback do 2026 (4806): 3,5% × 6 × 4806 = 1009,26
        expect(annualTopUpThreshold(2035)).toBeCloseTo(1009.26, 2);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});
