import { Request, Response } from 'express';
import { Prisma, Investment } from '@prisma/client';
import prisma from '../lib/prisma';
import { validateInvestmentAccountOwnership, validateInvestmentOwnership } from '../utils/ownershipValidator';
import { CurrencyService, RateMeta } from '../services/currencyService';
import { getQuote } from '../services/marketData';
import { getGoldPrice } from '../services/marketData/nbpGoldClient';
import { refreshPrices } from '../services/priceRefreshService';
import { getPositionsLogic, createInvestmentBusinessLogic, investmentAmountToAccountCurrency, getInvestmentHistoryLogic } from '../services/investmentViewService';
import { parsePastDate } from '../utils/closedAt';
import { runFinancialTransaction } from '../utils/financialTransaction';
import { captureServerError } from '../lib/reportError';


// Pobierz wszystkie inwestycje użytkownika
export const getInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { type, accountId } = req.query;

        const where: any = { userId, soldAt: null };

        if (type && type !== 'ALL') {
            where.type = String(type);
        }

        if (accountId && accountId !== 'ALL') {
            where.accountId = String(accountId);
        }

        const investments = await prisma.investment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: { account: true }
        });
        res.json(investments);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania inwestycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Utwórz nową inwestycję
export const createInvestment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const investment = await createInvestmentBusinessLogic(userId, req.body);
        res.status(201).json(investment);
    } catch (error: any) {
        console.error('Błąd tworzenia inwestycji:', error);
        res.status(400).json({ error: error.message || 'Błąd serwera' });
    }
};

// Masowe tworzenie inwestycji
export const bulkCreateInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { investments, accountId, isHistorical } = req.body;

        if (!investments || !Array.isArray(investments) || !accountId) {
            return res.status(400).json({ error: 'Lista inwestycji i konto są wymagane' });
        }

        // 🔐 Ownership + waluta konta + przewalutowany koszt PRZED transakcją.
        // Każda pozycja importu może mieć własną walutę i datę zakupu → konwersja per pozycja
        // na walutę konta (saldo w walucie konta nie może księgować kwot instrumentu 1:1).
        // Konwersja NBP nie może biec wewnątrz $transaction.
        const isOwner = await validateInvestmentAccountOwnership(accountId, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do konta inwestycyjnego' });
        }
        const accountForCurrency = await prisma.investmentAccount.findUnique({ where: { id: accountId } });
        if (!accountForCurrency) {
            return res.status(400).json({ error: 'Konto inwestycyjne nie istnieje' });
        }
        const accountCurrency = accountForCurrency.currency || 'PLN';

        let totalCostInAccountCurrency = 0;
        if (!isHistorical) {
            for (const inv of investments) {
                const qty = parseFloat(inv.quantity) || 1;
                const price = parseFloat(inv.purchasePrice);
                const opDate = inv.purchaseDate ? new Date(inv.purchaseDate) : new Date();
                totalCostInAccountCurrency += await investmentAmountToAccountCurrency(qty * price, inv.currency, accountCurrency, opDate);
            }
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Pobierz konto (atomowy odczyt salda pod walidację/decrement)
            const account = await tx.investmentAccount.findUnique({
                where: { id: accountId }
            });

            if (!account) {
                throw new Error('Konto inwestycyjne nie istnieje');
            }

            const preparedInvestments = investments.map(inv => {
                const qty = parseFloat(inv.quantity) || 1;
                const price = parseFloat(inv.purchasePrice);

                return {
                    ...inv,
                    quantity: qty,
                    purchasePrice: price,
                    currentValue: inv.currentValue ? parseFloat(inv.currentValue) : price
                };
            });

            // 2. Jeśli nie historyczne, sprawdź saldo (w walucie konta) i pobierz środki
            if (!isHistorical) {
                if (Number(account.balance) < totalCostInAccountCurrency) {
                    throw new Error(`Brak środków na koncie (${Number(account.balance).toFixed(2)} ${accountCurrency}). Wymagane: ${totalCostInAccountCurrency.toFixed(2)} ${accountCurrency}.`);
                }

                await tx.investmentAccount.update({
                    where: { id: accountId },
                    data: { balance: { decrement: totalCostInAccountCurrency } }
                });
            }

            // 3. Stwórz wszystkie pozycje i ich historię
            const createdInvestments = [];
            for (const inv of preparedInvestments) {
                const investment = await tx.investment.create({
                    data: {
                        userId,
                        accountId,
                        name: inv.name,
                        type: inv.type,
                        country: inv.country || 'PL',
                        currency: inv.currency || undefined, // domyślnie PLN (default modelu); USD/EUR z XTB/Revolut
                        bondDuration: inv.bondDuration ? parseInt(inv.bondDuration) : null,
                        bondInterestRate: inv.bondInterestRate ? parseFloat(inv.bondInterestRate) : null,
                        quantity: inv.quantity,
                        purchasePrice: inv.purchasePrice,
                        currentValue: inv.currentValue,
                        isHistorical: !!isHistorical,
                        purchaseDate: inv.purchaseDate ? new Date(inv.purchaseDate) : new Date()
                    }
                });

                await tx.investmentHistory.create({
                    data: {
                        investmentId: investment.id,
                        date: investment.purchaseDate,
                        quantity: investment.quantity,
                        purchasePrice: investment.purchasePrice,
                        marketValue: investment.currentValue
                    }
                });
                createdInvestments.push(investment);
            }

            return createdInvestments;
        });

        // Notowania live (best-effort, POZA transakcją — żeby zewnętrzne API nie blokowały DB).
        // Dla pozycji z symbolem: upsert instrumentu + link + bieżąca cena → currentValue.
        for (let i = 0; i < result.length; i++) {
            const src = investments[i] || {};
            const symbol = (src.symbol || '').toString().trim();
            if (!symbol) continue;
            try {
                const instrument = await prisma.instrument.upsert({
                    where: { symbol },
                    update: { name: src.name, type: src.type || 'STOCK', currency: src.currency || 'PLN', exchange: src.exchange || null },
                    create: { symbol, name: src.name, type: src.type || 'STOCK', currency: src.currency || 'PLN', exchange: src.exchange || null },
                });

                // Ufaj cenie rynkowej z pliku (np. XTB Market price): gdy currentValue ≠ cena zakupu,
                // nie nadpisuj notowaniem live (chroni przed złym dopasowaniem symbolu). Inaczej dociągnij.
                const created = result[i];
                const trustProvided = Number(created.currentValue) > 0 && Number(created.currentValue) !== Number(created.purchasePrice);
                let currentValue: number | null = null;
                if (!trustProvided) {
                    if (symbol.toUpperCase() === 'GOLD_NBP') {
                        currentValue = await getGoldPrice();
                    } else {
                        const quote = await getQuote(symbol);
                        currentValue = quote ? quote.close : null;
                    }
                }
                await prisma.investment.update({
                    where: { id: created.id },
                    data: { instrumentId: instrument.id, ...(currentValue != null ? { currentValue } : {}) },
                });
            } catch (e: any) {
                console.warn('[bulk invest] link/notowanie nieudane dla', symbol, e?.message);
            }
        }

        res.status(201).json(result);
    } catch (error: any) {
        console.error('Błąd masowego tworzenia inwestycji:', error);
        res.status(400).json({ error: error.message || 'Błąd serwera' });
    }
};

// Usuń wszystkie inwestycje z konkretnego konta
export const clearAccountInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { accountId } = req.params;
        const { type } = req.query;

        if (!accountId) {
            return res.status(400).json({ error: 'Brak ID konta' });
        }

        const whereClause: any = {
            userId,
            accountId
        };

        if (type) {
            whereClause.type = type;
        }

        const result = await prisma.investment.deleteMany({
            where: whereClause
        });

        res.json({ message: `Wyczyszczono ${type ? type : 'konto'}. Usunięto ${result.count} pozycji.`, count: result.count });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd czyszczenia konta:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Aktualizuj inwestycję
export const updateInvestment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, quantity, purchasePrice, currentValue, purchaseDate, accountId, type, country, bondDuration, bondInterestRate } = req.body;

        // 🔐 SECURITY: Validate investment ownership
        const isOwner = await validateInvestmentOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tej inwestycji' });
        }

        // 🔐 SECURITY: Validate new accountId if provided
        if (accountId) {
            const isAccOwner = await validateInvestmentAccountOwnership(accountId, userId);
            if (!isAccOwner) {
                return res.status(403).json({ error: 'Brak dostępu do konta inwestycyjnego' });
            }
        }

        const investment = await prisma.investment.update({
            where: { id },
            data: {
                name,
                quantity,
                purchasePrice,
                currentValue,
                accountId,
                type,
                country,
                bondDuration,
                bondInterestRate,
                isHistorical: req.body.isHistorical !== undefined ? !!req.body.isHistorical : undefined,
                purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined
            }
        });

        // Dodaj wpis do historii jeśli zmieniono kluczowe parametry
        if (currentValue !== undefined || quantity !== undefined || purchasePrice !== undefined) {
            await prisma.investmentHistory.create({
                data: {
                    investmentId: id,
                    date: new Date(),
                    quantity: investment.quantity,
                    purchasePrice: investment.purchasePrice,
                    marketValue: investment.currentValue
                }
            });
        }

        res.json(investment);
    } catch (error) {
        captureServerError(error, req, 'Błąd aktualizacji inwestycji:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Refund kupna (koszt pozycji) przewalutowany na walutę konta po kursie z daty zakupu —
// lustro `decrement` z kupna. Liczony PRZED transakcją (konwersja NBP poza $transaction).
// Zwraca 0 dla pozycji bez ruchu gotówki (bez konta / historyczna / już sprzedana).
const computeInvestmentRefund = async (inv: Investment): Promise<number> => {
    if (!inv.accountId || inv.isHistorical || inv.soldAt) return 0;
    const account = await prisma.investmentAccount.findUnique({ where: { id: inv.accountId } });
    const accountCurrency = account?.currency || 'PLN';
    const native = Number(inv.purchasePrice) * Number(inv.quantity);
    return investmentAmountToAccountCurrency(native, inv.currency, accountCurrency, new Date(inv.purchaseDate));
};

// Usuwa pojedynczą inwestycję wewnątrz transakcji: zwraca środki na konto (gdy przypisane,
// nie historyczne i nie sprzedane — sprzedaż już rozliczyła gotówkę) + kasuje historię i rekord.
// `refundInAccountCurrency` policzony przez `computeInvestmentRefund` przed transakcją.
const deleteInvestmentTx = async (tx: Prisma.TransactionClient, inv: Investment, refundInAccountCurrency: number) => {
    if (inv.accountId && !inv.isHistorical && !inv.soldAt) {
        await tx.investmentAccount.update({
            where: { id: inv.accountId },
            data: { balance: { increment: refundInAccountCurrency } }
        });
    }
    await tx.investmentHistory.deleteMany({ where: { investmentId: inv.id } });
    await tx.investment.delete({ where: { id: inv.id } });
};

// Usuń inwestycję i zwróć środki na konto inwestycyjne
export const deleteInvestment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        // 🔐 SECURITY: Validate investment ownership
        const isOwner = await validateInvestmentOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tej inwestycji' });
        }

        const existing = await prisma.investment.findUnique({
            where: { id }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Inwestycja nie znaleziona' });
        }

        // Refund w walucie konta liczony przed transakcją (konwersja NBP poza $transaction)
        const refund = await computeInvestmentRefund(existing);

        // Wykonaj jako transakcję: zwróć środki i usuń inwestycję
        await prisma.$transaction(async (tx) => {
            await deleteInvestmentTx(tx, existing, refund);
        });

        res.json({ message: 'Inwestycja usunięta, środki zwrócone na konto' });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd usuwania inwestycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Hurtowe usuwanie pozycji — atomowo (wszystko albo nic), z walidacją własności i zwrotem środków
export const bulkDeleteInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Brak pozycji do usunięcia' });
        }
        const uniqueIds = [...new Set(ids.map((x: any) => String(x)))];

        // Pobierz tylko pozycje należące do użytkownika — jeśli liczba się nie zgadza, ktoś podał cudze/nieistniejące id
        const investments = await prisma.investment.findMany({ where: { id: { in: uniqueIds }, userId } });
        if (investments.length !== uniqueIds.length) {
            return res.status(403).json({ error: 'Brak dostępu do części pozycji' });
        }

        // Refundy w walucie konta liczone przed transakcją (konwersja NBP poza transakcją)
        const refunds = new Map<string, number>();
        for (const inv of investments) {
            refunds.set(inv.id, await computeInvestmentRefund(inv));
        }

        await runFinancialTransaction(async (tx) => {
            for (const inv of investments) {
                await deleteInvestmentTx(tx, inv, refunds.get(inv.id) ?? 0);
            }
        });

        res.json({ message: `Usunięto ${investments.length} ${investments.length === 1 ? 'pozycję' : 'pozycje'}`, deleted: investments.length });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd hurtowego usuwania inwestycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Sprzedaj pozycję (lot) — częściowo lub w całości; rozlicza zrealizowany zysk/stratę
export const sellInvestment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const isOwner = await validateInvestmentOwnership(id, userId);
        if (!isOwner) {
            return res.status(403).json({ error: 'Brak dostępu do tej inwestycji' });
        }

        const existing = await prisma.investment.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ error: 'Inwestycja nie znaleziona' });
        }
        if (existing.soldAt) {
            return res.status(400).json({ error: 'Ta pozycja jest już sprzedana' });
        }

        const salePrice = parseFloat(String(req.body?.salePrice));
        if (isNaN(salePrice) || salePrice < 0) {
            return res.status(400).json({ error: 'Nieprawidłowa cena sprzedaży' });
        }

        const lotQty = Number(existing.quantity);
        const requestedQty = req.body?.quantity === undefined ? lotQty : parseFloat(String(req.body.quantity));
        if (isNaN(requestedQty) || requestedQty <= 0) {
            return res.status(400).json({ error: 'Nieprawidłowa ilość' });
        }
        if (requestedQty > lotQty + 1e-9) {
            return res.status(400).json({ error: `Nie możesz sprzedać więcej niż posiadasz (${lotQty})` });
        }

        const parsedDate = parsePastDate(req.body?.saleDate, 'Data sprzedaży');
        if (!parsedDate.ok) {
            return res.status(400).json({ error: parsedDate.error });
        }
        const saleDate = parsedDate.date;

        const proceeds = requestedQty * salePrice;

        // Przychód w walucie konta (cena sprzedaży jest w walucie instrumentu) — liczony
        // PRZED transakcją, bo konwersja NBP nie może biec w środku runFinancialTransaction.
        let proceedsInAccountCurrency = proceeds;
        if (existing.accountId && !existing.isHistorical) {
            const account = await prisma.investmentAccount.findUnique({ where: { id: existing.accountId } });
            const accountCurrency = account?.currency || 'PLN';
            proceedsInAccountCurrency = await investmentAmountToAccountCurrency(proceeds, existing.currency, accountCurrency, saleDate);
        }

        const result = await runFinancialTransaction(async (tx) => {
            // Atomowy re-read — guard przeciw równoległej/podwójnej sprzedaży (Serializable + retry P2034)
            const current = await tx.investment.findUnique({ where: { id } });
            if (!current) throw new Error('SELL_NOT_FOUND');
            if (current.soldAt) throw new Error('SELL_ALREADY_SOLD');

            const currentQty = Number(current.quantity);
            if (requestedQty > currentQty + 1e-9) throw new Error('SELL_INSUFFICIENT_QTY');
            const fullSale = requestedQty >= currentQty - 1e-9;

            // Przychód wraca na saldo konta (lustro zakupu); wpisy historyczne bez ruchu gotówki
            if (current.accountId && !current.isHistorical) {
                await tx.investmentAccount.update({
                    where: { id: current.accountId },
                    data: { balance: { increment: proceedsInAccountCurrency } }
                });
            }

            if (fullSale) {
                return tx.investment.update({
                    where: { id },
                    data: { soldAt: saleDate, salePrice, currentValue: salePrice } as any
                });
            }

            // Sprzedaż częściowa: zmniejsz oryginalny lot i utwórz osobny rekord sprzedany
            await tx.investment.update({
                where: { id },
                data: { quantity: currentQty - requestedQty }
            });
            return tx.investment.create({
                data: {
                    userId,
                    accountId: current.accountId,
                    name: current.name,
                    type: current.type,
                    country: current.country,
                    currency: current.currency,
                    instrumentId: current.instrumentId,
                    bondDuration: current.bondDuration,
                    bondInterestRate: current.bondInterestRate,
                    isHistorical: current.isHistorical,
                    quantity: requestedQty,
                    purchasePrice: current.purchasePrice,
                    purchaseDate: current.purchaseDate,
                    currentValue: salePrice,
                    soldAt: saleDate,
                    salePrice
                } as any
            });
        });

        res.json(result);
    } catch (error: any) {
        if (error?.message === 'SELL_ALREADY_SOLD') {
            return res.status(409).json({ error: 'Ta pozycja jest już sprzedana' });
        }
        if (error?.message === 'SELL_INSUFFICIENT_QTY') {
            return res.status(400).json({ error: 'Nie możesz sprzedać więcej niż posiadasz' });
        }
        if (error?.message === 'SELL_NOT_FOUND') {
            return res.status(404).json({ error: 'Inwestycja nie znaleziona' });
        }
        if (typeof error?.message === 'string' && error.message.toLowerCase().includes('kurs')) {
            return res.status(400).json({ error: error.message });
        }
        captureServerError(error, req, 'Błąd sprzedaży inwestycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Lista sprzedanych pozycji z policzonym zrealizowanym zyskiem/stratą (PLN)
export const getSoldInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const sold = await prisma.investment.findMany({
            where: { userId, soldAt: { not: null } } as any,
            include: { account: true, instrument: true },
            orderBy: { soldAt: 'desc' }
        });

        // Kursy NBP memoizowane: koszt po kursie z dnia zakupu, przychód po kursie z dnia sprzedaży
        // Kurs przez wspólny helper: przy awarii NBP kurs z cache DB, nie ciche 1:1 (bug I2).
        const rateCache = new Map<string, RateMeta>();
        const rateToPln = async (currency: string, date: Date): Promise<number> =>
            (await CurrencyService.rateToPlnWithMeta(currency, date, rateCache)).rate;

        const round = (n: number) => Number(n.toFixed(2));
        let totalRealizedPLN = 0;
        const positions = [];
        for (const inv of sold) {
            const qty = Number(inv.quantity);
            const purchasePrice = Number(inv.purchasePrice);
            const salePrice = Number(inv.salePrice ?? 0);
            const currency = inv.currency || 'PLN';
            const costRate = await rateToPln(currency, new Date(inv.purchaseDate));
            const saleRate = await rateToPln(currency, new Date((inv as any).soldAt));
            const costPLN = qty * purchasePrice * costRate;
            const proceedsPLN = qty * salePrice * saleRate;
            const realizedPLN = proceedsPLN - costPLN;
            const realizedPct = costPLN > 0 ? (realizedPLN / costPLN) * 100 : 0;
            totalRealizedPLN += realizedPLN;
            positions.push({
                id: inv.id,
                name: inv.instrument?.name || inv.name,
                type: inv.type || 'OTHER',
                currency,
                quantity: qty,
                purchasePrice,
                salePrice,
                purchaseDate: new Date(inv.purchaseDate).toISOString().slice(0, 10),
                soldAt: new Date((inv as any).soldAt).toISOString().slice(0, 10),
                accountName: inv.account?.name ?? null,
                realizedPLN: round(realizedPLN),
                realizedPct: round(realizedPct)
            });
        }

        res.json({ positions, totalRealizedPLN: round(totalRealizedPLN) });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania sprzedanych pozycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Pobierz podsumowanie portfela
export const getInvestmentsSummary = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const investments = await prisma.investment.findMany({
            where: { userId, soldAt: null } as any
        });

        const totalValue = investments.reduce((sum, inv) =>
            sum + (Number(inv.currentValue) * Number(inv.quantity)), 0);
        const totalCost = investments.reduce((sum, inv) =>
            sum + (Number(inv.purchasePrice) * Number(inv.quantity)), 0);
        const changePercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

        res.json({
            totalValue,
            totalCost,
            changePercent,
            investmentsCount: investments.length
        });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania podsumowania:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

// Masowa aktualizacja cen rynkowych
export const bulkUpdateInvestments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { updates } = req.body; // Array of { id: string, marketValue: number }

        if (!updates || !Array.isArray(updates)) {
            return res.status(400).json({ error: 'Brak danych do aktualizacji' });
        }

        const now = new Date();

        await prisma.$transaction(async (tx) => {
            for (const update of updates) {
                const investment = await tx.investment.findFirst({
                    where: { id: update.id, userId }
                });

                if (investment) {
                    // Aktualizuj obecną wartość
                    await tx.investment.update({
                        where: { id: update.id },
                        data: { currentValue: update.marketValue }
                    });

                    // Dodaj wpis do historii
                    await tx.investmentHistory.create({
                        data: {
                            investmentId: update.id,
                            date: now,
                            quantity: investment.quantity,
                            purchasePrice: investment.purchasePrice,
                            marketValue: update.marketValue
                        }
                    });
                }
            }
        });

        res.json({ message: 'Zaktualizowano pomyślnie' });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd masowej aktualizacji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

export const getInvestmentHistory = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.userId;
        if (!userId) return res.status(401).json({ error: 'Nieautoryzowany' });

        const result = await getInvestmentHistoryLogic(userId);
        res.json(result);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania historii portfela:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

/**
 * GET /api/investments/positions
 * Zagregowane POZYCJE per aktywo (scalone ponad kontami), przeliczone na PLN przez NBP.
 * Odpowiada na pytanie „ile finalnie zainwestowałem w złoto": łączna ilość, średnia cena,
 * wartość bieżąca, P/L (PLN + %), udział w portfelu oraz sparkline trendu wartości.
 */
export const getPositions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { type, accountId } = req.query;
        const result = await getPositionsLogic(userId, {
            type: type as string | undefined,
            accountId: accountId as string | undefined,
        });
        res.json(result);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania pozycji:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

/**
 * POST /api/investments/refresh-prices
 * Ręczne odświeżenie wartości rynkowej pozycji użytkownika (dostawca notowań / NBP). Bez zapisu historii
 * (recordHistory=false) — żeby wielokrotne kliknięcia nie zaśmiecały timeline'u; dzienny cron
 * dopisuje punkty trendu. Aktualizuje samo `currentValue`.
 */
export const refreshInvestmentPrices = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const result = await refreshPrices({ userId, recordHistory: false });
        res.json(result);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd odświeżania cen:');
        res.status(500).json({ error: 'Nie udało się odświeżyć cen' });
    }
};
