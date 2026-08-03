import { Decimal } from '@prisma/client/runtime/library';
import { SavingsAccount } from '@prisma/client';
import {
    startOfMonth,
    endOfMonth,
    startOfDay,
    endOfDay,
    isAfter,
    isBefore,
    isSameDay,
    addDays,
    addMonths,
    format
} from 'date-fns';

interface SimulationResult {
    totalGross: Decimal;
    totalTax: Decimal;
    totalNet: Decimal;
    projectedEndBalance: Decimal;
    daysDetails: Array<{ date: string; gross: number; tax: number; net: number; balance: number }>;
}

export class RealGainsService {
    private static readonly BELKA_TAX_RATE = new Decimal(0.19);

    /**
     * Calculates daily profit for a given balance and annual rate.
     */
    static calculateDailyGain(balance: Decimal, annualRate: Decimal): Decimal {
        if (balance.lte(0) || annualRate.lte(0)) return new Decimal(0);
        // Rate is in percent, e.g. 7.0 for 7%
        // dailyRate = 7.0 / 100 / 365
        const dailyRate = annualRate.div(100).div(365);
        return balance.mul(dailyRate);
    }

    /**
     * Simulates the profit for a specific month.
     */
    static simulateMonth(
        account: SavingsAccount,
        currentBalance: Decimal,
        month: number, // 1-12
        year: number
    ): SimulationResult {
        // Create date for 1st of month. Month in JS Date is 0-11, but input is 1-12.
        const startOfSimulationMonth = startOfMonth(new Date(year, month - 1, 1));
        const endOfSimulationMonth = endOfMonth(startOfSimulationMonth);

        let simulationDate = startOfSimulationMonth;

        // Fix: Use depositStartDate if available, otherwise createdAt
        const accountStartReference = account.type === 'deposit' && account.depositStartDate
            ? startOfDay(new Date(account.depositStartDate))
            : startOfDay(new Date(account.createdAt));

        // Start from 1st of month always to show full calendar
        // But interest is calculated only after account start

        // If simulation start is after end of month, return 0
        if (isAfter(simulationDate, endOfSimulationMonth)) {
            return {
                totalGross: new Decimal(0),
                totalTax: new Decimal(0),
                totalNet: new Decimal(0),
                projectedEndBalance: currentBalance,
                daysDetails: []
            };
        }

        let totalGross = new Decimal(0);
        let totalTax = new Decimal(0);
        let currentSimulatedBalance = currentBalance;

        const daysDetails = [];

        // Loop day by day
        while (isBefore(simulationDate, endOfSimulationMonth) || isSameDay(simulationDate, endOfSimulationMonth)) {
            let rate = account.interestRate || new Decimal(0);

            // Savings Account Logic: Only calculate if after account start
            if (isBefore(simulationDate, accountStartReference)) {
                rate = new Decimal(0);
            }

            // Deposit Specific Logic: Only calculate if within deposit period
            if (account.type === 'deposit' && account.depositStartDate) {
                const startDate = startOfDay(new Date(account.depositStartDate));
                const durationMonths = account.depositDurationMonths || 0;
                const endDate = endOfDay(addMonths(startDate, durationMonths));

                if (isBefore(simulationDate, startDate) || isAfter(simulationDate, endDate)) {
                    rate = new Decimal(0);
                }
            }

            // Promo Logic
            if (account.promoEndsAt && account.postPromoInterestRate) {
                const promoEnd = endOfDay(new Date(account.promoEndsAt));
                if (isAfter(simulationDate, promoEnd)) {
                    rate = account.postPromoInterestRate;
                }
            }

            const dailyGross = this.calculateDailyGain(currentSimulatedBalance, rate);
            const dailyTax = dailyGross.mul(this.BELKA_TAX_RATE);

            const roundedGross = new Decimal(dailyGross.toFixed(2, Decimal.ROUND_HALF_UP));
            const roundedTax = new Decimal(dailyTax.toFixed(2, Decimal.ROUND_HALF_UP));

            let dailyNet = new Decimal(0);

            if (account.capitalizationType === 'DAILY') {
                dailyNet = roundedGross.minus(roundedTax);

                totalGross = totalGross.add(roundedGross);
                totalTax = totalTax.add(roundedTax);

                currentSimulatedBalance = currentSimulatedBalance.add(dailyNet);

                daysDetails.push({
                    date: format(simulationDate, 'yyyy-MM-dd'),
                    gross: roundedGross.toNumber(),
                    tax: roundedTax.toNumber(),
                    net: dailyNet.toNumber(),
                    balance: currentSimulatedBalance.toNumber()
                });
            } else {
                // Non-Daily (MONTHLY): Show proportional daily tax for UX clarity
                // Tax is calculated daily but actually paid monthly at capitalization
                dailyNet = roundedGross.minus(roundedTax);

                totalGross = totalGross.add(roundedGross);
                totalTax = totalTax.add(roundedTax);

                daysDetails.push({
                    date: format(simulationDate, 'yyyy-MM-dd'),
                    gross: roundedGross.toNumber(),
                    tax: roundedTax.toNumber(),
                    net: dailyNet.toNumber(),
                    balance: currentSimulatedBalance.toNumber()
                });
            }

            simulationDate = addDays(simulationDate, 1);
        }

        // Calculate tax for non-daily at the end
        if (account.capitalizationType !== 'DAILY') {
            const tax = totalGross.mul(this.BELKA_TAX_RATE).toFixed(2, Decimal.ROUND_HALF_UP);
            totalTax = new Decimal(tax);
        }

        const totalNet = totalGross.minus(totalTax);
        const projectedEndBalance = currentBalance.add(totalNet);

        return {
            totalGross,
            totalTax,
            totalNet,
            projectedEndBalance,
            daysDetails
        };
    }
}
