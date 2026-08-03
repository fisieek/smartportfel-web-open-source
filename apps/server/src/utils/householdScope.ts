/**
 * 🏠 Household Scope
 *
 * Warstwa uprawnień dla wspólnych kont. Model (decyzja 2026-06-13):
 *  - użytkownik należy do maks. 1 gospodarstwa,
 *  - członek WIDZI i KSIĘGUJE na kontach osobistych współczłonków oznaczonych `isShared`,
 *  - edycję/usuwanie pojedynczego wpisu ogranicza autor (`expense.userId`) — to egzekwujemy w kontrolerach transakcji,
 *  - konta prywatne (`isShared=false`) pozostają wyłącznie właściciela.
 */

import prisma from '../lib/prisma';
import {
    validateSavingsAccountOwnership,
    validateInvestmentAccountOwnership,
    validateInvestmentOwnership,
    validateSavingsGoalOwnership,
} from './ownershipValidator';

/** Id współczłonków gospodarstwa (bez samego użytkownika). Pusta tablica, gdy brak gospodarstwa. */
export const getHouseholdCoMemberIds = async (userId: string): Promise<string[]> => {
    const membership = await prisma.householdMember.findUnique({ where: { userId } });
    if (!membership) return [];
    const members = await prisma.householdMember.findMany({
        where: { householdId: membership.householdId, userId: { not: userId } },
        select: { userId: true }
    });
    return members.map(m => m.userId);
};

/**
 * Czy użytkownik ma dostęp (odczyt + księgowanie) do danego konta osobistego:
 * własne konto LUB wspólne (`isShared`) konto współczłonka gospodarstwa.
 */
export const validatePersonalAccountAccess = async (
    accountId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!accountId) return true;

    const own = await prisma.personalAccount.findFirst({ where: { id: accountId, userId } });
    if (own) return true;

    const coMemberIds = await getHouseholdCoMemberIds(userId);
    if (coMemberIds.length === 0) return false;

    const shared = await prisma.personalAccount.findFirst({
        where: { id: accountId, userId: { in: coMemberIds }, isShared: true }
    });
    return !!shared;
};

/**
 * Walidacja kont użytych w transakcji z uwzględnieniem wspólnych kont gospodarstwa.
 * Konta osobiste: własne LUB wspólne współczłonka (księgowanie dozwolone).
 * Konta oszczędnościowe/inwestycyjne i cele: nadal wyłącznie właściciela.
 * Edycję/usuwanie pojedynczego wpisu i tak ogranicza autor (`where: { id, userId }` w serwisie).
 */
export const validateTransactionAccess = async (
    userId: string,
    accountIds: {
        personalAccountId?: string | null;
        toPersonalAccountId?: string | null;
        fromSavingsAccountId?: string | null;
        savingsAccountId?: string | null;
        investmentAccountId?: string | null;
        investmentId?: string | null;
        savingsGoalId?: string | null;
    }
): Promise<boolean> => {
    const checks = await Promise.all([
        validatePersonalAccountAccess(accountIds.personalAccountId, userId),
        validatePersonalAccountAccess(accountIds.toPersonalAccountId, userId),
        validateSavingsAccountOwnership(accountIds.fromSavingsAccountId, userId),
        validateSavingsAccountOwnership(accountIds.savingsAccountId, userId),
        validateInvestmentAccountOwnership(accountIds.investmentAccountId, userId),
        validateInvestmentOwnership(accountIds.investmentId, userId),
        validateSavingsGoalOwnership(accountIds.savingsGoalId, userId),
    ]);
    return !checks.includes(false);
};
