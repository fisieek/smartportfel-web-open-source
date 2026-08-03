import { vi, describe, it, expect, beforeEach } from 'vitest';
import { updateExpenseStoreLogic } from '../expenseMutationService';
import prisma from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
    default: {
        expense: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
        store: { findUnique: vi.fn() },
        category: { findMany: vi.fn() },
    },
}));

// Importowane przez moduł, ale nieużywane w ścieżce sklepu — izolujemy.
vi.mock('../../../utils/financialTransaction', () => ({
    runFinancialTransaction: async (fn: any) => fn({}),
}));
vi.mock('../balanceService', () => ({
    checkBalanceWithTx: vi.fn().mockResolvedValue({ valid: true }),
}));

describe('updateExpenseStoreLogic — edycja sklepu z listy', () => {
    beforeEach(() => vi.clearAllMocks());

    it('na wydatku ustawia storeId/store/categoryId/description (kategoria idzie za sklepem, nazwa nadpisana)', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp-1', userId: 'u1', type: 'expense' });
        (prisma.store.findUnique as any).mockResolvedValue({ id: 'store-9', name: 'Biedronka', categoryId: 5, userId: 'u1' });
        (prisma.expense.update as any).mockImplementation(async ({ data }: any) => ({ id: 'exp-1', ...data }));

        await updateExpenseStoreLogic('u1', 'exp-1', 'store-9');

        expect((prisma.expense.update as any)).toHaveBeenCalledTimes(1);
        const arg = (prisma.expense.update as any).mock.calls[0][0];
        expect(arg.where).toEqual({ id: 'exp-1' });
        expect(arg.data).toMatchObject({
            storeId: 'store-9',
            store: 'Biedronka',
            categoryId: 5,
            description: 'Biedronka',
        });
        // Brak pól bilansowych (kwota/konto/typ) — operacja neutralna dla salda
        expect(arg.data).not.toHaveProperty('amount');
        expect(arg.data).not.toHaveProperty('personalAccountId');
        expect(arg.data).not.toHaveProperty('type');
    });

    it('akceptuje sklep systemowy (userId === null)', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp-1', userId: 'u1', type: 'expense' });
        (prisma.store.findUnique as any).mockResolvedValue({ id: 's', name: 'X', categoryId: 1, userId: null });
        (prisma.expense.update as any).mockImplementation(async ({ data }: any) => data);

        await expect(updateExpenseStoreLogic('u1', 'exp-1', 's')).resolves.toBeTruthy();
    });

    it('rzuca NOT_FOUND, gdy transakcja nie istnieje / nie należy do usera', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue(null);
        await expect(updateExpenseStoreLogic('u1', 'x', 's')).rejects.toThrow('NOT_FOUND');
        expect((prisma.expense.update as any)).not.toHaveBeenCalled();
    });

    it('rzuca FORBIDDEN dla wpływu/przelewu (nie-wydatku)', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp-1', userId: 'u1', type: 'income' });
        await expect(updateExpenseStoreLogic('u1', 'exp-1', 's')).rejects.toThrow('FORBIDDEN');
        expect((prisma.store.findUnique as any)).not.toHaveBeenCalled();
        expect((prisma.expense.update as any)).not.toHaveBeenCalled();
    });

    it('rzuca NOT_FOUND, gdy sklep nie istnieje', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp-1', userId: 'u1', type: 'expense' });
        (prisma.store.findUnique as any).mockResolvedValue(null);
        await expect(updateExpenseStoreLogic('u1', 'exp-1', 's')).rejects.toThrow('NOT_FOUND');
        expect((prisma.expense.update as any)).not.toHaveBeenCalled();
    });

    it('rzuca FORBIDDEN, gdy sklep należy do innego użytkownika', async () => {
        (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp-1', userId: 'u1', type: 'expense' });
        (prisma.store.findUnique as any).mockResolvedValue({ id: 's', name: 'X', categoryId: 1, userId: 'other-user' });
        await expect(updateExpenseStoreLogic('u1', 'exp-1', 's')).rejects.toThrow('FORBIDDEN');
        expect((prisma.expense.update as any)).not.toHaveBeenCalled();
    });
});
