import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import * as planningController from '../planningController';
import { updateAccountBalance } from '../../utils/balanceUpdater';
import { validatePersonalAccountOwnership } from '../../utils/ownershipValidator';
import { createExpenseBusinessLogic, deleteExpenseBusinessLogic } from '../../services/expense/expenseCrudService';

// Mock dependencies
vi.mock('../../lib/prisma', () => ({
    default: {
        monthlyPlan: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        expense: {
            findMany: vi.fn(),
            create: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        planItem: {
            createMany: vi.fn(),
            update: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            delete: vi.fn(),
        },
        mortgage: {
            findMany: vi.fn(),
        },
        $transaction: vi.fn((callback) => callback(prisma)),
    },
}));

vi.mock('../../utils/balanceUpdater', () => ({
    updateAccountBalance: vi.fn(),
}));

vi.mock('../../utils/ownershipValidator', () => ({
    validatePersonalAccountOwnership: vi.fn(),
}));

vi.mock('../../services/expense/expenseCrudService', () => ({
    createExpenseBusinessLogic: vi.fn(),
    deleteExpenseBusinessLogic: vi.fn(),
}));

describe('PlanningController', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let jsonMock: ReturnType<typeof vi.fn>;
    let statusMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        mockRes = {
            status: statusMock as any,
            json: jsonMock as any,
        };
    });

    describe('getMonthlyPlan', () => {
        it('should return 401 if user not authenticated', async () => {
            mockReq = { user: undefined } as any;
            await planningController.getMonthlyPlan(mockReq as any, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(401);
        });

        it('should return 400 if month or year missing', async () => {
            mockReq = { user: { userId: 'u1' }, query: { month: '12' } } as any;
            await planningController.getMonthlyPlan(mockReq as any, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it('should return existing plan', async () => {
            mockReq = { user: { userId: 'u1' }, query: { month: '1', year: '2024' } } as any;
            const mockPlan = { id: 'p1', userId: 'u1', month: 1, year: 2024, items: [] };

            (prisma.monthlyPlan.findUnique as any).mockResolvedValue(mockPlan);
            (prisma.expense.findMany as any).mockResolvedValue([]); // recurrings
            (prisma.expense.findMany as any).mockResolvedValue([]); // expensesInMonth
            (prisma.mortgage.findMany as any).mockResolvedValue([]); // raty kredytów

            await planningController.getMonthlyPlan(mockReq as any, mockRes as Response);

            expect(jsonMock).toHaveBeenCalledWith({ ...mockPlan, loanInstallments: [] });
        });

        it('should include all active loans, with amount null when params incomplete', async () => {
            mockReq = { user: { userId: 'u1' }, query: { month: '1', year: '2024' } } as any;
            const mockPlan = { id: 'p1', userId: 'u1', month: 1, year: 2024, items: [] };

            (prisma.monthlyPlan.findUnique as any).mockResolvedValue(mockPlan);
            (prisma.expense.findMany as any).mockResolvedValue([]);
            (prisma.mortgage.findMany as any).mockResolvedValue([
                { id: 'm1', name: 'Hipoteka', loanType: 'MORTGAGE', currentBalance: 200000, termMonths: 240, installmentType: 'EQUAL', marginRate: 2, referenceRate: 5.75, payments: [] },
                { id: 'm2', name: 'Gotówkowy', loanType: 'CASH', currentBalance: 10000, termMonths: null, installmentType: null, marginRate: null, referenceRate: null, payments: [] },
            ]);

            await planningController.getMonthlyPlan(mockReq as any, mockRes as Response);

            const arg = (jsonMock.mock.calls[0] as any)[0];
            expect(arg.loanInstallments).toHaveLength(2);
            expect(arg.loanInstallments[0]).toMatchObject({ mortgageId: 'm1', amount: expect.any(Number) });
            expect(arg.loanInstallments[1]).toMatchObject({ mortgageId: 'm2', amount: null });
        });
    });

    describe('markItemAsPaid', () => {
        it('should delegate expense creation to the service (with plnAmount) and return the linked item', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' },
                body: { date: '2024-01-15', personalAccountId: 'acc1' }
            } as any;

            const mockItem = {
                id: 'item1',
                amount: 100,
                currency: 'USD',
                name: 'Netflix',
                type: 'expense',
                plan: { userId: 'u1' },
                planId: 'p1'
            };

            (prisma.planItem.findUnique as any)
                .mockResolvedValueOnce(mockItem)
                .mockResolvedValueOnce({ ...mockItem, isDone: true, linkedRealExpenseId: 'exp1' });
            (validatePersonalAccountOwnership as any).mockResolvedValue(true);
            (createExpenseBusinessLogic as any).mockResolvedValue({ id: 'exp1', plnAmount: 400 });

            await planningController.markItemAsPaid(mockReq as any, mockRes as Response);

            // Wydatek liczony przez serwis (plnAmount), z atomowym linkiem pozycji planu.
            expect(createExpenseBusinessLogic).toHaveBeenCalledWith(
                'u1',
                expect.objectContaining({ amount: 100, currency: 'USD', personalAccountId: 'acc1', date: '2024-01-15' }),
                { linkPlanItemId: 'item1' }
            );
            // Kontroler nie robi już bezpośrednich zapisów wydatku/salda ani ręcznego linku.
            expect(prisma.expense.create).not.toHaveBeenCalled();
            expect(updateAccountBalance).not.toHaveBeenCalled();
            expect(prisma.planItem.update).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({
                planItem: expect.objectContaining({ id: 'item1', isDone: true, linkedRealExpenseId: 'exp1' }),
                expense: { id: 'exp1', plnAmount: 400 }
            });
        });

        it('should return 400 without linking when the payment breaks the debit limit', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' },
                body: { personalAccountId: 'acc1' }
            } as any;

            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', amount: 100, currency: 'PLN', name: 'X', plan: { userId: 'u1' }, planId: 'p1' });
            (validatePersonalAccountOwnership as any).mockResolvedValue(true);
            (createExpenseBusinessLogic as any).mockRejectedValue(new Error('Przekroczono limit debetu na koncie'));

            await planningController.markItemAsPaid(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({ message: 'Przekroczono limit debetu na koncie' });
        });

        it('should return 403 when the service rejects account ownership (FORBIDDEN)', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' },
                body: { personalAccountId: 'acc1' }
            } as any;

            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', amount: 100, currency: 'PLN', name: 'X', plan: { userId: 'u1' }, planId: 'p1' });
            (validatePersonalAccountOwnership as any).mockResolvedValue(true);
            (createExpenseBusinessLogic as any).mockRejectedValue(new Error('FORBIDDEN'));

            await planningController.markItemAsPaid(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
        });

        it('should return 400 when no account is selected', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' },
                body: {}
            } as any;

            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', amount: 100, currency: 'PLN', name: 'X', personalAccountId: null, plan: { userId: 'u1' }, planId: 'p1' });

            await planningController.markItemAsPaid(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(createExpenseBusinessLogic).not.toHaveBeenCalled();
        });

        it('should return 403 if plan does not belong to user', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' },
                body: {}
            } as any;

            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', plan: { userId: 'other' } });

            await planningController.markItemAsPaid(mockReq as any, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(403);
            expect(createExpenseBusinessLogic).not.toHaveBeenCalled();
        });
    });

    describe('unlinkItem', () => {
        it('should delegate balance reversal to the expense service and return the refreshed item', async () => {
            mockReq = {
                user: { userId: 'u1' },
                params: { id: 'item1' }
            } as any;

            (prisma.planItem.findUnique as any)
                .mockResolvedValueOnce({ id: 'item1', linkedRealExpenseId: 'exp1', plan: { userId: 'u1' } })
                .mockResolvedValueOnce({ id: 'item1', isDone: false, linkedRealExpenseId: null });
            (deleteExpenseBusinessLogic as any).mockResolvedValue(true);

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(deleteExpenseBusinessLogic).toHaveBeenCalledWith('u1', 'exp1');
            // Kontroler nie robi żadnych bezpośrednich zapisów sald ani ręcznego odpięcia.
            expect(prisma.planItem.update).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', isDone: false, linkedRealExpenseId: null });
        });

        it('should return 404 when the plan item does not exist', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'missing' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue(null);

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
        });

        it('should return 404 when there is no linked expense', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', linkedRealExpenseId: null, plan: { userId: 'u1' } });

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
        });

        it('should return 403 when the plan belongs to another user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', linkedRealExpenseId: 'exp1', plan: { userId: 'other' } });

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
        });

        it('should still detach the item when the expense is already gone (NOT_FOUND)', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' } } as any;

            (prisma.planItem.findUnique as any)
                .mockResolvedValueOnce({ id: 'item1', linkedRealExpenseId: 'exp1', plan: { userId: 'u1' } })
                .mockResolvedValueOnce({ id: 'item1', isDone: false, linkedRealExpenseId: null });
            (deleteExpenseBusinessLogic as any).mockRejectedValue(new Error('NOT_FOUND'));
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', isDone: false, linkedRealExpenseId: null });

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.update).toHaveBeenCalledWith({
                where: { id: 'item1' },
                data: { isDone: false, linkedRealExpenseId: null }
            });
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', isDone: false, linkedRealExpenseId: null });
        });

        it('should return 400 without touching the plan item when reversal breaks the debit limit', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' } } as any;

            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', linkedRealExpenseId: 'exp1', plan: { userId: 'u1' } });
            (deleteExpenseBusinessLogic as any).mockRejectedValue(new Error('Nie można usunąć wpływu - przekroczono limit debetu na koncie'));

            await planningController.unlinkItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith({ message: 'Nie można usunąć wpływu - przekroczono limit debetu na koncie' });
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });
    });

    describe('togglePlanItem', () => {
        it('should toggle isDone on the item', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { isDone: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', isDone: false, plan: { userId: 'u1' } });
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', isDone: true });

            await planningController.togglePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.update).toHaveBeenCalledWith({
                where: { id: 'item1' },
                data: { isDone: true }
            });
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', isDone: true });
        });

        it('should return 404 when the item does not exist', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'missing' }, body: { isDone: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue(null);

            await planningController.togglePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });

        it('should return 403 when the plan belongs to another user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { isDone: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', plan: { userId: 'other' } });

            await planningController.togglePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });

        it('should return 401 when there is no authenticated user', async () => {
            mockReq = { user: undefined, params: { id: 'item1' }, body: { isDone: true } } as any;

            await planningController.togglePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(401);
            expect(prisma.planItem.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('linkTransactionToItem', () => {
        it('should link the expense and mark the item as done', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { expenseId: 'exp1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', plan: { userId: 'u1' } });
            (prisma.expense.findFirst as any).mockResolvedValue({ id: 'exp1', userId: 'u1' });
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', isDone: true, linkedRealExpenseId: 'exp1' });

            await planningController.linkTransactionToItem(mockReq as any, mockRes as Response);

            expect(prisma.expense.findFirst).toHaveBeenCalledWith({ where: { id: 'exp1', userId: 'u1' } });
            expect(prisma.planItem.update).toHaveBeenCalledWith({
                where: { id: 'item1' },
                data: { isDone: true, linkedRealExpenseId: 'exp1' }
            });
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', isDone: true, linkedRealExpenseId: 'exp1' });
        });

        it('should return 403 when the expense does not belong to the user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { expenseId: 'exp1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', plan: { userId: 'u1' } });
            (prisma.expense.findFirst as any).mockResolvedValue(null);

            await planningController.linkTransactionToItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });

        it('should return 404 when the item does not exist', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'missing' }, body: { expenseId: 'exp1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue(null);

            await planningController.linkTransactionToItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });

        it('should return 403 when the plan belongs to another user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { expenseId: 'exp1' } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', plan: { userId: 'other' } });

            await planningController.linkTransactionToItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.expense.findFirst).not.toHaveBeenCalled();
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });
    });

    describe('updatePlanItem', () => {
        it('should update only the item when updateFuture is not set', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { amount: 200 } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', currency: 'PLN', recurringExpenseId: 'tmpl1', plan: { userId: 'u1' }
            });
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', amount: 200, currency: 'PLN' });

            await planningController.updatePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.update).toHaveBeenCalledWith({
                where: { id: 'item1' },
                data: { amount: 200, currency: 'PLN' }
            });
            // Bez updateFuture szablon zostaje nietknięty.
            expect(prisma.expense.update).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', amount: 200, currency: 'PLN' });
        });

        it('should also update the recurring template when updateFuture is true', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { amount: 250, currency: 'EUR', updateFuture: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', currency: 'PLN', recurringExpenseId: 'tmpl1', plan: { userId: 'u1' }
            });
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', amount: 250, currency: 'EUR' });

            await planningController.updatePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.update).toHaveBeenCalledWith({
                where: { id: 'item1' },
                data: { amount: 250, currency: 'EUR' }
            });
            expect(prisma.expense.update).toHaveBeenCalledWith({
                where: { id: 'tmpl1' },
                data: { amount: 250, currency: 'EUR' }
            });
            // Pozycja i szablon w jednej transakcji (atomowość updateFuture).
            expect(prisma.$transaction).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ id: 'item1', amount: 250, currency: 'EUR' });
        });

        it('should update only the item when updateFuture is true but there is no template', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { amount: 300, updateFuture: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', currency: 'PLN', recurringExpenseId: null, plan: { userId: 'u1' }
            });
            (prisma.planItem.update as any).mockResolvedValue({ id: 'item1', amount: 300, currency: 'PLN' });

            await planningController.updatePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.update).toHaveBeenCalled();
            expect(prisma.expense.update).not.toHaveBeenCalled();
        });

        it('should return 404 when the item does not exist', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'missing' }, body: { amount: 200 } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue(null);

            await planningController.updatePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });

        it('should return 403 when the plan belongs to another user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { amount: 200 } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({ id: 'item1', currency: 'PLN', plan: { userId: 'other' } });

            await planningController.updatePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.planItem.update).not.toHaveBeenCalled();
        });
    });

    describe('deletePlanItem', () => {
        it('should delete an ad-hoc item without a linked expense and report keptExpense:false', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: {} } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: null, linkedRealExpenseId: null, plan: { userId: 'u1' }
            });

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
            expect(prisma.expense.findUnique).not.toHaveBeenCalled();
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ success: true, keptExpense: false });
        });

        it('should keep the linked expense (keptExpense:true) and never revert it', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: {} } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: null, linkedRealExpenseId: 'exp1', plan: { userId: 'u1' }
            });
            (prisma.expense.findUnique as any).mockResolvedValue({ id: 'exp1' });

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.expense.findUnique).toHaveBeenCalledWith({ where: { id: 'exp1' }, select: { id: true } });
            // Świadomie NIE cofamy wydatku (to był wariant A) — zostaje w Transakcjach.
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
            expect(prisma.expense.delete).not.toHaveBeenCalled();
            expect(prisma.planItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
            expect(jsonMock).toHaveBeenCalledWith({ success: true, keptExpense: true });
        });

        it('should report keptExpense:false for a dangling link (expense already gone)', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: {} } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: null, linkedRealExpenseId: 'exp1', plan: { userId: 'u1' }
            });
            (prisma.expense.findUnique as any).mockResolvedValue(null);

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
            expect(jsonMock).toHaveBeenCalledWith({ success: true, keptExpense: false });
        });

        it('should delete the recurring template and the current item when deleteFuture is true, keeping the paid expense', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { deleteFuture: true } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: 'tmpl1', linkedRealExpenseId: 'exp1', plan: { userId: 'u1' }
            });
            (prisma.expense.findUnique as any).mockResolvedValue({ id: 'exp1' });

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.expense.delete).toHaveBeenCalledWith({ where: { id: 'tmpl1' } });
            expect(prisma.planItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
            // Realny wydatek (linkedRealExpenseId) NIE jest ruszany — kasujemy tylko szablon.
            expect(deleteExpenseBusinessLogic).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ success: true, keptExpense: true });
        });

        it('should exclude the recurring id for this month when deleteFuture is false', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: { deleteFuture: false } } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: 'tmpl1', linkedRealExpenseId: null, plan: { userId: 'u1' }
            });

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(prisma.monthlyPlan.update).toHaveBeenCalledWith({
                where: { id: 'p1' },
                data: { excludedRecurringIds: { push: 'tmpl1' } }
            });
            expect(prisma.planItem.delete).toHaveBeenCalledWith({ where: { id: 'item1' } });
            expect(prisma.expense.delete).not.toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith({ success: true, keptExpense: false });
        });

        it('should return 404 when the item does not exist', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'missing' }, body: {} } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue(null);

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(404);
            expect(prisma.planItem.delete).not.toHaveBeenCalled();
        });

        it('should return 403 when the plan belongs to another user', async () => {
            mockReq = { user: { userId: 'u1' }, params: { id: 'item1' }, body: {} } as any;
            (prisma.planItem.findUnique as any).mockResolvedValue({
                id: 'item1', planId: 'p1', recurringExpenseId: null, linkedRealExpenseId: null, plan: { userId: 'other' }
            });

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.planItem.delete).not.toHaveBeenCalled();
        });

        it('should return 401 when there is no authenticated user', async () => {
            mockReq = { user: undefined, params: { id: 'item1' }, body: {} } as any;

            await planningController.deletePlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(401);
            expect(prisma.planItem.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('createAdhocPlanItem', () => {
        it('should create a simple one-off item', async () => {
            mockReq = {
                user: { userId: 'u1' },
                body: {
                    month: '1', year: '2024',
                    name: 'Pizza', amount: 50,
                    isRecurring: false
                }
            } as any;

            (prisma.monthlyPlan.findUnique as any).mockResolvedValue({ id: 'p1' });
            (prisma.planItem.create as any).mockResolvedValue({ id: 'new1', name: 'Pizza' });

            await planningController.createAdhocPlanItem(mockReq as any, mockRes as Response);

            expect(prisma.planItem.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    name: 'Pizza',
                    planId: 'p1'
                })
            }));
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1' }));
        });

        it('should create the monthly plan first when it does not exist yet', async () => {
            mockReq = {
                user: { userId: 'u1' },
                body: { month: '3', year: '2024', name: 'Pizza', amount: 50, isRecurring: false }
            } as any;

            (prisma.monthlyPlan.findUnique as any).mockResolvedValue(null);
            (prisma.monthlyPlan.create as any).mockResolvedValue({ id: 'p2' });
            (prisma.planItem.create as any).mockResolvedValue({ id: 'new2', name: 'Pizza' });

            await planningController.createAdhocPlanItem(mockReq as any, mockRes as Response);

            expect(prisma.monthlyPlan.create).toHaveBeenCalledWith({
                data: { userId: 'u1', month: 3, year: 2024 }
            });
            expect(prisma.planItem.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ planId: 'p2' })
            }));
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'new2' }));
        });

        it('should create a recurring template plus the plan item when isRecurring is true', async () => {
            mockReq = {
                user: { userId: 'u1' },
                body: {
                    month: '2', year: '2024',
                    name: 'Siłownia', amount: 120, currency: 'PLN', type: 'expense',
                    personalAccountId: 'acc1',
                    isRecurring: true
                }
            } as any;

            (validatePersonalAccountOwnership as any).mockResolvedValue(true);
            (prisma.monthlyPlan.findUnique as any).mockResolvedValue({ id: 'p1' });
            (prisma.expense.create as any).mockResolvedValue({ id: 'tmpl1' });
            (prisma.planItem.create as any).mockResolvedValue({ id: 'new1', name: 'Siłownia', recurringExpenseId: 'tmpl1' });

            await planningController.createAdhocPlanItem(mockReq as any, mockRes as Response);

            // Szablon: isRecurring + domyślny interwał MONTHLY + transactionDate = 15. dzień miesiąca planu.
            expect(prisma.expense.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    userId: 'u1',
                    description: 'Siłownia',
                    amount: 120,
                    isRecurring: true,
                    recurrenceInterval: 'MONTHLY',
                    transactionDate: new Date(2024, 1, 15)
                })
            });
            // Pozycja bieżącego miesiąca podpięta pod świeży szablon.
            expect(prisma.planItem.create).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    planId: 'p1',
                    name: 'Siłownia',
                    recurringExpenseId: 'tmpl1',
                    isDone: false
                })
            }));
            // Szablon + pozycja w jednej transakcji (bez osieroconego szablonu-widma).
            expect(prisma.$transaction).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'new1', recurringExpenseId: 'tmpl1' }));
        });

        it('should return 403 when personalAccountId belongs to another user', async () => {
            mockReq = {
                user: { userId: 'u1' },
                body: { month: '2', year: '2024', name: 'X', amount: 10, personalAccountId: 'accX', isRecurring: true }
            } as any;

            (validatePersonalAccountOwnership as any).mockResolvedValue(false);

            await planningController.createAdhocPlanItem(mockReq as any, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(403);
            expect(prisma.expense.create).not.toHaveBeenCalled();
            expect(prisma.planItem.create).not.toHaveBeenCalled();
        });
    });
});
