import { describe, it, expect } from 'vitest';
import { suggestInstallment } from '@smartportfel/shared';
import { computeMonthlyInstallment } from './loanInstallment';

const base = {
    currentBalance: 300000,
    termMonths: 300,
    marginRate: 2,
    referenceRate: 5.75, // razem 7.75%
    installmentType: 'EQUAL' as const,
    payments: [],
};

describe('computeMonthlyInstallment', () => {
    it('liczy ratę równą (annuitet) dla 300 000 @ 7,75% / 300 mies.', () => {
        const r = computeMonthlyInstallment(base)!;
        expect(r).toBeGreaterThan(2200);
        expect(r).toBeLessThan(2330); // ~2265,99
    });

    it('rata malejąca jest wyższa niż równa na starcie', () => {
        const equal = computeMonthlyInstallment(base)!;
        const decreasing = computeMonthlyInstallment({ ...base, installmentType: 'DECREASING' })!;
        expect(decreasing).toBeGreaterThan(equal);
    });

    it('uwzględnia spłacone raty w pozostałym okresie', () => {
        const fresh = computeMonthlyInstallment(base)!;
        const after100 = computeMonthlyInstallment({ ...base, payments: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) })!;
        // krótszy pozostały okres → wyższa rata przy tym samym saldzie
        expect(after100).toBeGreaterThan(fresh);
    });

    it('zwraca null przy braku danych', () => {
        expect(computeMonthlyInstallment({ ...base, installmentType: null })).toBeNull();
        expect(computeMonthlyInstallment({ ...base, termMonths: null })).toBeNull();
        expect(computeMonthlyInstallment({ ...base, marginRate: null, referenceRate: null })).toBeNull();
        expect(computeMonthlyInstallment({ ...base, currentBalance: 0 })).toBeNull();
    });
});

// Parzystość adaptera z prymitywem w shared — przepięcie na `suggestInstallment`
// nie może zmienić raty ani o grosz na żadnym profilu kredytu.
describe('computeMonthlyInstallment ≡ suggestInstallment (parzystość z shared)', () => {
    type LoanLike = Parameters<typeof computeMonthlyInstallment>[0];
    const profiles: Array<{ name: string; loan: LoanLike }> = [
        { name: 'annuitet 300 000 @ 7,75% / 300 mies.', loan: base },
        { name: 'rata malejąca', loan: { ...base, installmentType: 'DECREASING' as const } },
        { name: 'oprocentowanie 0%', loan: { ...base, marginRate: 0, referenceRate: 0 } },
        { name: 'tylko marża (referenceRate null)', loan: { ...base, referenceRate: null } },
        { name: 'ostatni miesiąc (n = 1)', loan: { ...base, termMonths: 1 } },
        {
            name: 'po 100 spłaconych ratach',
            loan: { ...base, payments: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })) },
        },
        {
            name: 'saldo jako string (Prisma.Decimal serializowane)',
            loan: { ...base, currentBalance: '250000.55' },
        },
        {
            name: 'saldo jako obiekt Decimal-like (valueOf)',
            loan: { ...base, currentBalance: { valueOf: () => '199999.99', toString: () => '199999.99' } },
        },
    ];

    for (const { name, loan } of profiles) {
        it(name, () => {
            const suggestion = suggestInstallment({
                currentBalance: Number(loan.currentBalance),
                termMonths: loan.termMonths,
                marginRate: loan.marginRate != null ? Number(loan.marginRate) : null,
                referenceRate: loan.referenceRate != null ? Number(loan.referenceRate) : null,
                installmentType: loan.installmentType,
                paymentsMade: loan.payments?.length ?? 0,
            });
            expect(suggestion).not.toBeNull();
            expect(computeMonthlyInstallment(loan)).toBe(suggestion!.totalAmount);
        });
    }
});
