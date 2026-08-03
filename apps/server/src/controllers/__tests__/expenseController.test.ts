import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createExpense, updateExpense, deleteExpense } from '../expenseController';
import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

// Mock ownershipValidator
vi.mock('../../utils/ownershipValidator', () => ({
    validateTransactionOwnership: vi.fn().mockResolvedValue(true),
    validatePersonalAccountOwnership: vi.fn().mockResolvedValue(true)
}));

// Księgowanie waliduje dostęp przez householdScope (wspólne konta) — mock zwraca dostęp OK
vi.mock('../../utils/householdScope', () => ({
    validateTransactionAccess: vi.fn().mockResolvedValue(true)
}));

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
    default: {
        $transaction: vi.fn(),
        expense: {
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn()
        },
        personalAccount: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        accountBalance: {
            upsert: vi.fn(),
            update: vi.fn(),
            create: vi.fn()
        },
        savingsAccount: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        category: {
            findUnique: vi.fn()
        },
        planItem: {
            updateMany: vi.fn()
        },
        investmentAccount: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        investment: {
            findUnique: vi.fn(),
            update: vi.fn()
        },
        savingsGoal: {
            findUnique: vi.fn(),
            update: vi.fn()
        }
    },
}));

describe('expenseController - Negative Balance Logic & Multi-currency', () => {
    let mockRes: Partial<Response>;
    const userId = 'user-123';

    beforeEach(() => {
        vi.clearAllMocks();
        mockRes = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        };

        // Default transaction mock: just execute the callback
        (prisma.$transaction as any).mockImplementation(async (callback: any) => {
            return await callback(prisma);
        });
    });

    describe('createExpense', () => {
        it('should allow expense that keeps balance above the overdraft limit', async () => {
            const req = {
                user: { userId },
                body: {
                    type: 'expense',
                    amount: 100,
                    personalAccountId: 'acc-1',
                    categoryId: 1,
                    date: new Date().toISOString(),
                    currency: 'PLN'
                }
            } as any;

            (prisma.personalAccount.findUnique as any).mockResolvedValue({
                id: 'acc-1',
                balance: new Prisma.Decimal(0),
                balances: [{ currency: 'PLN', balance: new Prisma.Decimal(0) }]
            });
            (prisma.category.findUnique as any).mockResolvedValue({ id: 1, name: 'Food' });
            (prisma.expense.create as any).mockResolvedValue({ id: 'exp-1', ...req.body });

            await createExpense(req, mockRes as Response);

            expect(prisma.expense.create).toHaveBeenCalled();
            expect(mockRes.status).not.toHaveBeenCalledWith(400);
        });

        it('should block expense that would exceed the -5000 PLN overdraft limit', async () => {
            const req = {
                user: { userId },
                body: {
                    type: 'expense',
                    amount: 6000,
                    personalAccountId: 'acc-1',
                    categoryId: 1,
                    date: new Date().toISOString(),
                    currency: 'PLN'
                }
            } as any;

            (prisma.personalAccount.findUnique as any).mockResolvedValue({
                id: 'acc-1',
                balance: new Prisma.Decimal(0),
                balances: [{ currency: 'PLN', balance: new Prisma.Decimal(0) }]
            });

            await createExpense(req, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('limit debetu')
            }));
            expect(prisma.expense.create).not.toHaveBeenCalled();
        });
    });

    describe('deleteExpense (Revert Logic)', () => {
        it('should block deleting an income if it would cross the -5000 PLN overdraft limit', async () => {
            const req = {
                user: { userId },
                params: { id: 'exp-1' }
            } as any;

            (prisma.expense.findFirst as any).mockResolvedValue({
                id: 'exp-1',
                type: 'income',
                amount: new Prisma.Decimal(10000),
                currency: 'PLN',
                personalAccountId: 'acc-1',
                userId
            });

            (prisma.personalAccount.findUnique as any).mockResolvedValue({
                id: 'acc-1',
                balance: new Prisma.Decimal(200),
                balances: [{ currency: 'PLN', balance: new Prisma.Decimal(200) }]
            });

            await deleteExpense(req, mockRes as Response);

            expect(mockRes.status).toHaveBeenCalledWith(400);
            expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('Nie można usunąć wpływu')
            }));
            expect(prisma.expense.delete).not.toHaveBeenCalled();
        });
    });
});
