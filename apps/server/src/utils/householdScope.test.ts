import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getHouseholdCoMemberIds, validatePersonalAccountAccess, validateTransactionAccess } from './householdScope';
import prisma from '../lib/prisma';

vi.mock('../lib/prisma', () => ({
    default: {
        householdMember: { findUnique: vi.fn(), findMany: vi.fn() },
        personalAccount: { findFirst: vi.fn() },
        savingsAccount: { findFirst: vi.fn() },
        investmentAccount: { findFirst: vi.fn() },
        investment: { findFirst: vi.fn() },
        savingsGoal: { findFirst: vi.fn() },
    },
}));

beforeEach(() => vi.clearAllMocks());

describe('getHouseholdCoMemberIds', () => {
    it('zwraca [] gdy użytkownik bez gospodarstwa', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        expect(await getHouseholdCoMemberIds('u1')).toEqual([]);
    });

    it('zwraca id współczłonków (bez siebie)', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ householdId: 'h1' });
        (prisma.householdMember.findMany as any).mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]);
        expect(await getHouseholdCoMemberIds('u1')).toEqual(['u2', 'u3']);
    });
});

describe('validatePersonalAccountAccess', () => {
    it('true dla braku konta (null)', async () => {
        expect(await validatePersonalAccountAccess(null, 'u1')).toBe(true);
    });

    it('true dla własnego konta', async () => {
        (prisma.personalAccount.findFirst as any).mockResolvedValueOnce({ id: 'a1' }); // own
        expect(await validatePersonalAccountAccess('a1', 'u1')).toBe(true);
    });

    it('false gdy nie własne i brak gospodarstwa', async () => {
        (prisma.personalAccount.findFirst as any).mockResolvedValueOnce(null); // not own
        (prisma.householdMember.findUnique as any).mockResolvedValue(null); // no household
        expect(await validatePersonalAccountAccess('a1', 'u1')).toBe(false);
    });

    it('true dla wspólnego konta współczłonka', async () => {
        (prisma.personalAccount.findFirst as any)
            .mockResolvedValueOnce(null) // not own
            .mockResolvedValueOnce({ id: 'a1' }); // shared by co-member
        (prisma.householdMember.findUnique as any).mockResolvedValue({ householdId: 'h1' });
        (prisma.householdMember.findMany as any).mockResolvedValue([{ userId: 'u2' }]);
        expect(await validatePersonalAccountAccess('a1', 'u1')).toBe(true);
    });

    it('false dla prywatnego konta współczłonka', async () => {
        (prisma.personalAccount.findFirst as any)
            .mockResolvedValueOnce(null) // not own
            .mockResolvedValueOnce(null); // shared lookup (isShared:true) misses → private
        (prisma.householdMember.findUnique as any).mockResolvedValue({ householdId: 'h1' });
        (prisma.householdMember.findMany as any).mockResolvedValue([{ userId: 'u2' }]);
        expect(await validatePersonalAccountAccess('a1', 'u1')).toBe(false);
    });
});

describe('validateTransactionAccess', () => {
    it('konto oszczędnościowe pozostaje owner-only (nie household-aware)', async () => {
        // personal: brak (null → true); savings: nie należy → false
        (prisma.savingsAccount.findFirst as any).mockResolvedValue(null);
        const ok = await validateTransactionAccess('u1', { savingsAccountId: 's-not-mine' });
        expect(ok).toBe(false);
    });

    it('przepuszcza, gdy wszystkie konta dostępne (brak kont = same null)', async () => {
        const ok = await validateTransactionAccess('u1', {});
        expect(ok).toBe(true);
    });
});
