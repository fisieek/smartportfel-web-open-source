import { RecurrenceInterval } from '@prisma/client';
import prisma from '../lib/prisma';
import { computeMonthlyInstallment } from '../utils/loanInstallment';
import { validatePersonalAccountOwnership } from '../utils/ownershipValidator';

// Logika biznesowa planowania miesięcznego — wyniesiona z planningController (etap 6).
// Konwencja błędów jak w expenseCrudService: throw new Error('NOT_FOUND'|'FORBIDDEN'),
// mapowanie na kody HTTP i polskie komunikaty zostaje w kontrolerze.

// Wspólny kształt pozycji planu we wszystkich ścieżkach zwrotki (kontrakt API bez zmian).
const planItemsInclude = {
    items: {
        include: {
            recurringExpense: {
                include: {
                    category: true
                }
            },
            category: true,
            store: true,
            personalAccount: {
                include: {
                    balances: true
                }
            }
        }
    }
} as const;

// Czysta logika planu miesięcznego — reużywana przez kontroler i serwer MCP.
// Tworzy/synchronizuje MonthlyPlan dla (userId, m, y) i dokłada raty kredytów (read-only).
export const getMonthlyPlanLogic = async (userId: string, m: number, y: number) => {
    // 1. Get or create MonthlyPlan
    let plan = await prisma.monthlyPlan.findUnique({
        where: {
            userId_month_year: { userId, month: m, year: y }
        },
        include: planItemsInclude
    });

    // 2. Sync with current recurring expenses
    const allRecurringTemplates = await prisma.expense.findMany({
        where: {
            userId,
            isRecurring: true,
            id: {
                notIn: plan?.excludedRecurringIds || []
            },
            transactionDate: {
                lte: new Date(y, m, 0, 23, 59, 59) // Musi się zacząć przed końcem tego miesiąca
            },
            OR: [
                { recurrenceEndDate: null },
                { recurrenceEndDate: { gte: new Date(y, m - 1, 1) } }
            ]
        },
        select: {
            id: true,
            store: true,
            description: true,
            amount: true,
            currency: true,
            type: true,
            categoryId: true,
            recurrenceInterval: true,
            transactionDate: true
        }
    });

    // Filtrowanie wzorca powtarzalności (np. roczne tylko w konkretnym miesiącu)
    const recurringExpenses = allRecurringTemplates.filter(re => {
        if (re.recurrenceInterval === 'ANNUALLY') {
            const startDate = new Date(re.transactionDate);
            return startDate.getMonth() === m - 1;
        }
        return true; // MONTHLY (domyślne) pojawia się co miesiąc
    });

    if (!plan) {
        plan = await prisma.monthlyPlan.create({
            data: {
                userId,
                month: m,
                year: y,
                items: {
                    create: recurringExpenses.map(re => ({
                        name: re.store || re.description,
                        amount: re.amount,
                        currency: re.currency,
                        type: re.type,
                        categoryId: re.categoryId,
                        recurringExpenseId: re.id,
                        isDone: false
                    }))
                }
            },
            include: planItemsInclude
        });
    } else {
        // Check if there are new recurring expenses that are not in the plan yet
        const existingRecurringIds = plan.items.map(i => i.recurringExpenseId).filter(Boolean);
        const newRecurring = recurringExpenses.filter(re => !existingRecurringIds.includes(re.id));

        if (newRecurring.length > 0) {
            await prisma.planItem.createMany({
                data: newRecurring.map(re => ({
                    planId: plan!.id,
                    name: re.store || re.description,
                    amount: re.amount,
                    currency: re.currency,
                    type: re.type,
                    categoryId: re.categoryId,
                    recurringExpenseId: re.id,
                    isDone: false
                }))
            });

            // Refetch plan with new items
            plan = await prisma.monthlyPlan.findUnique({
                where: { id: plan!.id },
                include: planItemsInclude
            });
        }
    }

    // 4. (REMOVED) Link existing real expenses to plan items if not linked yet
    // The logic here was performing automatic linking based strictly on expense names matching templates.
    // This bypassed the manual user 'Link to plan / Skip' modal and caused unexpected isDone: true mutations.
    // It's removed to ensure explicit Plan updates via explicit API POST operations.

    // 5. Raty aktywnych kredytów jako informacyjne (read-only) pozycje planu.
    // Nie są zapisywane jako PlanItem — faktyczną spłatę rejestruje moduł Kredyty.
    const mortgages = await prisma.mortgage.findMany({
        where: { userId, currentBalance: { gt: 0 } },
        include: { payments: { select: { id: true } } }
    });
    // Wszystkie aktywne kredyty; `amount` = null gdy brak kompletu parametrów
    // (typ raty/okres/oprocentowanie) — front pokazuje wtedy notkę „uzupełnij parametry".
    const loanInstallments = mortgages.map(mortgage => ({
        mortgageId: mortgage.id,
        name: mortgage.name,
        loanType: mortgage.loanType,
        amount: computeMonthlyInstallment(mortgage),
        currency: 'PLN',
    }));

    return { ...plan!, loanInstallments };
};

export const updatePlanItemLogic = async (
    userId: string,
    itemId: string,
    { amount, currency, updateFuture }: { amount: number | string; currency?: string; updateFuture?: boolean }
) => {
    const item = await prisma.planItem.findUnique({
        where: { id: itemId },
        include: {
            recurringExpense: true,
            plan: true // 🔐 Include plan to verify ownership
        }
    });

    if (!item) {
        throw new Error('NOT_FOUND');
    }

    // 🔐 SECURITY: Verify the plan belongs to the authenticated user
    if (item.plan.userId !== userId) {
        throw new Error('FORBIDDEN');
    }

    // Pozycja + (przy updateFuture) szablon atomowo — błąd w środku nie może
    // zostawić pozycji rozjechanej z szablonem.
    return prisma.$transaction(async (tx) => {
        const updated = await tx.planItem.update({
            where: { id: itemId },
            data: {
                amount,
                currency: currency || item.currency
            }
        });

        if (updateFuture && item.recurringExpenseId) {
            await tx.expense.update({
                where: { id: item.recurringExpenseId },
                data: {
                    amount,
                    currency: currency || item.currency
                }
            });
        }

        return updated;
    });
};

export const deletePlanItemLogic = async (userId: string, itemId: string, deleteFuture?: boolean) => {
    const item = await prisma.planItem.findUnique({
        where: { id: itemId },
        include: { plan: true }
    });

    if (!item) {
        throw new Error('NOT_FOUND');
    }

    // 🔐 SECURITY: Verify the plan belongs to the authenticated user
    if (item.plan.userId !== userId) {
        throw new Error('FORBIDDEN');
    }

    // I7: świadoma decyzja kontraktowa — usunięcie OPŁACONEJ pozycji NIE cofa
    // zaksięgowanego wydatku (pieniądze naprawdę wyszły z konta, wydatek zostaje
    // w Transakcjach). W przeciwieństwie do unlinkItem NIE wołamy tu
    // deleteExpenseBusinessLogic — kasujemy tylko śledzenie w planie, saldo bez zmian.
    // Sygnalizujemy to jawnie klientowi (keptExpense), żeby zniknął cichy „duch" wydatku.
    // linkedRealExpenseId to pole na PlanItem (nie FK na Expense), więc delete pozycji
    // już zostawia Expense nietknięty — naprawiamy to, że działo się to milcząco.
    let keptExpense = false;
    if (item.linkedRealExpenseId) {
        const linkedExpense = await prisma.expense.findUnique({
            where: { id: item.linkedRealExpenseId },
            select: { id: true }
        });
        // Uczciwy komunikat: wiszący link do już usuniętego wydatku → false.
        keptExpense = !!linkedExpense;
    }

    if (deleteFuture && item.recurringExpenseId) {
        const recurringExpenseId = item.recurringExpenseId;
        await prisma.$transaction(async (tx) => {
            // Delete template
            await tx.expense.delete({ where: { id: recurringExpenseId } });
            // Delete current item (and others linked to it will be orphaned and cleaned up)
            await tx.planItem.delete({ where: { id: itemId } });
        });
    } else if (item.recurringExpenseId) {
        const recurringExpenseId = item.recurringExpenseId;
        await prisma.$transaction(async (tx) => {
            // Add to excluded list for THIS month
            await tx.monthlyPlan.update({
                where: { id: item.planId },
                data: {
                    excludedRecurringIds: {
                        push: recurringExpenseId
                    }
                }
            });
            // Delete current item
            await tx.planItem.delete({ where: { id: itemId } });
        });
    } else {
        // Just delete ad-hoc item
        await prisma.planItem.delete({ where: { id: itemId } });
    }

    return { success: true, keptExpense };
};

export const createAdhocPlanItemLogic = async (
    userId: string,
    input: {
        month: string | number;
        year: string | number;
        name: string;
        amount: number | string;
        currency?: string;
        type?: string;
        categoryId?: string | number | null;
        storeId?: string | null;
        personalAccountId?: string | null;
        isRecurring?: boolean;
        recurrenceInterval?: RecurrenceInterval | null;
        recurrenceEndDate?: string | null;
        note?: string | null;
        plannedDate?: string | null;
    }
) => {
    const {
        month, year, name, amount, currency, type, categoryId, storeId,
        personalAccountId, isRecurring, recurrenceInterval, recurrenceEndDate, note, plannedDate
    } = input;

    // 🔐 SECURITY: Validate personalAccountId belongs to user (IDOR protection)
    if (personalAccountId) {
        const isOwner = await validatePersonalAccountOwnership(personalAccountId, userId);
        if (!isOwner) {
            throw new Error('FORBIDDEN');
        }
    }

    const m = parseInt(String(month));
    const y = parseInt(String(year));

    let plan = await prisma.monthlyPlan.findUnique({
        where: { userId_month_year: { userId, month: m, year: y } }
    });

    if (!plan) {
        plan = await prisma.monthlyPlan.create({
            data: { userId, month: m, year: y }
        });
    }

    if (isRecurring) {
        // Szablon + pozycja atomowo — wyjątek między zapisami osierocał szablon,
        // który następny sync planu materializował jako pozycję-widmo.
        return prisma.$transaction(async (tx) => {
            // Create a recurring expense template instead of just a one-off plan item
            const newTemplate = await tx.expense.create({
                data: {
                    userId,
                    description: name,
                    amount,
                    currency: currency || 'PLN',
                    type,
                    categoryId: categoryId ? parseInt(String(categoryId)) : null,
                    storeId: storeId || null,
                    personalAccountId: personalAccountId || null,
                    isRecurring: true,
                    recurrenceInterval: recurrenceInterval || 'MONTHLY',
                    recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null,
                    note: note || null,
                    transactionDate: plannedDate ? new Date(plannedDate) : new Date(y, m - 1, 15)
                }
            });

            // Create the plan item for current month (or let the next sync handle it)
            return tx.planItem.create({
                data: {
                    planId: plan!.id,
                    name,
                    amount,
                    currency: currency || 'PLN',
                    type,
                    categoryId: categoryId ? parseInt(String(categoryId)) : null,
                    storeId: storeId || null,
                    personalAccountId: personalAccountId || null,
                    note: note || null,
                    plannedDate: plannedDate ? new Date(plannedDate) : null,
                    recurringExpenseId: newTemplate.id,
                    isDone: false
                },
                include: { category: true, store: true }
            });
        });
    }

    // Standard one-off PlanItem
    return prisma.planItem.create({
        data: {
            planId: plan.id,
            name,
            amount,
            currency: currency || 'PLN',
            type,
            categoryId: categoryId ? parseInt(String(categoryId)) : null,
            storeId: storeId || null,
            personalAccountId: personalAccountId || null,
            note: note || null,
            plannedDate: plannedDate ? new Date(plannedDate) : null,
            isDone: false
        },
        include: { category: true, store: true }
    });
};
