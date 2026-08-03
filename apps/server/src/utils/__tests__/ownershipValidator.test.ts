import { vi, describe, it, expect, beforeEach } from 'vitest';
import {
    validatePersonalAccountOwnership,
    validateSavingsAccountOwnership,
    validateCategoryOwnership,
    validateStoreOwnership,
    validateTransactionOwnership
} from '../ownershipValidator';
import prisma from '../../lib/prisma';

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
    default: {
        personalAccount: { findFirst: vi.fn() },
        savingsAccount: { findFirst: vi.fn() },
        investmentAccount: { findFirst: vi.fn() },
        investment: { findFirst: vi.fn() },
        savingsGoal: { findFirst: vi.fn() },
        category: { findFirst: vi.fn() },
        store: { findFirst: vi.fn() },
    },
}));

describe('ownershipValidator', () => {
    const userId = 'user-123';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('validatePersonalAccountOwnership', () => {
        it('should return true if no accountId is provided', async () => {
            const result = await validatePersonalAccountOwnership(null, userId);
            expect(result).toBe(true);
            expect(prisma.personalAccount.findFirst).not.toHaveBeenCalled();
        });

        it('should return true if account belongs to user', async () => {
            (prisma.personalAccount.findFirst as any).mockResolvedValue({ id: 'acc-1', userId });
            const result = await validatePersonalAccountOwnership('acc-1', userId);
            expect(result).toBe(true);
            expect(prisma.personalAccount.findFirst).toHaveBeenCalledWith({
                where: { id: 'acc-1', userId }
            });
        });

        it('should return false if account does not belong to user', async () => {
            (prisma.personalAccount.findFirst as any).mockResolvedValue(null);
            const result = await validatePersonalAccountOwnership('acc-other', userId);
            expect(result).toBe(false);
        });
    });

    describe('validateCategoryOwnership', () => {
        // UWAGA NA PUŁAPKĘ: mock zwraca to, co mu każemy, NIEZALEŻNIE od `where`. Test typu
        // „zamockuj kategorię systemową i sprawdź, czy wyszło true" nie mówi więc nic
        // o bezpieczeństwie — przechodzi zarówno dla wersji dziurawej, jak i naprawionej.
        // Właśnie taki test istniał tu wcześniej i przepuścił błąd, w którym dowolne konto
        // mogło edytować kategorię systemową. Dlatego sprawdzamy SAMO ZAPYTANIE.
        it('pyta wyłącznie o kategorię tego użytkownika — bez furtki na systemowe', async () => {
            (prisma.category.findFirst as any).mockResolvedValue({ id: 2, userId });

            await validateCategoryOwnership(2, userId);

            expect(prisma.category.findFirst).toHaveBeenCalledWith({
                where: { id: 2, userId }
            });
            const arg = (prisma.category.findFirst as any).mock.calls[0][0];
            expect(JSON.stringify(arg)).not.toContain('null');
        });

        it('zwraca true dla własnej kategorii', async () => {
            (prisma.category.findFirst as any).mockResolvedValue({ id: 2, userId });
            expect(await validateCategoryOwnership(2, userId)).toBe(true);
        });

        it('zwraca false, gdy kategoria nie należy do użytkownika (albo nie istnieje)', async () => {
            (prisma.category.findFirst as any).mockResolvedValue(null);
            expect(await validateCategoryOwnership(999, userId)).toBe(false);
        });
    });

    describe('validateStoreOwnership', () => {
        it('pyta wyłącznie o sklep tego użytkownika — bez furtki na systemowe', async () => {
            (prisma.store.findFirst as any).mockResolvedValue({ id: 's1', userId });

            await validateStoreOwnership('s1', userId);

            expect(prisma.store.findFirst).toHaveBeenCalledWith({
                where: { id: 's1', userId }
            });
            const arg = (prisma.store.findFirst as any).mock.calls[0][0];
            expect(JSON.stringify(arg)).not.toContain('null');
        });

        it('zwraca true dla własnego sklepu', async () => {
            (prisma.store.findFirst as any).mockResolvedValue({ id: 's1', userId });
            expect(await validateStoreOwnership('s1', userId)).toBe(true);
        });

        it('zwraca false, gdy sklep nie należy do użytkownika', async () => {
            (prisma.store.findFirst as any).mockResolvedValue(null);
            expect(await validateStoreOwnership('s1', userId)).toBe(false);
        });
    });

    describe('validateTransactionOwnership', () => {
        it('should return true if all provided IDs belong to user', async () => {
            (prisma.personalAccount.findFirst as any).mockResolvedValue({ id: 'p1', userId });
            (prisma.savingsAccount.findFirst as any).mockResolvedValue({ id: 's1', userId });

            const result = await validateTransactionOwnership(userId, {
                personalAccountId: 'p1',
                savingsAccountId: 's1'
            });

            expect(result).toBe(true);
        });

        it('should return false if any ID does not belong to user', async () => {
            (prisma.personalAccount.findFirst as any).mockResolvedValue({ id: 'p1', userId });
            (prisma.savingsAccount.findFirst as any).mockResolvedValue(null);

            const result = await validateTransactionOwnership(userId, {
                personalAccountId: 'p1',
                savingsAccountId: 'malicious-acc'
            });

            expect(result).toBe(false);
        });
    });
});
