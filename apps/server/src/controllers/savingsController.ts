import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { runFinancialTransaction } from '../utils/financialTransaction';
import { validateSavingsAccountOwnership } from '../utils/ownershipValidator';
import { RealGainsService } from '../services/realGainsService';
import { CurrencyService, SUPPORTED_CURRENCIES } from '../services/currencyService';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateDepositInterest } from '../services/interestService';
import { getSavingsSummaryLogic } from '../services/savingsViewService';
import { addMonths } from 'date-fns';
import { parseClosedAt } from '../utils/closedAt';
import { captureServerError } from '../lib/reportError';

// Pobierz wszystkie konta oszczędnościowe użytkownika
export const getSavingsAccounts = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const accounts = await prisma.savingsAccount.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' }
        });

        // Optimization: Fetch all interest settlements for all user accounts in one go
        const allSettlements = await prisma.expense.findMany({
            where: {
                userId,
                type: 'interest',
                savingsAccountId: { in: accounts.map(a => a.id) }
            },
            select: {
                transactionDate: true,
                savingsAccountId: true
            }
        });

        // Group settlements by accountId for efficient access
        const settlementsByAccount: Record<string, Set<string>> = {};
        allSettlements.forEach(s => {
            if (!s.savingsAccountId) return;
            if (!settlementsByAccount[s.savingsAccountId]) {
                settlementsByAccount[s.savingsAccountId] = new Set();
            }
            const d = new Date(s.transactionDate);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            settlementsByAccount[s.savingsAccountId].add(monthStr);
        });

        const now = new Date();
        const limit = new Date(now.getFullYear(), now.getMonth(), 1);

        const accountsWithStatus = accounts.map(account => {
            if (account.type !== 'savings') return { ...account, hasUnsettledMonths: false, unsettledMonthsCount: 0 };

            const settledMonths = settlementsByAccount[account.id] || new Set();
            let iterator = new Date(account.createdAt);
            iterator = new Date(iterator.getFullYear(), iterator.getMonth(), 1);

            let unsettledMonthsCount = 0;
            // Iterate month by month up to current month (limit)
            while (iterator < limit) {
                const monthStr = `${iterator.getFullYear()}-${String(iterator.getMonth() + 1).padStart(2, '0')}`;
                if (!settledMonths.has(monthStr)) {
                    unsettledMonthsCount++;
                }
                iterator.setMonth(iterator.getMonth() + 1);
            }

            return {
                ...account,
                hasUnsettledMonths: unsettledMonthsCount > 0,
                unsettledMonthsCount
            };
        });

        res.json(accountsWithStatus);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania kont:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Pobierz konkretne konto oszczędnościowe
export const getSavingsAccountById = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const account = await prisma.savingsAccount.findUnique({
            where: { id }
        });

        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        res.json(account);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Utwórz nowe konto oszczędnościowe
export const createSavingsAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const {
            name,
            bank,
            type,
            balance,
            currency,
            interestRate,
            capitalizationType,
            promoEndsAt,
            postPromoInterestRate,
            depositStartDate,
            depositDurationMonths
        } = req.body;

        if (!name || !bank || !type) {
            return res.status(400).json({ error: 'Nazwa, bank i typ są wymagane' });
        }

        if (currency !== undefined && !SUPPORTED_CURRENCIES.includes(currency)) {
            return res.status(400).json({ error: 'Nieobsługiwana waluta' });
        }

        const parseNumeric = (val: any, isOptional = false) => {
            if (val === undefined || val === null || val === '') return isOptional ? null : NaN;
            const parsed = parseFloat(String(val).replace(',', '.'));
            return isNaN(parsed) ? (isOptional ? null : NaN) : parsed;
        };

        const numericBalance = parseNumeric(balance);
        const numericRate = parseNumeric(interestRate);
        const numericPostPromo = parseNumeric(postPromoInterestRate, true);

        if (isNaN(numericBalance as number) || isNaN(numericRate as number)) {
            return res.status(400).json({ error: 'Nieprawidłowy format kwoty lub oprocentowania' });
        }

        const account = await prisma.savingsAccount.create({
            data: {
                userId,
                name,
                bank,
                type,
                balance: numericBalance as number,
                currency: currency || 'PLN',
                interestRate: numericRate as number,
                capitalizationType: capitalizationType || 'DAILY',
                promoEndsAt: promoEndsAt ? new Date(promoEndsAt) : null,
                postPromoInterestRate: numericPostPromo,
                depositStartDate: depositStartDate ? new Date(depositStartDate) : null,
                depositDurationMonths: depositDurationMonths ? parseInt(String(depositDurationMonths)) : null,
                status: 'ACTIVE'
            }
        });

        res.status(201).json(account);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto oszczędnościowe o tej nazwie' });
        }
        captureServerError(error, req, 'Błąd tworzenia konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Aktualizuj konto oszczędnościowe
export const updateSavingsAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const {
            name,
            bank,
            type,
            balance,
            currency,
            interestRate,
            capitalizationType,
            promoEndsAt,
            postPromoInterestRate,
            depositStartDate,
            depositDurationMonths,
            status
        } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        // 🔐 SECURITY: Validate savings account ownership
        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        if (currency !== undefined) {
            if (!SUPPORTED_CURRENCIES.includes(currency)) {
                return res.status(400).json({ error: 'Nieobsługiwana waluta' });
            }
            const existing = await prisma.savingsAccount.findUnique({ where: { id } });
            if (existing && existing.currency !== currency) {
                const linkedTransfers = await prisma.expense.count({
                    where: { OR: [{ savingsAccountId: id }, { fromSavingsAccountId: id }] }
                });
                if (linkedTransfers > 0) {
                    return res.status(400).json({ error: 'Nie można zmienić waluty konta z historią transakcji' });
                }
            }
        }

        const parseNumeric = (val: any, isOptional = false) => {
            if (val === undefined) return undefined;
            if (val === null || val === '') return isOptional ? null : NaN;
            const parsed = parseFloat(String(val).replace(',', '.'));
            return isNaN(parsed) ? (isOptional ? null : NaN) : parsed;
        };

        const numericBalance = parseNumeric(balance);
        const numericRate = parseNumeric(interestRate);
        const numericPostPromo = parseNumeric(postPromoInterestRate, true);

        if ((numericBalance !== undefined && isNaN(numericBalance as number)) ||
            (numericRate !== undefined && isNaN(numericRate as number)) ||
            (numericPostPromo !== undefined && numericPostPromo !== null && isNaN(numericPostPromo as number))) {
            return res.status(400).json({ error: 'Nieprawidłowy format kwoty lub oprocentowania' });
        }

        const account = await prisma.savingsAccount.update({
            where: { id },
            data: {
                name,
                bank,
                type,
                balance: numericBalance !== undefined ? (numericBalance as number) : undefined,
                currency: currency !== undefined ? currency : undefined,
                interestRate: numericRate !== undefined ? (numericRate as number) : undefined,
                capitalizationType,
                promoEndsAt: promoEndsAt ? new Date(promoEndsAt) : (promoEndsAt === null ? null : undefined),
                postPromoInterestRate: numericPostPromo,
                depositStartDate: depositStartDate ? new Date(depositStartDate) : (depositStartDate === null ? null : undefined),
                depositDurationMonths: depositDurationMonths ? parseInt(String(depositDurationMonths)) : (depositDurationMonths === null ? null : undefined),
                status: status || undefined
            }
        });

        res.json(account);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto oszczędnościowe o tej nazwie' });
        }
        captureServerError(error, req, 'Błąd aktualizacji konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Rozlicz lokatę (Settlement)
export const settleDeposit = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { targetAccountId, finalInterest } = req.body;

        if (!targetAccountId) {
            return res.status(400).json({ error: 'Konto docelowe jest wymagane' });
        }

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do lokaty' });
        }

        const deposit = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!deposit || deposit.type !== 'deposit') {
            return res.status(404).json({ error: 'Lokata nie znaleziona' });
        }

        if (deposit.status === 'SETTLED') {
            return res.status(400).json({ error: 'Lokata została już rozliczona' });
        }

        const totalToTransfer = new Decimal(deposit.balance).add(new Decimal(finalInterest || 0));

        // Sprawdź czy konto docelowe to konto osobiste czy oszczędnościowe
        const personalAccount = await prisma.personalAccount.findFirst({
            where: { id: targetAccountId, userId }
        });

        const savingsAccount = await prisma.savingsAccount.findFirst({
            where: { id: targetAccountId, userId }
        });

        if (!personalAccount && !savingsAccount) {
            return res.status(404).json({ error: 'Konto docelowe nie zostało znalezione' });
        }

        // v1: rozliczenie tylko na konto w tej samej walucie co lokata
        const targetCurrency = personalAccount ? (personalAccount.currency || 'PLN') : (savingsAccount!.currency || 'PLN');
        if (targetCurrency !== (deposit.currency || 'PLN')) {
            return res.status(400).json({ error: 'Konto docelowe musi być w tej samej walucie co lokata' });
        }

        const settlementPlnAmount = (await CurrencyService.convertSafe(totalToTransfer, deposit.currency || 'PLN', 'PLN', new Date())).toDecimalPlaces(2);

        // Wykonaj settlement w transakcji
        await runFinancialTransaction(async (tx) => {
            // 1. Zwiększ saldo konta docelowego
            if (personalAccount) {
                await tx.personalAccount.update({
                    where: { id: targetAccountId },
                    data: { balance: { increment: totalToTransfer } }
                });

                // 2. Stwórz wpis o przychodzie
                await tx.expense.create({
                    data: {
                        userId,
                        amount: totalToTransfer,
                        currency: deposit.currency || 'PLN',
                        plnAmount: settlementPlnAmount,
                        type: 'income',
                        description: `Rozliczenie lokaty: ${deposit.name}`,
                        transactionDate: new Date(),
                        personalAccountId: targetAccountId,
                        categoryId: null
                    }
                });
            } else if (savingsAccount) {
                await tx.savingsAccount.update({
                    where: { id: targetAccountId },
                    data: { balance: { increment: totalToTransfer } }
                });

                // 2. Stwórz wpis o przychodzie (tym razem dla konta oszczędnościowego)
                await tx.expense.create({
                    data: {
                        userId,
                        amount: totalToTransfer,
                        currency: deposit.currency || 'PLN',
                        plnAmount: settlementPlnAmount,
                        type: 'income',
                        description: `Rozliczenie lokaty: ${deposit.name}`,
                        transactionDate: new Date(),
                        savingsAccountId: targetAccountId,
                        categoryId: null
                    }
                });
            }

            // 3. Zmień status i wyzeruj saldo lokaty
            await tx.savingsAccount.update({
                where: { id },
                data: {
                    status: 'SETTLED',
                    balance: 0
                }
            });
        });

        res.json({ message: 'Lokata została pomyślnie rozliczona' });
    } catch (error) {
        captureServerError(error, req, 'Błąd rozliczania lokaty:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Usuń konto oszczędnościowe
export const deleteSavingsAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        // 🔐 SECURITY: Validate savings account ownership
        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.savingsAccount.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        await prisma.savingsAccount.delete({ where: { id } });
        res.json({ message: 'Konto usunięte' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Zamknij (zarchiwizuj) konto oszczędnościowe — zachowujemy historię z datą zamknięcia
export const archiveSavingsAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        const parsed = parseClosedAt(req.body?.closedAt);
        if (!parsed.ok) {
            return res.status(400).json({ error: parsed.error });
        }

        const account = await prisma.savingsAccount.update({
            where: { id },
            data: { closedAt: parsed.date } as any
        });
        res.json(account);
    } catch (error) {
        captureServerError(error, req, 'Błąd zamykania konta oszczędnościowego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Przywróć (odarchiwizuj) konto oszczędnościowe
export const unarchiveSavingsAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        const account = await prisma.savingsAccount.update({
            where: { id },
            data: { closedAt: null } as any
        });
        res.json(account);
    } catch (error) {
        captureServerError(error, req, 'Błąd przywracania konta oszczędnościowego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Pobierz sumę wszystkich oszczędności
export const getSavingsSummary = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const summary = await getSavingsSummaryLogic(userId);
        res.json(summary);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania podsumowania:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// 🔮 Real Gains Forecast
export const getRealGainsForecast = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { month, year } = req.query;

        // console.log(`[Forecast] Req for acc ${id} by user ${userId}`);

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu' });
        }

        const account = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!account) return res.status(404).json({ error: 'Konto nie znalezione' });

        const currentMonth = month ? parseInt(month as string) : new Date().getMonth() + 1; // 1-12
        const currentYear = year ? parseInt(year as string) : new Date().getFullYear();

        const forecast = RealGainsService.simulateMonth(
            account,
            account.balance,
            currentMonth,
            currentYear
        );

        // Dodatkowe info dla lokat: Zysk od początku oraz całkowity przewidywany
        let totalAccrued = null;
        let totalExpected = null;

        if (account.type === 'deposit' && account.depositStartDate) {
            const start = new Date(account.depositStartDate);
            const now = new Date();
            const dailyGross = RealGainsService.calculateDailyGain(account.balance, account.interestRate || new Decimal(0));

            // 1. Zysk od początku do teraz
            const daysSinceStart = Math.max(0, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
            const accruedGross = dailyGross.mul(daysSinceStart);
            const accruedTax = accruedGross.mul(0.19).toFixed(2, Decimal.ROUND_HALF_UP);
            const accruedNet = accruedGross.minus(new Decimal(accruedTax));

            totalAccrued = {
                gross: accruedGross.toFixed(2),
                tax: accruedTax,
                net: accruedNet.toFixed(2),
                days: daysSinceStart
            };

            // 2. Zysk za cały okres trwania lokaty
            if (account.depositDurationMonths) {
                const end = addMonths(start, account.depositDurationMonths);
                const totalDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
                const expectedGross = dailyGross.mul(totalDays);
                const expectedTax = expectedGross.mul(0.19).toFixed(2, Decimal.ROUND_HALF_UP);
                const expectedNet = expectedGross.minus(new Decimal(expectedTax));

                totalExpected = {
                    gross: expectedGross.toFixed(2),
                    tax: expectedTax,
                    net: expectedNet.toFixed(2),
                    days: totalDays
                };
            }
        }

        res.json({
            ...forecast,
            totalAccrued,
            totalExpected,
            accountType: account.type
        });
    } catch (error) {
        captureServerError(error, req, 'Błąd obliczania prognozy:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Rozlicz odsetki miesięczne (Profit Settlement)
export const settleInterest = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { amount, date, note, markOnly } = req.body;

        // markOnly = użytkownik rozliczył odsetki ręcznie poza aplikacją —
        // oznaczamy miesiąc jako rozliczony BEZ zmiany salda (wpis-marker o kwocie 0).
        const isMarkOnly = markOnly === true;

        if (!isMarkOnly && (amount === undefined || amount === null || isNaN(parseFloat(amount)))) {
            return res.status(400).json({ error: 'Kwota odsetek jest wymagana' });
        }

        const settleAmount = isMarkOnly ? new Decimal(0) : new Decimal(amount);
        if (settleAmount.lessThan(0)) {
            return res.status(400).json({ error: 'Kwota odsetek nie może być ujemna' });
        }

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const settlementDate = date ? new Date(date) : new Date();
        const startOfMonth = new Date(settlementDate.getFullYear(), settlementDate.getMonth(), 1);
        const endOfMonth = new Date(settlementDate.getFullYear(), settlementDate.getMonth() + 1, 0);

        // Sprawdź czy już rozliczono w tym miesiącu
        const existingSettlement = await prisma.expense.findFirst({
            where: {
                userId,
                savingsAccountId: id,
                type: 'interest',
                transactionDate: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        if (existingSettlement) {
            return res.status(400).json({ error: 'Odsetki za ten miesiąc zostały już rozliczone.' });
        }

        const account = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!account) return res.status(404).json({ error: 'Konto nie znalezione' });

        const newBalance = new Decimal(account.balance).add(settleAmount);
        // Odsetki są w walucie konta
        const interestPlnAmount = (await CurrencyService.convertSafe(settleAmount, account.currency || 'PLN', 'PLN', settlementDate)).toDecimalPlaces(2);

        // Wykonaj w transakcji
        await runFinancialTransaction(async (tx) => {
            // 1. Zaktualizuj saldo konta (pomijamy dla trybu "tylko oznacz")
            if (!isMarkOnly) {
                await tx.savingsAccount.update({
                    where: { id },
                    data: { balance: newBalance }
                });
            }

            // 2. Dodaj wpis o transakcji (type: 'interest')
            await tx.expense.create({
                data: {
                    userId,
                    amount: settleAmount,
                    currency: account.currency || 'PLN',
                    plnAmount: interestPlnAmount,
                    type: 'interest', // Special type for interest settlements
                    description: isMarkOnly ? 'Odsetki rozliczone poza aplikacją' : 'Miesięczne odsetki',
                    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null,
                    transactionDate: settlementDate,
                    savingsAccountId: id,
                    categoryId: null
                }
            });
        });

        res.json({ message: isMarkOnly ? 'Miesiąc oznaczony jako rozliczony.' : 'Odsetki zostały dopisane pomyślnie.' });
    } catch (error) {
        captureServerError(error, req, 'Błąd rozliczania odsetek:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Status rozliczeń odsetek miesiąc po miesiącu (od założenia konta do bieżącego miesiąca)
export const getSettlements = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const isOwner = await validateSavingsAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const account = await prisma.savingsAccount.findUnique({ where: { id } });
        if (!account) return res.status(404).json({ error: 'Konto nie znalezione' });

        // Wszystkie wpisy odsetkowe dla tego konta (ten sam mechanizm co getSavingsAccounts)
        const settlements = await prisma.expense.findMany({
            where: { userId, savingsAccountId: id, type: 'interest' },
            select: { transactionDate: true, amount: true }
        });

        // Zsumuj kwoty per miesiąc (YYYY-MM)
        const byMonth: Record<string, Decimal> = {};
        settlements.forEach(s => {
            const d = new Date(s.transactionDate);
            const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            byMonth[monthStr] = (byMonth[monthStr] || new Decimal(0)).add(new Decimal(s.amount));
        });

        const now = new Date();
        const limit = new Date(now.getFullYear(), now.getMonth(), 1);
        let iterator = new Date(account.createdAt);
        iterator = new Date(iterator.getFullYear(), iterator.getMonth(), 1);

        const months: Array<{ month: string; status: 'settled' | 'pending'; amount: number | null; markedManually: boolean }> = [];
        while (iterator < limit) {
            const monthStr = `${iterator.getFullYear()}-${String(iterator.getMonth() + 1).padStart(2, '0')}`;
            const settled = byMonth[monthStr];
            if (settled) {
                const amt = settled.toNumber();
                // Kwota 0 = miesiąc oznaczony ręcznie jako rozliczony (bez zmiany salda)
                months.push({ month: monthStr, status: 'settled', amount: amt, markedManually: amt === 0 });
            } else {
                months.push({ month: monthStr, status: 'pending', amount: null, markedManually: false });
            }
            iterator.setMonth(iterator.getMonth() + 1);
        }

        // Najnowsze miesiące na górze
        months.reverse();

        res.json({ accountId: id, currency: account.currency || 'PLN', months });
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania statusu rozliczeń:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
