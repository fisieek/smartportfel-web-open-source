import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { runFinancialTransaction } from '../utils/financialTransaction';
import { getContributionLimit, type RetirementAccountType } from '../services/ikeIkzeLimits';
import { parseClosedAt } from '../utils/closedAt';
import { captureServerError } from '../lib/reportError';

const VALID_ACCOUNT_TYPES = ['STANDARD', 'IKE', 'IKZE'];

// Pobierz wszystkie konta inwestycyjne użytkownika
export const getInvestmentAccounts = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const accounts = await prisma.investmentAccount.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });
        res.json(accounts);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania kont inwestycyjnych:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Dodaj nowe konto inwestycyjne
export const createInvestmentAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, provider, balance, currency, accountType, ikzeBusiness } = req.body;

        if (!name || !provider) {
            return res.status(400).json({ error: 'Nazwa i dostawca są wymagani' });
        }

        // Validate currency if provided
        const validCurrencies = ['PLN', 'USD', 'EUR', 'GBP', 'CHF'];
        const accountCurrency = currency?.toUpperCase() || 'PLN';
        if (!validCurrencies.includes(accountCurrency)) {
            return res.status(400).json({
                error: `Nieprawidłowa waluta. Dozwolone: ${validCurrencies.join(', ')}`
            });
        }

        // Validate account type (STANDARD / IKE / IKZE)
        const type = (accountType || 'STANDARD').toUpperCase();
        if (!VALID_ACCOUNT_TYPES.includes(type)) {
            return res.status(400).json({
                error: `Nieprawidłowy typ konta. Dozwolone: ${VALID_ACCOUNT_TYPES.join(', ')}`
            });
        }

        const account = await prisma.investmentAccount.create({
            data: {
                userId,
                name,
                provider,
                balance: balance ? parseFloat(balance) : 0,
                currency: accountCurrency,
                accountType: type,
                ikzeBusiness: type === 'IKZE' ? Boolean(ikzeBusiness) : false
            }
        });

        res.status(201).json(account);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto inwestycyjne o tej nazwie' });
        }
        captureServerError(error, req, 'Błąd tworzenia konta inwestycyjnego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Transfer środków: Konto Osobiste -> Konto Inwestycyjne
export const transferToInvestmentAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { personalAccountId, investmentAccountId, amount, date } = req.body;

        if (!personalAccountId || !investmentAccountId || !amount) {
            return res.status(400).json({ error: 'Wszystkie dane są wymagane' });
        }

        const numericAmount = parseFloat(amount);

        // Wykonaj jako transakcję
        const result = await runFinancialTransaction(async (tx) => {
            // 1. Sprawdź i odejmij od konta osobistego
            const personalAccount = await tx.personalAccount.findFirst({
                where: { id: personalAccountId, userId }
            });

            if (!personalAccount || Number(personalAccount.balance) < numericAmount) {
                throw new Error('Niewystarczające środki na koncie osobistym');
            }

            await tx.personalAccount.update({
                where: { id: personalAccountId },
                data: { balance: { decrement: numericAmount } }
            });

            // 2. Dodaj do konta inwestycyjnego
            const investmentAccount = await tx.investmentAccount.findFirst({
                where: { id: investmentAccountId, userId }
            });

            if (!investmentAccount) {
                throw new Error('Konto inwestycyjne nie istnieje');
            }

            const updatedInvAccount = await tx.investmentAccount.update({
                where: { id: investmentAccountId },
                data: { balance: { increment: numericAmount } }
            });

            // 3. Zapis rekordu transferu (internal_transfer) dla historii i liczenia wpłat IKE/IKZE.
            // Salda zaktualizowano ręcznie powyżej — tu tylko czysty insert, bez ponownego księgowania.
            const transferCategory = await tx.category.findFirst({
                where: { name: 'Przelew wewnętrzny', userId: null }
            });
            await tx.expense.create({
                data: {
                    type: 'internal_transfer',
                    amount: numericAmount,
                    currency: personalAccount.currency || 'PLN',
                    description: 'Wpłata na konto inwestycyjne',
                    categoryId: transferCategory?.id ?? null,
                    transactionDate: date ? new Date(date) : new Date(),
                    userId,
                    personalAccountId,
                    investmentAccountId
                }
            });

            return updatedInvAccount;
        });

        res.json(result);
    } catch (error: any) {
        console.error('Błąd transferu:', error);
        res.status(400).json({ error: error.message || 'Błąd transferu' });
    }
};

// Usuń konto inwestycyjne (tylko jeśli puste lub po potwierdzeniu)
export const deleteInvestmentAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const account = await prisma.investmentAccount.findFirst({
            where: { id, userId },
            include: { _count: { select: { investments: true } } }
        });

        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        if (account._count.investments > 0) {
            return res.status(400).json({ error: 'Nie można usunąć konta, które posiada przypisane inwestycje' });
        }

        await prisma.investmentAccount.delete({ where: { id } });
        res.json({ message: 'Konto usunięte' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Zamknij (zarchiwizuj) konto inwestycyjne — w przeciwieństwie do usuwania, dozwolone także z przypisanymi inwestycjami
export const archiveInvestmentAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const account = await prisma.investmentAccount.findFirst({ where: { id, userId } });
        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        const parsed = parseClosedAt(req.body?.closedAt);
        if (!parsed.ok) {
            return res.status(400).json({ error: parsed.error });
        }

        const updated = await prisma.investmentAccount.update({
            where: { id },
            data: { closedAt: parsed.date } as any
        });
        res.json(updated);
    } catch (error) {
        captureServerError(error, req, 'Błąd zamykania konta inwestycyjnego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Przywróć (odarchiwizuj) konto inwestycyjne
export const unarchiveInvestmentAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const account = await prisma.investmentAccount.findFirst({ where: { id, userId } });
        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        const updated = await prisma.investmentAccount.update({
            where: { id },
            data: { closedAt: null } as any
        });
        res.json(updated);
    } catch (error) {
        captureServerError(error, req, 'Błąd przywracania konta inwestycyjnego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Aktualizuj konto inwestycyjne (nazwa i/lub saldo)
export const updateInvestmentAccountBalance = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { balance, name } = req.body;

        // Sprawdź czy podano przynajmniej jedno pole do aktualizacji
        if (balance === undefined && name === undefined) {
            return res.status(400).json({ error: 'Podaj nazwę lub saldo do aktualizacji' });
        }

        const account = await prisma.investmentAccount.findFirst({
            where: { id, userId }
        });

        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        // Przygotuj dane do aktualizacji
        const { accountType, ikzeBusiness } = req.body;
        const updateData: any = {};
        if (balance !== undefined) {
            if (isNaN(parseFloat(balance))) {
                return res.status(400).json({ error: 'Nieprawidłowa wartość salda' });
            }
            updateData.balance = parseFloat(balance);
        }
        if (name !== undefined) {
            if (!name.trim()) {
                return res.status(400).json({ error: 'Nazwa nie może być pusta' });
            }
            updateData.name = name.trim();
        }
        if (accountType !== undefined) {
            const type = String(accountType).toUpperCase();
            if (!VALID_ACCOUNT_TYPES.includes(type)) {
                return res.status(400).json({ error: `Nieprawidłowy typ konta. Dozwolone: ${VALID_ACCOUNT_TYPES.join(', ')}` });
            }
            updateData.accountType = type;
            updateData.ikzeBusiness = type === 'IKZE' ? Boolean(ikzeBusiness) : false;
        } else if (ikzeBusiness !== undefined) {
            updateData.ikzeBusiness = Boolean(ikzeBusiness);
        }

        const updated = await prisma.investmentAccount.update({
            where: { id },
            data: updateData
        });

        res.json(updated);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto inwestycyjne o tej nazwie' });
        }
        captureServerError(error, req, 'Błąd aktualizacji konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Wpłaty w roku kalendarzowym na konto IKE/IKZE + limit i wykorzystanie
export const getInvestmentAccountContributions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const year = req.query.year ? parseInt(req.query.year as string, 10) : new Date().getFullYear();

        if (isNaN(year) || year < 2000 || year > 2100) {
            return res.status(400).json({ error: 'Nieprawidłowy rok' });
        }

        const account = await prisma.investmentAccount.findFirst({ where: { id, userId } });
        if (!account) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        if (account.accountType !== 'IKE' && account.accountType !== 'IKZE') {
            return res.status(400).json({ error: 'Konto nie jest kontem emerytalnym (IKE/IKZE)' });
        }

        const yearStart = new Date(Date.UTC(year, 0, 1));
        const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

        // Wpłaty = transfery wewnętrzne, gdzie konto inwestycyjne jest stroną docelową
        // (źródłem jest konto osobiste/oszczędnościowe, brak innej strony docelowej).
        const agg = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                userId,
                type: 'internal_transfer',
                investmentAccountId: id,
                toPersonalAccountId: null,
                savingsAccountId: null,
                transactionDate: { gte: yearStart, lt: yearEnd }
            }
        });

        const contributed = Number(agg._sum.amount ?? 0);
        const limit = getContributionLimit(account.accountType as RetirementAccountType, year, account.ikzeBusiness);
        const remaining = Math.max(0, limit - contributed);
        const percentUsed = limit > 0 ? Math.min(100, (contributed / limit) * 100) : 0;

        res.json({
            accountType: account.accountType,
            ikzeBusiness: account.ikzeBusiness,
            year,
            contributed: Math.round(contributed * 100) / 100,
            limit,
            remaining: Math.round(remaining * 100) / 100,
            percentUsed: Math.round(percentUsed * 10) / 10
        });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania wpłat IKE/IKZE:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
