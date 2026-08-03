import { Prisma } from '@prisma/client';
import { CurrencyService } from '../services/currencyService';

/**
 * Pobiera efektywną walutę konta
 */
export const getEffectiveCurrency = (acc: any): string => {
    return (acc.type === 'LOYALTY_CARD') ? 'PKT' : (acc.currency || 'PLN');
};

/**
 * Uniwersalne narzędzie do aktualizacji salda konta
 */
export const updateAccountBalance = async (
    tx: Prisma.TransactionClient,
    params: {
        personalAccountId?: string | null;
        savingsAccountId?: string | null;
        investmentAccountId?: string | null;
        amount: Prisma.Decimal | number;
        currency: string;
        type: string;
        date: Date;
    }
) => {
    const { personalAccountId, savingsAccountId, investmentAccountId, amount, currency, type, date } = params;
    const amountDecimal = new Prisma.Decimal(amount);
    const isIncrement = type === 'income';

    // 1. Personal Account Balance
    if (personalAccountId) {
        const acc = await tx.personalAccount.findUnique({ where: { id: personalAccountId } });
        if (acc) {
            const accCurrency = getEffectiveCurrency(acc);

            // Konwersja waluty przez CurrencyService
            const valueForMainBalance = await CurrencyService.convert(amountDecimal, currency, accCurrency, date);

            await tx.personalAccount.update({
                where: { id: personalAccountId },
                data: { balance: isIncrement ? { increment: valueForMainBalance } : { decrement: valueForMainBalance } }
            });

            // Update specific currency balance (AccountBalance table)
            if (!(acc.type === 'LOYALTY_CARD' && currency === 'PKT')) {
                await (tx as any).accountBalance.upsert({
                    where: { personalAccountId_currency: { personalAccountId, currency } },
                    update: { balance: isIncrement ? { increment: amountDecimal } : { decrement: amountDecimal } },
                    create: { personalAccountId, currency, balance: isIncrement ? amountDecimal : amountDecimal.mul(-1) }
                });
            }
        }
    }

    // 2. Savings Account Balance
    if (savingsAccountId) {
        const savingsAcc = await tx.savingsAccount.findUnique({ where: { id: savingsAccountId } });
        if (savingsAcc) {
            const accCurrency = savingsAcc.currency || 'PLN';
            const valueForBalance = await CurrencyService.convert(amountDecimal, currency, accCurrency, date);

            await tx.savingsAccount.update({
                where: { id: savingsAccountId },
                data: { balance: isIncrement ? { increment: valueForBalance } : { decrement: valueForBalance } }
            });
        }
    }

    // 3. Investment Account Balance
    if (investmentAccountId) {
        await tx.investmentAccount.update({
            where: { id: investmentAccountId },
            data: { balance: isIncrement ? { increment: amountDecimal } : { decrement: amountDecimal } }
        });
    }
};
