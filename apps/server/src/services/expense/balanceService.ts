import prisma from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { CurrencyService } from '../currencyService';

export const getEffectiveCurrency = (acc: any): string => {
    return (acc.type === 'LOYALTY_CARD') ? 'PKT' : (acc.currency || 'PLN');
};

// Helper to check if source account has sufficient funds
export const checkBalanceWithTx = async (tx: Prisma.TransactionClient, amount: Prisma.Decimal, currency: string = 'PLN', personalAccountId?: string, fromSavingsAccountId?: string, investmentAccountId?: string) => {
    if (personalAccountId) {
        const acc = await tx.personalAccount.findUnique({
            where: { id: personalAccountId },
            include: { balances: true } as any
        });

        if (!acc) return { valid: false, message: 'Konto nie istnieje' };

        const accCurrency = getEffectiveCurrency(acc);

        // Jeśli waluta transakcji zgadza się z walutą główną konta, sprawdzamy główne saldo
        if (currency === accCurrency) {
            const limit = accCurrency === 'PLN' ? -5000 : 0;
            if (acc.balance.minus(amount).lessThan(limit)) {
                return {
                    valid: false,
                    message: accCurrency === 'PLN'
                        ? 'Przekroczono limit debetu (-5000 PLN) na koncie osobistym'
                        : `Niewystarczające środki na koncie (waluta ${accCurrency})`
                };
            }
        } else {
            // Jeśli waluta obca (inna niż główna waluta konta), sprawdzamy specyficzne saldo (brak debetu dla walut obcych)
            const balance = (acc as any).balances.find((b: any) => b.currency === currency);
            if (!balance || balance.balance.lessThan(amount)) {
                return {
                    valid: false,
                    message: `Niewystarczające środki na koncie walutowym (${currency})`
                };
            }
        }
    }
    if (fromSavingsAccountId) {
        const acc = await tx.savingsAccount.findUnique({ where: { id: fromSavingsAccountId } });
        if (!acc) {
            return { valid: false, message: 'Niewystarczające środki na koncie oszczędnościowym' };
        }
        // Porównanie w walucie konta oszczędnościowego
        const accCurrency = acc.currency || 'PLN';
        const amountInAccCurrency = await CurrencyService.convert(amount, currency, accCurrency, new Date());
        if (acc.balance.lessThan(amountInAccCurrency)) {
            return { valid: false, message: `Niewystarczające środki na koncie oszczędnościowym (${accCurrency})` };
        }
    }
    if (investmentAccountId) {
        const acc = await tx.investmentAccount.findUnique({ where: { id: investmentAccountId } });
        if (!acc || acc.balance.lessThan(amount)) {
            return { valid: false, message: 'Niewystarczające środki na koncie inwestycyjnym' };
        }
    }
    return { valid: true };
};

// Legacy helper for simple checks (not recommended for writes)
export const checkBalance = async (amount: number, personalAccountId?: string, fromSavingsAccountId?: string, investmentAccountId?: string) => {
    return checkBalanceWithTx(prisma, new Prisma.Decimal(amount), 'PLN', personalAccountId, fromSavingsAccountId, investmentAccountId);
};
