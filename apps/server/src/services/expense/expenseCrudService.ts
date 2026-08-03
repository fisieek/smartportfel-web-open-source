import prisma from '../../lib/prisma';
import { runFinancialTransaction } from '../../utils/financialTransaction';
import { Prisma } from '@prisma/client';
import { validateTransactionAccess } from '../../utils/householdScope';
import { CurrencyService } from '../../services/currencyService';
import { checkBalanceWithTx, getEffectiveCurrency } from './balanceService';
import { updateAccountBalance } from '../../utils/balanceUpdater';
import { logger } from '../../utils/logger';
import { expenseCreateSchema, expenseUpdateSchema, mapCreateExpenseError, mapUpdateExpenseError, ValidationError } from './expenseSchemas';

// Helper dla opisu domyślnego
const getDefaultDescription = (type: string) => {
    switch (type) {
        case 'income': return 'Wpływ';
        case 'internal_transfer': return 'Przelew wewnętrzny';
        case 'savings_transfer': return 'Przelew na oszczędności';
        case 'investment_transfer': return 'Przelew na inwestycje';
        case 'exchange': return 'Przewalutowanie';
        default: return 'Wydatek';
    }
};

export const createExpenseBusinessLogic = async (userId: string, data: unknown, opts?: { linkPlanItemId?: string }) => {
    // Kontrakt kształtu/typów wejścia (coerce amount/date, enum type/recurrenceInterval,
    // strip nieznanych pól). Walidacja warunkowa per-typ zostaje niżej.
    const parsed = expenseCreateSchema.safeParse(data);
    if (!parsed.success) {
        throw mapCreateExpenseError(parsed.error, data);
    }

    const {
        type,
        amount,
        description,
        categoryId,
        date,
        store,
        storeId,
        note,
        personalAccountId,
        toPersonalAccountId,
        fromSavingsAccountId,
        savingsAccountId,
        investmentId,
        investmentAccountId,
        savingsGoalId,
        isRecurring,
        recurrenceInterval,
        recurrenceEndDate,
        currency,
        targetAmount,
        targetCurrency
    } = parsed.data;

    // Walidacja w zależności od typu
    let finalCategoryId = categoryId ? Number(categoryId) : null;
    let finalStoreId = storeId || null;

    if (type === 'expense' && !finalCategoryId) {
        const inneCategory = await prisma.category.findFirst({ where: { name: 'Inne', userId: null } });
        if (inneCategory) finalCategoryId = inneCategory.id;
    }

    // Auto-assign 'Przelew wewnętrzny' category for internal transfers
    if (type === 'internal_transfer' && !finalCategoryId) {
        const transferCategory = await prisma.category.findFirst({ where: { name: 'Przelew wewnętrzny', userId: null } });
        if (transferCategory) finalCategoryId = transferCategory.id;
    }

    if (type === 'savings_transfer' && (!personalAccountId || !savingsAccountId)) {
        throw new Error('Konto źródłowe i docelowe są wymagane');
    }

    if (type === 'investment_transfer' && (!personalAccountId || !investmentId)) {
        throw new Error('Konto źródłowe i inwestycja są wymagane');
    }

    if (type === 'internal_transfer' && !personalAccountId && !fromSavingsAccountId && !investmentAccountId) {
        throw new Error('Konto źródłowe jest wymagane');
    }

    if (type === 'internal_transfer' && !toPersonalAccountId && !savingsAccountId && !investmentAccountId) {
        throw new Error('Konto docelowe jest wymagane');
    }

    if (type === 'income' && !personalAccountId && !savingsAccountId && !investmentAccountId) {
        throw new Error('Konto docelowe jest wymagane dla wpływu');
    }

    if (type === 'exchange' && (!personalAccountId || !targetAmount || !targetCurrency)) {
        throw new Error('Konto i dane docelowe wymiany są wymagane');
    }

    // Auto-assign system category and store for exchange transactions
    if (type === 'exchange') {
        try {
            let exchangeCategory = await prisma.category.findFirst({
                where: { name: 'Przewalutowanie', userId: null }
            });

            if (!exchangeCategory) {
                exchangeCategory = await prisma.category.create({
                    data: {
                        name: 'Przewalutowanie',
                        description: 'Kategoria systemowa dla transakcji wymiany walut',
                        isSystemCategory: true,
                        color: '#9333EA',
                        icon: '💱',
                        userId: null
                    }
                });
            }

            if (exchangeCategory) {
                finalCategoryId = exchangeCategory.id;

                let exchangeStore = await prisma.store.findFirst({
                    where: {
                        name: 'Przewalutowanie',
                        categoryId: exchangeCategory.id,
                        userId: null
                    }
                });

                if (!exchangeStore) {
                    exchangeStore = await prisma.store.create({
                        data: {
                            name: 'Przewalutowanie',
                            categoryId: exchangeCategory.id,
                            isSystemCategory: true,
                            userId: null
                        }
                    });
                }

                if (exchangeStore) {
                    finalStoreId = exchangeStore.id;
                }
            }
        } catch (err) {
            logger.warn('[createExpense] Failed to auto-assign exchange category/store:', err);
        }
    }

    let isInvestmentSource = false;
    if (type === 'internal_transfer' && investmentAccountId && (toPersonalAccountId || savingsAccountId)) {
        isInvestmentSource = true;
    }

    const isOwnershipValid = await validateTransactionAccess(userId, {
        personalAccountId,
        toPersonalAccountId,
        fromSavingsAccountId,
        savingsAccountId,
        investmentAccountId,
        investmentId,
        savingsGoalId,
    });

    if (!isOwnershipValid) {
        throw new Error('FORBIDDEN');
    }

    // amount jest już liczbą po coerce — String() chroni precyzję przy budowie Decimala.
    const amountDecimal = new Prisma.Decimal(String(amount));

    return await runFinancialTransaction(async (tx) => {
        const isOwnershipValidInTx = await validateTransactionAccess(userId, {
            personalAccountId,
            toPersonalAccountId,
            fromSavingsAccountId,
            savingsAccountId,
            investmentAccountId,
            investmentId,
            savingsGoalId,
        });

        if (!isOwnershipValidInTx) {
            throw new Error('FORBIDDEN');
        }

        const exchangeRate = await CurrencyService.getExchangeRate(currency, new Date(date));
        const exchangeRateDecimal = new Prisma.Decimal(exchangeRate);
        const plnAmount = amountDecimal.mul(exchangeRateDecimal).toDecimalPlaces(2);

        if (type !== 'income') {
            const balanceCheck = await checkBalanceWithTx(tx, amountDecimal, currency, personalAccountId ?? undefined, fromSavingsAccountId ?? undefined, isInvestmentSource ? (investmentAccountId ?? undefined) : undefined);
            if (!balanceCheck.valid) {
                throw new Error(balanceCheck.message);
            }
        }

        const expense = await (tx.expense.create as any)({
            data: {
                type,
                amount: amountDecimal,
                currency,
                originalAmount: currency !== 'PLN' ? amountDecimal : null,
                exchangeRate: currency !== 'PLN' ? exchangeRateDecimal : null,
                plnAmount: currency !== 'PLN' ? plnAmount : amountDecimal,
                description: description || getDefaultDescription(type),
                categoryId: finalCategoryId,
                transactionDate: new Date(date),
                userId,
                store,
                storeId: finalStoreId,
                note,
                personalAccountId,
                toPersonalAccountId,
                fromSavingsAccountId,
                savingsAccountId,
                investmentId,
                investmentAccountId,
                savingsGoalId,
                targetCurrency,
                targetAmount: targetAmount ? new Prisma.Decimal(String(targetAmount)) : null,
                // Kolumna Boolean @default(false), non-nullable — null/undefined → default.
                isRecurring: isRecurring ?? undefined,
                recurrenceInterval,
                recurrenceEndDate: recurrenceEndDate ? new Date(recurrenceEndDate) : null
            },
            include: { category: true, personalAccount: true, fromSavingsAccount: true, savingsAccount: true, investmentAccount: true }
        });

        await updateAccountBalance(tx, {
            personalAccountId,
            savingsAccountId: type === 'income' ? savingsAccountId : null,
            investmentAccountId: type === 'income' ? investmentAccountId : null,
            amount: amountDecimal,
            currency,
            type,
            date: new Date(date)
        });

        // Strona docelowa przewalutowania: uznanie konta w walucie docelowej
        if (type === 'exchange' && personalAccountId && targetAmount && targetCurrency) {
            await updateAccountBalance(tx, {
                personalAccountId,
                amount: new Prisma.Decimal(String(targetAmount)),
                currency: targetCurrency,
                type: 'income',
                date: new Date(date)
            });
        }

        if (fromSavingsAccountId) {
            await tx.savingsAccount.update({ where: { id: fromSavingsAccountId }, data: { balance: { decrement: amountDecimal } } });
        }

        if (type === 'internal_transfer' && toPersonalAccountId) {
            await updateAccountBalance(tx, {
                personalAccountId: toPersonalAccountId,
                amount: amountDecimal,
                currency,
                type: 'income',
                date: new Date(date)
            });
        }

        if (type === 'internal_transfer' && investmentAccountId) {
            if (isInvestmentSource) {
                await tx.investmentAccount.update({ where: { id: investmentAccountId }, data: { balance: { decrement: amountDecimal } } });
            } else {
                await tx.investmentAccount.update({ where: { id: investmentAccountId }, data: { balance: { increment: amountDecimal } } });
            }
        }

        if (savingsAccountId && type !== 'income') {
            await tx.savingsAccount.update({ where: { id: savingsAccountId }, data: { balance: { increment: amountDecimal } } });
        }

        if (type === 'investment_transfer' && investmentId) {
            await tx.investment.update({ where: { id: investmentId }, data: { currentValue: { increment: amountDecimal } } });
        }

        if (savingsGoalId) {
            const targetGoal = await tx.savingsGoal.findUnique({ where: { id: savingsGoalId } });
            if (targetGoal && !targetGoal.isMain) {
                await tx.savingsGoal.update({ where: { id: savingsGoalId }, data: { allocatedAmount: { increment: amountDecimal } } });
            }
        }

        // Opłacenie pozycji planu (mark-paid): powiąż pozycję z utworzonym wydatkiem
        // W TEJ SAMEJ transakcji — inaczej awaria między create a link zostawiłaby
        // zaksięgowany wydatek z pozycją planu wciąż „do zapłaty" (duplikat przy retry).
        // Symetryczne do odpięcia w deleteExpenseBusinessLogic (updateMany niżej).
        if (opts?.linkPlanItemId) {
            await tx.planItem.update({
                where: { id: opts.linkPlanItemId },
                data: { isDone: true, linkedRealExpenseId: expense.id }
            });
        }

        return expense;
    });
};


/**
 * FAZA 1 update'u — cofa skutki balansowe STAREGO wydatku (przed nadpisaniem rekordu).
 *
 * ŚWIADOMIE NIE współdzielone z `deleteExpenseBusinessLogic`, mimo podobieństwa:
 * ta ścieżka liczy `accCurrency` jako `acc.currency || (LOYALTY_CARD?'PKT':'PLN')`
 * i robi `accountBalance.upsert` BEZWARUNKOWO, podczas gdy delete używa
 * `getEffectiveCurrency` i pomija upsert dla LOYALTY_CARD+PKT. Ekstrakcja jest 1:1;
 * ewentualna unifikacja tych dwóch revertów = osobna, wypisana decyzja.
 */
const revertOldExpenseBalances = async (tx: any, oldExpense: any) => {
    const oldAmountDecimal = oldExpense.amount;
    if (oldExpense.personalAccountId) {
        const revertBalance = async (accId: string, amount: Prisma.Decimal, curr: string, isIncToRevert: boolean) => {
            const acc = await tx.personalAccount.findUnique({ where: { id: accId } });
            if (!acc) return;

            const accCurrency = acc.currency || (acc.type === 'LOYALTY_CARD' ? 'PKT' : 'PLN');

            // Calculate value for the main balance (must be in accCurrency)
            let valueForMainBalance = amount;
            if (curr !== accCurrency) {
                const transactionRate = await CurrencyService.getExchangeRate(curr, oldExpense.transactionDate);
                const accountRate = await CurrencyService.getExchangeRate(accCurrency, oldExpense.transactionDate);
                valueForMainBalance = amount.mul(new Prisma.Decimal(transactionRate)).div(new Prisma.Decimal(accountRate));
            }

            await tx.personalAccount.update({
                where: { id: accId },
                data: { balance: isIncToRevert ? { decrement: valueForMainBalance } : { increment: valueForMainBalance } }
            });

            await (tx as any).accountBalance.upsert({
                where: { personalAccountId_currency: { personalAccountId: accId, currency: curr } },
                update: { balance: isIncToRevert ? { decrement: amount } : { increment: amount } },
                create: { personalAccountId: accId, currency: curr, balance: isIncToRevert ? amount.mul(-1) : amount }
            });
        };

        if (oldExpense.type === 'exchange') {
            const oldTargetAmount = oldExpense.targetAmount || new Prisma.Decimal(0);
            const oldTargetCurrency = oldExpense.targetCurrency || 'PLN';

            const fromPlnValue = oldExpense.currency === 'PLN' ? oldExpense.amount : oldExpense.plnAmount || oldExpense.amount.mul(oldExpense.exchangeRate || new Prisma.Decimal(1));
            const oldTargetExchangeRate = await CurrencyService.getExchangeRate(oldTargetCurrency, oldExpense.transactionDate);
            const toPlnValue = oldTargetCurrency === 'PLN' ? oldTargetAmount : oldTargetAmount.mul(new Prisma.Decimal(oldTargetExchangeRate));

            await tx.personalAccount.update({
                where: { id: oldExpense.personalAccountId },
                data: { balance: { decrement: toPlnValue.sub(fromPlnValue) } }
            });

            await (tx as any).accountBalance.update({
                where: { personalAccountId_currency: { personalAccountId: oldExpense.personalAccountId, currency: oldExpense.currency || 'PLN' } },
                data: { balance: { increment: oldExpense.amount } }
            });
            await (tx as any).accountBalance.update({
                where: { personalAccountId_currency: { personalAccountId: oldExpense.personalAccountId, currency: oldTargetCurrency } },
                data: { balance: { decrement: oldTargetAmount } }
            });
        } else {
            await revertBalance(oldExpense.personalAccountId, oldExpense.amount, oldExpense.currency || 'PLN', oldExpense.type === 'income');
        }
    }

    if (oldExpense.fromSavingsAccountId) {
        await tx.savingsAccount.update({ where: { id: oldExpense.fromSavingsAccountId }, data: { balance: { increment: oldAmountDecimal } } });
    }

    if (oldExpense.type === 'internal_transfer' && oldExpense.toPersonalAccountId) {
        // Revert uznania konta docelowego: type 'expense' = dekrement z konwersją
        await updateAccountBalance(tx, {
            personalAccountId: oldExpense.toPersonalAccountId,
            amount: oldAmountDecimal,
            currency: oldExpense.currency || 'PLN',
            type: 'expense',
            date: oldExpense.transactionDate
        });
    }

    if (oldExpense.savingsAccountId) {
        await tx.savingsAccount.update({ where: { id: oldExpense.savingsAccountId }, data: { balance: { decrement: oldAmountDecimal } } });
    }

    if (oldExpense.investmentAccountId) {
        let isInvSource = oldExpense.type === 'internal_transfer' && (oldExpense.toPersonalAccountId || oldExpense.savingsAccountId);
        if (isInvSource) {
            await tx.investmentAccount.update({ where: { id: oldExpense.investmentAccountId }, data: { balance: { increment: oldAmountDecimal } } });
        } else {
            await tx.investmentAccount.update({ where: { id: oldExpense.investmentAccountId }, data: { balance: { decrement: oldAmountDecimal } } });
        }
    }

    if (oldExpense.type === 'investment_transfer' && oldExpense.investmentId) {
        await tx.investment.update({ where: { id: oldExpense.investmentId }, data: { currentValue: { decrement: oldAmountDecimal } } });
    }

    if (oldExpense.savingsGoalId) {
        const oldGoal = await tx.savingsGoal.findUnique({ where: { id: oldExpense.savingsGoalId } });
        if (oldGoal && !oldGoal.isMain) {
            await tx.savingsGoal.update({ where: { id: oldExpense.savingsGoalId }, data: { allocatedAmount: { decrement: oldAmountDecimal } } });
        }
    }
};

/**
 * FAZA 3 update'u — nakłada skutki balansowe NOWEGO (już nadpisanego) wydatku.
 * `amountDecimal` = kwota nowego wydatku, `newType` = docelowy typ. Kolejność operacji
 * lustrzana wobec `createExpenseBusinessLogic` (ta sama semantyka księgowania).
 */
const applyNewExpenseBalances = async (tx: any, updatedExpense: any, amountDecimal: Prisma.Decimal, newType: string) => {
    if (updatedExpense.personalAccountId) {
        const updateBalance = async (accId: string, amount: Prisma.Decimal, curr: string, isInc: boolean) => {
            const acc = await tx.personalAccount.findUnique({ where: { id: accId } });
            if (!acc) return;

            const accCurrency = getEffectiveCurrency(acc);

            // Calculate value for the main balance (must be in accCurrency)
            let valueForMainBalance = amount;
            if (curr !== accCurrency) {
                const transactionRate = await CurrencyService.getExchangeRate(curr, updatedExpense.transactionDate);
                const accountRate = await CurrencyService.getExchangeRate(accCurrency, updatedExpense.transactionDate);
                valueForMainBalance = amount.mul(new Prisma.Decimal(transactionRate)).div(new Prisma.Decimal(accountRate));
            }

            await tx.personalAccount.update({
                where: { id: accId },
                data: { balance: isInc ? { increment: valueForMainBalance } : { decrement: valueForMainBalance } }
            });

            // Update specific currency balance (AccountBalance table)
            // Skip if it is the main currency of a loyalty card to avoid duplication
            if (!(acc.type === 'LOYALTY_CARD' && curr === 'PKT')) {
                await (tx as any).accountBalance.upsert({
                    where: { personalAccountId_currency: { personalAccountId: accId, currency: curr } },
                    update: { balance: isInc ? { increment: amount } : { decrement: amount } },
                    create: { personalAccountId: accId, currency: curr, balance: isInc ? amount : amount.mul(-1) }
                });
            }
        };

        if (newType === 'exchange') {
            const newAmount = updatedExpense.amount;
            const newCurrency = updatedExpense.currency || 'PLN';
            const newTargetAmount = updatedExpense.targetAmount || new Prisma.Decimal(0);
            const newTargetCurrency = updatedExpense.targetCurrency || 'PLN';

            const fromExchangeRate = await CurrencyService.getExchangeRate(newCurrency, updatedExpense.transactionDate);
            const fromPlnValue = newCurrency === 'PLN' ? newAmount : newAmount.mul(new Prisma.Decimal(fromExchangeRate));

            const toExchangeRate = await CurrencyService.getExchangeRate(newTargetCurrency, updatedExpense.transactionDate);
            const toPlnValue = newTargetCurrency === 'PLN' ? newTargetAmount : newTargetAmount.mul(new Prisma.Decimal(toExchangeRate));

            await tx.personalAccount.update({
                where: { id: updatedExpense.personalAccountId },
                data: { balance: { increment: toPlnValue.sub(fromPlnValue) } }
            });

            await (tx as any).accountBalance.upsert({
                where: { personalAccountId_currency: { personalAccountId: updatedExpense.personalAccountId, currency: newCurrency } },
                update: { balance: { decrement: newAmount } },
                create: { personalAccountId: updatedExpense.personalAccountId, currency: newCurrency, balance: newAmount.mul(-1) }
            });
            await (tx as any).accountBalance.upsert({
                where: { personalAccountId_currency: { personalAccountId: updatedExpense.personalAccountId, currency: newTargetCurrency } },
                update: { balance: { increment: newTargetAmount } },
                create: { personalAccountId: updatedExpense.personalAccountId, currency: newTargetCurrency, balance: newTargetAmount }
            });
        } else {
            await updateBalance(updatedExpense.personalAccountId, updatedExpense.amount, updatedExpense.currency || 'PLN', newType === 'income');
        }
    }

    if (updatedExpense.fromSavingsAccountId) {
        await tx.savingsAccount.update({ where: { id: updatedExpense.fromSavingsAccountId }, data: { balance: { decrement: amountDecimal } } });
    }

    if (newType === 'internal_transfer' && updatedExpense.toPersonalAccountId) {
        await updateAccountBalance(tx, {
            personalAccountId: updatedExpense.toPersonalAccountId,
            amount: amountDecimal,
            currency: updatedExpense.currency || 'PLN',
            type: 'income',
            date: updatedExpense.transactionDate
        });
    }

    if (updatedExpense.savingsAccountId) {
        await tx.savingsAccount.update({ where: { id: updatedExpense.savingsAccountId }, data: { balance: { increment: amountDecimal } } });
    }

    if (updatedExpense.investmentAccountId) {
        let isInvSource = newType === 'internal_transfer' && (updatedExpense.toPersonalAccountId || updatedExpense.savingsAccountId);
        if (isInvSource) {
            await tx.investmentAccount.update({ where: { id: updatedExpense.investmentAccountId }, data: { balance: { decrement: amountDecimal } } });
        } else {
            await tx.investmentAccount.update({ where: { id: updatedExpense.investmentAccountId }, data: { balance: { increment: amountDecimal } } });
        }
    }

    if (newType === 'investment_transfer' && updatedExpense.investmentId) {
        await tx.investment.update({ where: { id: updatedExpense.investmentId }, data: { currentValue: { increment: amountDecimal } } });
    }

    if (updatedExpense.savingsGoalId) {
        const newGoal = await tx.savingsGoal.findUnique({ where: { id: updatedExpense.savingsGoalId } });
        if (newGoal && !newGoal.isMain) {
            await tx.savingsGoal.update({ where: { id: updatedExpense.savingsGoalId }, data: { allocatedAmount: { increment: amountDecimal } } });
        }
    }
};

export const updateExpenseBusinessLogic = async (userId: string, id: string, data: unknown) => {
        // Kontrakt PARTIAL: absent = „nie zmieniaj", null/falsy = „wyczyść" (patrz schemat).
        const parsed = expenseUpdateSchema.safeParse(data);
        if (!parsed.success) {
            throw mapUpdateExpenseError(parsed.error);
        }

        const {
            type,
            amount,
            description,
            categoryId,
            date,
            store,
            storeId,
            note,
            personalAccountId,
            toPersonalAccountId,
            fromSavingsAccountId,
            savingsAccountId,
            investmentId,
            investmentAccountId,
            savingsGoalId,
            isRecurring,
            recurrenceInterval,
            recurrenceEndDate,
            currency,
            targetAmount,
            targetCurrency
        } = parsed.data;

        const result = await runFinancialTransaction(async (tx) => {
            const oldExpense = await tx.expense.findFirst({
                where: { id, userId }
            });

            if (!oldExpense) {
                throw new Error('NOT_FOUND');
            }

            // 🔐 SECURITY: Validate ownership inside transaction
            const isOwnershipValid = await validateTransactionAccess(userId, {
                personalAccountId: personalAccountId !== undefined ? personalAccountId : null,
                toPersonalAccountId: toPersonalAccountId !== undefined ? toPersonalAccountId : null,
                fromSavingsAccountId: fromSavingsAccountId !== undefined ? fromSavingsAccountId : null,
                savingsAccountId: savingsAccountId !== undefined ? savingsAccountId : null,
                investmentAccountId: investmentAccountId !== undefined ? investmentAccountId : null,
                investmentId: investmentId !== undefined ? investmentId : null,
                savingsGoalId: savingsGoalId !== undefined ? savingsGoalId : null,
            });

            if (!isOwnershipValid) {
                throw new Error('FORBIDDEN');
            }

            const amountDecimal = amount !== undefined ? new Prisma.Decimal(String(amount)) : oldExpense.amount;
            const newPersonalAccountId = personalAccountId !== undefined ? personalAccountId : oldExpense.personalAccountId;
            const newFromSavingsAccountId = fromSavingsAccountId !== undefined ? fromSavingsAccountId : oldExpense.fromSavingsAccountId;

            const newType = type || oldExpense.type;
            if (newType !== 'income' && newType !== 'exchange') {
                let balanceCheckTarget = new Prisma.Decimal(0);
                if (newPersonalAccountId === oldExpense.personalAccountId && newFromSavingsAccountId === oldExpense.fromSavingsAccountId) {
                    // Same account: only check if amount increased
                    balanceCheckTarget = Prisma.Decimal.max(0, amountDecimal.minus(oldExpense.amount));
                } else {
                    // Different account: check full new amount
                    balanceCheckTarget = amountDecimal;
                }

                if (balanceCheckTarget.greaterThan(0)) {
                    const balanceCheck = await checkBalanceWithTx(tx, balanceCheckTarget, (currency || oldExpense.currency || 'PLN'), newPersonalAccountId ?? undefined, newFromSavingsAccountId ?? undefined);
                    if (!balanceCheck.valid) {
                        throw new Error(balanceCheck.message + ' po zmianie');
                    }
                }
            }

            // 1. Revert old balance changes
            await revertOldExpenseBalances(tx, oldExpense);

            let finalCategoryId = categoryId !== undefined ? (categoryId ? Number(categoryId) : null) : oldExpense.categoryId;

            if (newType === 'expense' && !finalCategoryId) {
                const inneCategory = await tx.category.findFirst({ where: { name: 'Inne', userId: null } });
                if (inneCategory) finalCategoryId = inneCategory.id;
            }

            const finalCurrency = currency !== undefined ? currency : (oldExpense.currency || 'PLN');
            const finalDate = date ? new Date(date) : oldExpense.transactionDate;
            const finalExchangeRate = await CurrencyService.getExchangeRate(finalCurrency, finalDate);
            const finalExchangeRateDecimal = new Prisma.Decimal(finalExchangeRate);
            const finalPlnAmount = finalCurrency !== 'PLN' ? amountDecimal.mul(finalExchangeRateDecimal).toDecimalPlaces(2) : amountDecimal;

            // 2. Update transaction
            const updatedExpense = await tx.expense.update({
                where: { id },
                data: {
                    type: newType,
                    amount: amountDecimal,
                    description: description || oldExpense.description,
                    categoryId: finalCategoryId,
                    transactionDate: date ? new Date(date) : oldExpense.transactionDate,
                    store: store !== undefined ? store : oldExpense.store,
                    note: note !== undefined ? note : oldExpense.note,
                    personalAccountId: personalAccountId !== undefined ? personalAccountId : oldExpense.personalAccountId,
                    toPersonalAccountId: toPersonalAccountId !== undefined ? toPersonalAccountId : oldExpense.toPersonalAccountId,
                    fromSavingsAccountId: fromSavingsAccountId !== undefined ? fromSavingsAccountId : oldExpense.fromSavingsAccountId,
                    savingsAccountId: savingsAccountId !== undefined ? savingsAccountId : oldExpense.savingsAccountId,
                    investmentId: investmentId !== undefined ? investmentId : oldExpense.investmentId,
                    investmentAccountId: investmentAccountId !== undefined ? investmentAccountId : oldExpense.investmentAccountId,
                    savingsGoalId: savingsGoalId !== undefined ? savingsGoalId : oldExpense.savingsGoalId,
                    // Kolumna Boolean non-nullable: null (jak brak) → zachowaj stare; false → false.
                    isRecurring: isRecurring ?? oldExpense.isRecurring,
                    recurrenceInterval: recurrenceInterval !== undefined ? recurrenceInterval : oldExpense.recurrenceInterval,
                    recurrenceEndDate: recurrenceEndDate !== undefined ? (recurrenceEndDate ? new Date(recurrenceEndDate) : null) : oldExpense.recurrenceEndDate,
                    storeId: storeId !== undefined ? storeId : oldExpense.storeId,
                    currency: finalCurrency,
                    originalAmount: finalCurrency !== 'PLN' ? amountDecimal : null,
                    exchangeRate: finalCurrency !== 'PLN' ? finalExchangeRateDecimal : null,
                    plnAmount: finalPlnAmount,
                    targetCurrency: targetCurrency !== undefined ? targetCurrency : oldExpense.targetCurrency,
                    targetAmount: targetAmount !== undefined ? (targetAmount ? new Prisma.Decimal(String(targetAmount)) : null) : oldExpense.targetAmount
                },
                include: { category: true, storeRef: true, personalAccount: true, fromSavingsAccount: true, savingsAccount: true, investmentAccount: true }
            });

            // 3. Apply new balance changes
            await applyNewExpenseBalances(tx, updatedExpense, amountDecimal, newType);

            return updatedExpense;
        });

        return result;
};



// Delete expense and revert balance changes


export const deleteExpenseBusinessLogic = async (userId: string, id: string) => {
        await runFinancialTransaction(async (tx) => {
            const expense = await tx.expense.findFirst({
                where: { id, userId }
            });

            if (!expense) {
                throw new Error('NOT_FOUND');
            }

            const amountDecimal = expense.amount;

            // Sprawdź czy usunięcie (revert) nie spowoduje przekroczenia debetu
            if (expense.personalAccountId && expense.type === 'income') {
                const balanceCheck = await checkBalanceWithTx(tx, expense.amount, (expense as any).currency || 'PLN', expense.personalAccountId);
                if (!balanceCheck.valid) {
                    throw new Error('Nie można usunąć wpływu - przekroczono limit debetu na koncie');
                }
            }

            if (expense.type === 'internal_transfer' && expense.toPersonalAccountId) {
                const balanceCheck = await checkBalanceWithTx(tx, expense.amount, (expense as any).currency || 'PLN', expense.toPersonalAccountId);
                if (!balanceCheck.valid) {
                    throw new Error('Nie można usunąć przelewu - przekroczono limit debetu na koncie docelowym');
                }
            }

            if (expense.personalAccountId) {
                const revertBalance = async (accId: string, amount: Prisma.Decimal, curr: string, isIncToRevert: boolean) => {
                    const acc = await tx.personalAccount.findUnique({ where: { id: accId } });
                    if (!acc) return;

                    const accCurrency = getEffectiveCurrency(acc);

                    // Calculate value for the main balance (must be in accCurrency)
                    let valueForMainBalance = amount;
                    if (curr !== accCurrency) {
                        const transactionRate = await CurrencyService.getExchangeRate(curr, expense.transactionDate);
                        const accountRate = await CurrencyService.getExchangeRate(accCurrency, expense.transactionDate);
                        valueForMainBalance = amount.mul(new Prisma.Decimal(transactionRate)).div(new Prisma.Decimal(accountRate));
                    }

                    await tx.personalAccount.update({
                        where: { id: accId },
                        data: { balance: isIncToRevert ? { decrement: valueForMainBalance } : { increment: valueForMainBalance } }
                    });

                    // Update specific currency balance (AccountBalance table)
                    // Skip if it is the main currency of a loyalty card to avoid duplication
                    if (!(acc.type === 'LOYALTY_CARD' && curr === 'PKT')) {
                        await (tx as any).accountBalance.upsert({
                            where: { personalAccountId_currency: { personalAccountId: accId, currency: curr } },
                            update: { balance: isIncToRevert ? { decrement: amount } : { increment: amount } },
                            create: { personalAccountId: accId, currency: curr, balance: isIncToRevert ? amount.mul(-1) : amount }
                        });
                    }
                };

                if (expense.type === 'exchange') {
                    const currency = expense.currency || 'PLN';
                    const amount = expense.amount;
                    const targetCurrency = (expense as any).targetCurrency || 'PLN';
                    const targetAmount = new Prisma.Decimal((expense as any).targetAmount || 0);

                    // Revert source (increment back)
                    const acc = await tx.personalAccount.findUnique({ where: { id: expense.personalAccountId } });
                    const accCurrency = acc ? getEffectiveCurrency(acc) : 'PLN';

                    const sourceRate = await CurrencyService.getExchangeRate(currency, expense.transactionDate);
                    const sourceValueInPln = currency === 'PLN' ? amount : amount.mul(new Prisma.Decimal(sourceRate));

                    let sourceValueInAcc = sourceValueInPln;
                    if (accCurrency !== 'PLN') {
                        const accountRate = await CurrencyService.getExchangeRate(accCurrency, expense.transactionDate);
                        sourceValueInAcc = sourceValueInPln.div(new Prisma.Decimal(accountRate));
                    }

                    await tx.personalAccount.update({
                        where: { id: expense.personalAccountId },
                        data: { balance: { increment: sourceValueInAcc } }
                    });

                    // Update sub-balance if not loyalty card
                    if (acc && !(acc.type === 'LOYALTY_CARD' && currency === 'PKT')) {
                        await (tx as any).accountBalance.upsert({
                            where: { personalAccountId_currency: { personalAccountId: expense.personalAccountId, currency } },
                            update: { balance: { increment: amount } },
                            create: { personalAccountId: expense.personalAccountId, currency, balance: amount }
                        });
                    }

                    // Revert target (decrement back)
                    const targetRate = await CurrencyService.getExchangeRate(targetCurrency, expense.transactionDate);
                    const targetValueInPln = targetCurrency === 'PLN' ? targetAmount : targetAmount.mul(new Prisma.Decimal(targetRate));

                    let targetValueInAcc = targetValueInPln;
                    if (accCurrency !== 'PLN') {
                        const accountRate = await CurrencyService.getExchangeRate(accCurrency, expense.transactionDate);
                        targetValueInAcc = targetValueInPln.div(new Prisma.Decimal(accountRate));
                    }

                    await tx.personalAccount.update({
                        where: { id: expense.personalAccountId },
                        data: { balance: { decrement: targetValueInAcc } }
                    });

                    // Update sub-balance if not loyalty card
                    if (acc && !(acc.type === 'LOYALTY_CARD' && targetCurrency === 'PKT')) {
                        await (tx as any).accountBalance.upsert({
                            where: { personalAccountId_currency: { personalAccountId: expense.personalAccountId, currency: targetCurrency } },
                            update: { balance: { decrement: targetAmount } },
                            create: { personalAccountId: expense.personalAccountId, currency: targetCurrency, balance: targetAmount.mul(-1) }
                        });
                    }
                } else {
                    await revertBalance(expense.personalAccountId, expense.amount, (expense as any).currency || 'PLN', expense.type === 'income');
                }
            }

            // Przywróć saldo konta oszczędnościowego (źródłowego)
            if (expense.fromSavingsAccountId) {
                await tx.savingsAccount.update({
                    where: { id: expense.fromSavingsAccountId },
                    data: { balance: { increment: amountDecimal } }
                });
            }

            // Dla transferu wewnętrznego - cofnij saldo docelowe (z konwersją i AccountBalance)
            if (expense.type === 'internal_transfer' && expense.toPersonalAccountId) {
                await updateAccountBalance(tx, {
                    personalAccountId: expense.toPersonalAccountId,
                    amount: amountDecimal,
                    currency: expense.currency || 'PLN',
                    type: 'expense',
                    date: expense.transactionDate
                });
            }

            // Dla transferu oszczędności lub wewnętrznego na oszczędności - zmniejsz saldo
            if (expense.savingsAccountId) {
                await tx.savingsAccount.update({
                    where: { id: expense.savingsAccountId },
                    data: { balance: { decrement: amountDecimal } }
                });
            }

            // Dla wpływu na konto inwestycyjne - cofnij saldo
            if (expense.investmentAccountId) {
                let isInvSource = false;
                if (expense.type === 'internal_transfer' && (expense.toPersonalAccountId || expense.savingsAccountId)) {
                    isInvSource = true;
                }

                if (isInvSource) {
                    await tx.investmentAccount.update({
                        where: { id: expense.investmentAccountId },
                        data: { balance: { increment: amountDecimal } }
                    });
                } else {
                    await tx.investmentAccount.update({
                        where: { id: expense.investmentAccountId },
                        data: { balance: { decrement: amountDecimal } }
                    });
                }
            }

            if (expense.type === 'investment_transfer' && expense.investmentId) {
                await tx.investment.update({
                    where: { id: expense.investmentId },
                    data: { currentValue: { decrement: amountDecimal } }
                });
            }

            if (expense.savingsGoalId) {
                const targetGoal = await tx.savingsGoal.findUnique({ where: { id: expense.savingsGoalId } });
                if (targetGoal && !targetGoal.isMain) {
                    await tx.savingsGoal.update({
                        where: { id: expense.savingsGoalId },
                        data: { allocatedAmount: { decrement: amountDecimal } }
                    });
                }
            }

            await tx.planItem.updateMany({
                where: { linkedRealExpenseId: id },
                data: { isDone: false, linkedRealExpenseId: null }
            });

            await tx.expense.delete({ where: { id } });
        });

        return true;
};

// Dashboard Summary
