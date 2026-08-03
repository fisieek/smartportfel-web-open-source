/**
 * Wyliczenie miesięcznej raty kredytu z parametrów (saldo, oprocentowanie, pozostały okres).
 * Cienki adapter na `@smartportfel/shared#suggestInstallment` (jedno źródło matematyki
 * kredytowej dla weba i serwera) — używane przez planowanie miesiąca, by pokazać raty
 * kredytów obok pozostałych zaplanowanych wydatków (read-only).
 */
import { suggestInstallment } from '@smartportfel/shared';

interface LoanLike {
    currentBalance: unknown;
    termMonths?: number | null;
    marginRate?: unknown;
    referenceRate?: unknown;
    installmentType?: 'EQUAL' | 'DECREASING' | null;
    payments?: { id: string }[];
}

/** Zwraca miesięczną ratę (część kapitałowa + odsetkowa) lub null przy niekompletnych danych. */
export function computeMonthlyInstallment(loan: LoanLike): number | null {
    const suggestion = suggestInstallment({
        currentBalance: Number(loan.currentBalance),
        termMonths: loan.termMonths ?? null,
        marginRate: loan.marginRate != null ? Number(loan.marginRate) : null,
        referenceRate: loan.referenceRate != null ? Number(loan.referenceRate) : null,
        installmentType: loan.installmentType ?? null,
        paymentsMade: loan.payments?.length ?? 0,
    });
    return suggestion?.totalAmount ?? null;
}
