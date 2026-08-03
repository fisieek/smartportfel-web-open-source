import { describe, it, expect } from 'vitest';
import { getContributionLimit } from './ikeIkzeLimits';

describe('ikeIkzeLimits.getContributionLimit', () => {
    it('returns official IKE limit for 2025', () => {
        expect(getContributionLimit('IKE', 2025)).toBe(26019.0);
    });

    it('returns IKZE employee limit for 2025', () => {
        expect(getContributionLimit('IKZE', 2025, false)).toBe(10407.6);
    });

    it('returns higher IKZE limit for business (B2B) in 2025', () => {
        expect(getContributionLimit('IKZE', 2025, true)).toBe(15611.4);
    });

    it('IKE ignores the business flag', () => {
        expect(getContributionLimit('IKE', 2025, true)).toBe(26019.0);
    });

    it('falls back to latest known year for an unknown future year', () => {
        const latest = getContributionLimit('IKE', 2099);
        expect(latest).toBe(getContributionLimit('IKE', 2026));
    });
});
