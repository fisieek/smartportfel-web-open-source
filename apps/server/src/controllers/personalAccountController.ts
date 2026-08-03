import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { validatePersonalAccountOwnership } from '../utils/ownershipValidator';
import { getHouseholdCoMemberIds } from '../utils/householdScope';
import { parseClosedAt } from '../utils/closedAt';
import { captureServerError } from '../lib/reportError';

// Pobierz wszystkie konta osobiste użytkownika
export const getPersonalAccounts = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        let accounts = await prisma.personalAccount.findMany({
            where: { userId },
            include: { balances: true } as any,
            orderBy: { createdAt: 'desc' }
        });

        // Self-healing: if no system account "Gotówka" exists, create it
        const hasCash = accounts.some(acc => acc.isSystem && acc.name === "Gotówka");
        if (!hasCash) {
            const cashAccount = await (prisma.personalAccount.create as any)({
                data: {
                    userId,
                    name: "Gotówka",
                    bank: "Portfel",
                    balance: 0,
                    isSystem: true,
                    isMain: accounts.length === 0,
                    isMultiCurrency: true, // System account "Gotówka" is now multi-currency
                    type: 'CASH',          // Set correct type
                    balances: {
                        create: {
                            currency: 'PLN',
                            balance: 0
                        }
                    }
                },
                include: { balances: true }
            });
            accounts.push(cashAccount as any);
        }

        // Wspólne konta współczłonków gospodarstwa (read + księgowanie; oznaczone do UI)
        const coMemberIds = await getHouseholdCoMemberIds(userId);
        if (coMemberIds.length > 0) {
            const sharedAccounts = await prisma.personalAccount.findMany({
                where: { userId: { in: coMemberIds }, isShared: true },
                include: { balances: true, user: { select: { username: true } } } as any,
                orderBy: { createdAt: 'desc' }
            });
            const sharedWithFlag = sharedAccounts.map(acc => ({
                ...acc,
                isSharedFromHousehold: true,
                ownerName: (acc as any).user?.username ?? null,
            }));
            accounts = [...accounts, ...(sharedWithFlag as any)];
        }

        res.json(accounts);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania kont osobistych:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Utwórz nowe konto osobiste
export const createPersonalAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, bank, balance, isMain, isSystem, isMultiCurrency, isShared, type, expiryDate, currency } = req.body;
        // console.log(`[Backend] Creating account for user ${userId}:`, { name, type, currency });

        if (!name) {
            return res.status(400).json({ error: 'Nazwa jest wymagana' });
        }

        // Sprawdź czy użytkownik ma już jakieś konta
        const existingAccounts = await prisma.personalAccount.findMany({
            where: { userId }
        });

        // Jeśli to pierwsze konto lub isMain jest true, ustaw jako główne
        const shouldBeMain = existingAccounts.length === 0 || isMain === true;

        // Jeśli nowe konto ma być główne, odznacz poprzednie główne
        if (shouldBeMain && existingAccounts.length > 0) {
            await prisma.personalAccount.updateMany({
                where: { userId, isMain: true },
                data: { isMain: false }
            });
        }

        // Default currency to PLN if not provided
        const accountCurrency = currency || 'PLN';

        const account = await (prisma.personalAccount.create as any)({
            data: {
                userId,
                name,
                bank,
                balance: balance || 0,
                isMain: shouldBeMain,
                isMultiCurrency: isMultiCurrency || false,
                isShared: isShared || false,
                type: (type && ['BANK', 'CASH', 'LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'].includes(type)) ? type : 'BANK',
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                currency: accountCurrency,
                balances: {
                    create: isMultiCurrency && req.body.balances && req.body.balances.length > 0
                        ? req.body.balances.map((b: any) => ({
                            currency: b.currency,
                            balance: b.balance
                        }))
                        : [{ currency: accountCurrency, balance: balance || 0 }]
                }
            },
            include: { balances: true }
        });

        res.status(201).json(account);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto o tej nazwie' });
        }
        captureServerError(error, req, 'Błąd tworzenia konta osobistego:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Aktualizuj konto osobiste
export const updatePersonalAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, bank, balance, isMain, isSystem, isMultiCurrency, isShared, type, expiryDate, currency, color } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        // 🔐 SECURITY: Validate personal account ownership
        const isOwner = await validatePersonalAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.personalAccount.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        // Jeśli ustawiamy to konto jako główne, odznacz poprzednie główne
        if (isMain === true) {
            await prisma.personalAccount.updateMany({
                where: { userId, isMain: true, id: { not: id } },
                data: { isMain: false }
            });
        }

        const updateData: any = {
            ...(name && { name }),
            bank: bank || existing.bank || '-',
            ...(balance !== undefined && { balance }),
            ...(isMain !== undefined && { isMain }),
            ...(isSystem !== undefined && { isSystem }),
            ...(isMultiCurrency !== undefined && { isMultiCurrency }),
            ...(isShared !== undefined && { isShared: Boolean(isShared) }),
            type: (type && ['BANK', 'CASH', 'LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER', 'INVESTMENT_WALLET', 'OTHER'].includes(type)) ? type : (existing.type || 'BANK'),
            ...(expiryDate !== undefined && { 
                expiryDate: (expiryDate && !isNaN(new Date(expiryDate).getTime())) ? new Date(expiryDate) : null 
            }), // Allow nullifying and prevent Invalid Date
            ...(currency && { currency }),
            color: color || (existing as any).color
        };

        const account = await prisma.personalAccount.update({
            where: { id },
            data: updateData,
            include: { balances: true }
        });

        // Sync balances if provided
        if (req.body.balances && Array.isArray(req.body.balances)) {
            for (const b of req.body.balances) {
                await (prisma as any).accountBalance.upsert({
                    where: {
                        personalAccountId_currency: {
                            personalAccountId: id,
                            currency: b.currency
                        }
                    },
                    update: { balance: b.balance },
                    create: {
                        personalAccountId: id,
                        currency: b.currency,
                        balance: b.balance
                    }
                });
            }

            // Remove balances not in the request if it's a multi-currency account
            if (isMultiCurrency) {
                const requestedCurrencies = req.body.balances.map((b: any) => b.currency);
                await (prisma as any).accountBalance.deleteMany({
                    where: {
                        personalAccountId: id,
                        currency: { notIn: requestedCurrencies }
                    }
                });
            }
        }

        // Final sync: update the main 'balance' field (PLN/Main Currency) if present in sub-balances
        // Assuming main balance field stores the value in 'currency' unit
        const currentCurrency = currency || account.currency || 'PLN';
        const finalBalances = await (prisma as any).accountBalance.findMany({
            where: { personalAccountId: id }
        });

        // Find balance for the account's logic currency
        const mainBalance = finalBalances.find((b: any) => b.currency === currentCurrency);

        if (mainBalance) {
            await prisma.personalAccount.update({
                where: { id },
                data: { balance: mainBalance.balance }
            });
        } else if (account.isMultiCurrency === false && balance !== undefined) {
            // If not multi-currency, ensure the balance entry matches main balance
            await (prisma as any).accountBalance.upsert({
                where: {
                    personalAccountId_currency: {
                        personalAccountId: id,
                        currency: currentCurrency
                    }
                },
                update: { balance: balance },
                create: {
                    personalAccountId: id,
                    currency: currentCurrency,
                    balance: balance
                }
            });
        }

        // Re-fetch final state after all balance sync operations
        const finalAccount = await prisma.personalAccount.findUnique({
            where: { id },
            include: { balances: true }
        });
        res.json(finalAccount ?? account);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'Masz już konto o tej nazwie' });
        }
        console.error('[BUG] Błąd aktualizacji konta osobistego:', {
            error: error.message,
            stack: error.stack,
            body: req.body,
            params: req.params
        });
        captureServerError(error, req);
        res.status(500).json({
            error: 'Błąd serwera',
            details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
            code: error.code // Prisma error code if available
        });
    }
};

// Usuń konto osobiste
export const deletePersonalAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        // 🔐 SECURITY: Validate personal account ownership
        const isOwner = await validatePersonalAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.personalAccount.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        if (existing.isSystem) {
            return res.status(403).json({ error: 'Nie można usunąć konta systemowego' });
        }

        await prisma.personalAccount.delete({ where: { id } });
        res.json({ message: 'Konto usunięte' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania konta osobistego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Zamknij (zarchiwizuj) konto osobiste — nie usuwamy, zachowujemy historię z datą zamknięcia
export const archivePersonalAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        const isOwner = await validatePersonalAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.personalAccount.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }
        if (existing.isSystem) {
            return res.status(403).json({ error: 'Nie można zamknąć konta systemowego' });
        }

        const parsed = parseClosedAt(req.body?.closedAt);
        if (!parsed.ok) {
            return res.status(400).json({ error: parsed.error });
        }

        const account = await prisma.personalAccount.update({
            where: { id },
            data: { closedAt: parsed.date } as any,
            include: { balances: true }
        });
        res.json(account);
    } catch (error) {
        captureServerError(error, req, 'Błąd zamykania konta osobistego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Przywróć (odarchiwizuj) konto osobiste
export const unarchivePersonalAccount = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        const { id } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Brak ID użytkownika' });
        }

        const isOwner = await validatePersonalAccountOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tego konta' });
        }

        const existing = await prisma.personalAccount.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Konto nie znalezione' });
        }

        const account = await prisma.personalAccount.update({
            where: { id },
            data: { closedAt: null } as any,
            include: { balances: true }
        });
        res.json(account);
    } catch (error) {
        captureServerError(error, req, 'Błąd przywracania konta osobistego:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Pobierz sumę wszystkich kont osobistych
export const getPersonalAccountsSummary = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const accounts = await prisma.personalAccount.findMany({
            where: { userId, closedAt: null } as any
        });

        // Filter out non-monetary accounts (Gift Cards, Loyalty, etc.)
        // Only sum up BANK and CASH accounts for "Total Liquidity"
        // Also ensure currency is PLN for summation
        const monetaryAccounts = accounts.filter((acc: any) =>
            (acc.type === 'BANK' || acc.type === 'CASH' || !acc.type) && // Default accounts usually null or BANK
            (acc.currency === 'PLN') // Only sum PLN accounts for now in the simple total
        );

        const total = monetaryAccounts.reduce((sum: number, acc: any) => sum + Number(acc.balance), 0);

        // Calculate Stats for Non-monetary if needed (optional return)
        const nonMonetaryAccounts = accounts.filter((acc: any) =>
            acc.type !== 'BANK' && acc.type !== 'CASH'
        );

        res.json({
            total,
            accountsCount: monetaryAccounts.length,
            nonMonetaryCount: nonMonetaryAccounts.length,
            // You might want to return separate totals per currency later
        });
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania podsumowania:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
