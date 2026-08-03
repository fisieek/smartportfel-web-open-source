/**
 * 🔐 Ownership Validator
 * 
 * Helper functions to validate that resources belong to the authenticated user.
 * Used to prevent IDOR (Insecure Direct Object Reference) vulnerabilities.
 * 
 * @see implementation_plan.md for security context
 */

import prisma from '../lib/prisma';

/**
 * Sprawdza czy konto osobiste należy do użytkownika
 * @returns true jeśli konto należy do usera lub accountId jest null/undefined
 */
export const validatePersonalAccountOwnership = async (
    accountId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!accountId) return true; // null/undefined = brak konta = OK
    const account = await prisma.personalAccount.findFirst({
        where: { id: accountId, userId }
    });
    return !!account;
};

/**
 * Sprawdza czy konto oszczędnościowe należy do użytkownika
 */
export const validateSavingsAccountOwnership = async (
    accountId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!accountId) return true;
    const account = await prisma.savingsAccount.findFirst({
        where: { id: accountId, userId }
    });
    return !!account;
};

/**
 * Sprawdza czy konto inwestycyjne należy do użytkownika
 */
export const validateInvestmentAccountOwnership = async (
    accountId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!accountId) return true;
    const account = await prisma.investmentAccount.findFirst({
        where: { id: accountId, userId }
    });
    return !!account;
};

/**
 * Sprawdza czy inwestycja należy do użytkownika
 */
export const validateInvestmentOwnership = async (
    investmentId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!investmentId) return true;
    const investment = await prisma.investment.findFirst({
        where: { id: investmentId, userId }
    });
    return !!investment;
};

/**
 * Sprawdza czy cel oszczędnościowy należy do użytkownika
 */
export const validateSavingsGoalOwnership = async (
    goalId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!goalId) return true;
    const goal = await prisma.savingsGoal.findFirst({
        where: { id: goalId, userId }
    });
    return !!goal;
};

/**
 * Sprawdza czy kategoria należy do użytkownika
 */
/**
 * Czy kategoria należy do TEGO użytkownika — kontrola przed EDYCJĄ i USUNIĘCIEM.
 *
 * ⚠️ Kategorie systemowe (`userId: null`) świadomie NIE przechodzą. Są wspólne dla
 * wszystkich kont na instancji, więc pozwolenie na ich modyfikację oznacza, że jedna
 * osoba zmienia słownik wszystkim pozostałym. Do niedawna ten walidator dopuszczał je
 * przez `OR: [{ userId: null }, { userId }]` i dowolne konto mogło zmienić nazwę,
 * kolor albo OPIS kategorii systemowej — a opis steruje heurystyką auto-kategoryzacji.
 * Interfejs takich przycisków nie pokazuje, ale API było otwarte na wprost.
 *
 * Jeśli kiedyś będzie potrzebna kontrola „czy mogę tej kategorii UŻYĆ" (tam systemowe
 * są jak najbardziej dozwolone), to musi być OSOBNA funkcja — nie warunek w tej.
 */
export const validateCategoryOwnership = async (
    categoryId: number | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!categoryId) return true;
    const category = await prisma.category.findFirst({
        where: { id: categoryId, userId }
    });
    return !!category;
};

/**
 * Sprawdza czy kredyt hipoteczny należy do użytkownika
 */
export const validateMortgageOwnership = async (
    mortgageId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!mortgageId) return true;
    const mortgage = await prisma.mortgage.findFirst({
        where: { id: mortgageId, userId }
    });
    return !!mortgage;
};

/**
 * Czy sklep należy do TEGO użytkownika — kontrola przed USUNIĘCIEM.
 *
 * ⚠️ Sklepy systemowe (`userId: null`) świadomie NIE przechodzą — z tego samego powodu
 * co przy kategoriach: są wspólne dla całej instancji. Patrz komentarz przy
 * `validateCategoryOwnership`.
 */
export const validateStoreOwnership = async (
    storeId: string | null | undefined,
    userId: string
): Promise<boolean> => {
    if (!storeId) return true;
    const store = await prisma.store.findFirst({
        where: { id: storeId, userId }
    });
    return !!store;
};

/**
 * Sprawdza własność wszystkich kont używanych w transakcji
 * @returns true jeśli wszystkie konta należą do usera
 */
export const validateTransactionOwnership = async (
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
        validatePersonalAccountOwnership(accountIds.personalAccountId, userId),
        validatePersonalAccountOwnership(accountIds.toPersonalAccountId, userId),
        validateSavingsAccountOwnership(accountIds.fromSavingsAccountId, userId),
        validateSavingsAccountOwnership(accountIds.savingsAccountId, userId),
        validateInvestmentAccountOwnership(accountIds.investmentAccountId, userId),
        validateInvestmentOwnership(accountIds.investmentId, userId),
        validateSavingsGoalOwnership(accountIds.savingsGoalId, userId),
    ]);

    return !checks.includes(false);
};
