import { RealGainsService } from './realGainsService';
import { Decimal } from '@prisma/client/runtime/library';
import { describe, it, expect } from 'vitest';

// Mock SavingsAccount
const mockAccount = (balance: number, rate: number, capType = 'DAILY', promoEnd: string | null = null, promoRate: number | null = null) => ({
    id: '1',
    userId: 'u1',
    name: 'Test',
    bank: 'Bank',
    type: 'SAVINGS',
    balance: new Decimal(balance),
    interestRate: new Decimal(rate),
    capitalizationType: capType,
    promoEndsAt: promoEnd ? new Date(promoEnd) : null,
    postPromoInterestRate: promoRate ? new Decimal(promoRate) : null,
    createdAt: new Date('2024-01-01'), // Start of year
    updatedAt: new Date()
});

describe('RealGainsService', () => {
    it('calculates daily gain correctly', () => {
        const gain = RealGainsService.calculateDailyGain(new Decimal(10000), new Decimal(7));
        expect(gain.toNumber()).toBeCloseTo(1.9178, 3);
    });

    it('simulates a full month with daily capitalization', () => {
        const acc = mockAccount(10000, 7, 'DAILY');
        const result = RealGainsService.simulateMonth(acc as any, new Decimal(10000), 1, 2024); // Jan 2024

        expect(result.daysDetails.length).toBe(31);
        expect(result.totalGross.toNumber()).toBeGreaterThan(59);
        expect(result.totalNet.toNumber()).toBeGreaterThan(0);

        const day1 = result.daysDetails[0];
        expect(day1.gross).toBe(1.92);
        expect(day1.tax).toBe(0.36);
        expect(day1.net).toBe(1.56);
    });

    it('handles promo rate expiration', () => {
        const acc = mockAccount(10000, 7, 'DAILY', '2024-01-10', 1); // Ends Jan 10
        const result = RealGainsService.simulateMonth(acc as any, new Decimal(10000), 1, 2024);

        const day1 = result.daysDetails[0]; // Jan 1
        expect(day1.gross).toBeGreaterThan(1.90);

        const day15 = result.daysDetails[14]; // Jan 15 (Index 14)
        expect(day15.gross).toBeCloseTo(0.27, 1);
    });

    it('calculates correctly for partial month (late creation)', () => {
        const acc = mockAccount(10000, 7, 'DAILY');
        acc.createdAt = new Date('2024-01-20');

        const result = RealGainsService.simulateMonth(acc as any, new Decimal(10000), 1, 2024);

        expect(result.daysDetails.length).toBe(31); // Jan 1..31 (always returns full calendar)
        expect(result.daysDetails[0].date).toBe('2024-01-01');
        expect(result.daysDetails[0].gross).toBe(0); // Zero interest before creation date
        expect(result.daysDetails[19].date).toBe('2024-01-20');
        expect(result.daysDetails[19].gross).toBeGreaterThan(0); // Interest accrues from creation date
        expect(result.totalGross.toNumber()).toBeLessThan(30);
    });
});
