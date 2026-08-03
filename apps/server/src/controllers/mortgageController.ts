import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { updateAccountBalance } from '../utils/balanceUpdater';
import { captureServerError } from '../lib/reportError';

// ============ MORTGAGES ============

export const getMortgages = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        // console.log(`[MORTGAGE] Fetching mortgages for user: ${userId}`);

        const mortgages = await prisma.mortgage.findMany({
            where: { userId },
            include: {
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                personalAccount: true
            },
            orderBy: { createdAt: 'desc' }
        });

        // console.log(`[MORTGAGE] Found ${mortgages.length} mortgages`);

        // Calculate stats for each mortgage
        const mortgagesWithStats = mortgages.map(mortgage => {
            const totalPaid = mortgage.payments.reduce((sum, p) => sum + Number(p.principalAmount), 0);
            const totalInterest = mortgage.payments.reduce((sum, p) => sum + Number(p.interestAmount), 0);
            const percentPaid = Number(mortgage.totalAmount) > 0
                ? ((Number(mortgage.totalAmount) - Number(mortgage.currentBalance)) / Number(mortgage.totalAmount)) * 100
                : 0;

            return {
                ...mortgage,
                totalPaid,
                totalInterest,
                percentPaid: Math.round(percentPaid * 100) / 100
            };
        });

        res.json(mortgagesWithStats);
    } catch (error: any) {
        console.error('[MORTGAGE] Błąd pobierania kredytów:', error?.message || error);
        console.error('[MORTGAGE] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        if (error?.stack) console.error('[MORTGAGE] Stack:', error.stack);
        captureServerError(error, req);
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error?.message : undefined });
    }
};

export const getMortgage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const mortgage = await prisma.mortgage.findFirst({
            where: { id, userId },
            include: {
                payments: {
                    orderBy: { paymentDate: 'desc' }
                },
                personalAccount: true
            }
        });

        if (!mortgage) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        const totalPaid = mortgage.payments.reduce((sum, p) => sum + Number(p.principalAmount), 0);
        const totalInterest = mortgage.payments.reduce((sum, p) => sum + Number(p.interestAmount), 0);
        const percentPaid = Number(mortgage.totalAmount) > 0
            ? ((Number(mortgage.totalAmount) - Number(mortgage.currentBalance)) / Number(mortgage.totalAmount)) * 100
            : 0;

        res.json({
            ...mortgage,
            totalPaid,
            totalInterest,
            percentPaid: Math.round(percentPaid * 100) / 100
        });
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania kredytu:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

const VALID_LOAN_TYPES = ['MORTGAGE', 'CASH', 'CAR', 'OTHER'];
const VALID_INSTALLMENT_TYPES = ['EQUAL', 'DECREASING'];

// Walidacja opcjonalnych pól kredytu; zwraca komunikat błędu albo null
const validateLoanFields = (body: any): string | null => {
    const { loanType, installmentType, termMonths, marginRate, referenceRate } = body;
    if (loanType !== undefined && !VALID_LOAN_TYPES.includes(loanType)) {
        return `Nieprawidłowy typ kredytu (dozwolone: ${VALID_LOAN_TYPES.join(', ')})`;
    }
    if (installmentType !== undefined && installmentType !== null && !VALID_INSTALLMENT_TYPES.includes(installmentType)) {
        return `Nieprawidłowy typ rat (dozwolone: ${VALID_INSTALLMENT_TYPES.join(', ')})`;
    }
    if (termMonths !== undefined && termMonths !== null && (!Number.isInteger(Number(termMonths)) || Number(termMonths) <= 0)) {
        return 'Okres kredytowania musi być dodatnią liczbą miesięcy';
    }
    for (const [field, label] of [['marginRate', 'Marża'], ['referenceRate', 'Stawka referencyjna']] as const) {
        const value = body[field];
        if (value !== undefined && value !== null && value !== '' && (isNaN(parseFloat(value)) || parseFloat(value) < 0)) {
            return `${label} musi być liczbą nieujemną`;
        }
    }
    return null;
};

// Normalizacja pól kredytu do zapisu w bazie (undefined = nie zmieniaj)
const parseLoanFields = (body: any) => ({
    loanType: body.loanType !== undefined ? body.loanType : undefined,
    installmentType: body.installmentType !== undefined ? (body.installmentType || null) : undefined,
    termMonths: body.termMonths !== undefined ? (body.termMonths === null || body.termMonths === '' ? null : parseInt(body.termMonths)) : undefined,
    marginRate: body.marginRate !== undefined ? (body.marginRate === null || body.marginRate === '' ? null : parseFloat(body.marginRate)) : undefined,
    referenceRate: body.referenceRate !== undefined ? (body.referenceRate === null || body.referenceRate === '' ? null : parseFloat(body.referenceRate)) : undefined,
});

export const createMortgage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name, totalAmount, currentBalance, startDate, personalAccountId } = req.body;

        if (!name || !totalAmount) {
            return res.status(400).json({ error: 'Nazwa i kwota całkowita są wymagane' });
        }

        const loanFieldsError = validateLoanFields(req.body);
        if (loanFieldsError) {
            return res.status(400).json({ error: loanFieldsError });
        }

        const mortgage = await prisma.mortgage.create({
            data: {
                userId,
                name,
                totalAmount: parseFloat(totalAmount),
                currentBalance: parseFloat(currentBalance ?? totalAmount),
                startDate: startDate ? new Date(startDate) : new Date(),
                personalAccountId,
                ...parseLoanFields(req.body)
            }
        });

        // console.log('Mortgage created:', mortgage);
        res.status(201).json(mortgage);
    } catch (error: any) {
        console.error('Błąd tworzenia kredytu:', error?.message || error);
        console.error('Stack:', error?.stack);
        captureServerError(error, req);
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error?.message : undefined });
    }
};

export const updateMortgage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { name, totalAmount, currentBalance, startDate, personalAccountId } = req.body;

        const existing = await prisma.mortgage.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        const loanFieldsError = validateLoanFields(req.body);
        if (loanFieldsError) {
            return res.status(400).json({ error: loanFieldsError });
        }

        const mortgage = await prisma.mortgage.update({
            where: { id },
            data: {
                name,
                totalAmount,
                currentBalance,
                startDate: startDate ? new Date(startDate) : undefined,
                personalAccountId,
                ...parseLoanFields(req.body)
            }
        });

        res.json(mortgage);
    } catch (error) {
        captureServerError(error, req, 'Błąd aktualizacji kredytu:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

export const deleteMortgage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const existing = await prisma.mortgage.findFirst({
            where: { id, userId }
        });

        if (!existing) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        await prisma.mortgage.delete({ where: { id } });
        res.json({ message: 'Kredyt usunięty' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania kredytu:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// ============ PAYMENTS ============

export const getPayments = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;

        const mortgage = await prisma.mortgage.findFirst({
            where: { id, userId }
        });

        if (!mortgage) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        const payments = await prisma.mortgagePayment.findMany({
            where: { mortgageId: id },
            orderBy: { paymentDate: 'desc' }
        });

        res.json(payments);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania rat:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Zaokrąglenie do groszy — kwoty w bazie to Decimal(19,4), ale operujemy na złotówkach
const roundGrosze = (value: number): number => Math.round(value * 100) / 100;

// Walidacja i normalizacja wejścia płatności kredytu.
// Zwraca komunikat błędu albo bezpieczne, znormalizowane kwoty.
// clamped=true, gdy część kapitałowa została przycięta do pozostałego salda (domknięcie kredytu).
type PaymentValidation =
    | { error: string }
    | { totalAmount: number; principalAmount: number; interestAmount: number; clamped: boolean };

const validateAndNormalizePayment = (body: any, currentBalance: number): PaymentValidation => {
    let total = Number(body.totalAmount);
    let principal = Number(body.principalAmount);

    if (!Number.isFinite(total) || !Number.isFinite(principal)) {
        return { error: 'Kwota raty i część kapitałowa są wymagane' };
    }
    if (total <= 0 || principal <= 0) {
        return { error: 'Kwoty muszą być dodatnie' };
    }
    if (principal > total) {
        return { error: 'Część kapitałowa nie może przekraczać kwoty raty' };
    }
    if (body.paymentDate) {
        const paymentDate = new Date(body.paymentDate);
        if (isNaN(paymentDate.getTime())) {
            return { error: 'Nieprawidłowa data płatności' };
        }
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        if (paymentDate.getTime() > endOfToday.getTime()) {
            return { error: 'Data płatności nie może być z przyszłości' };
        }
    }
    if (currentBalance <= 0) {
        return { error: 'Kredyt jest już spłacony' };
    }

    // Auto-przycięcie kapitału do pozostałego salda (nadpłata / ostatnia rata).
    // Nadwyżkę odejmujemy TAKŻE od kwoty raty, żeby odsetki (= rata − kapitał) się nie
    // zawyżyły: nadpłata ponad saldo → odsetki 0 (nie fantomowe), konto obciążone tylko
    // realnie spłaconą kwotą, nie wpisaną nadwyżką.
    let clamped = false;
    if (principal > currentBalance) {
        const clampedPrincipal = roundGrosze(currentBalance);
        total = roundGrosze(total - (principal - clampedPrincipal));
        principal = clampedPrincipal;
        clamped = true;
    }

    return {
        totalAmount: roundGrosze(total),
        principalAmount: principal,
        interestAmount: roundGrosze(total - principal),
        clamped
    };
};

export const createPayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id } = req.params;
        const { paymentDate, note } = req.body;

        const mortgage = await prisma.mortgage.findFirst({
            where: { id, userId }
        });

        if (!mortgage) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        const validated = validateAndNormalizePayment(req.body, Number(mortgage.currentBalance));
        if ('error' in validated) {
            return res.status(400).json({ error: validated.error });
        }
        const { totalAmount, principalAmount, interestAmount, clamped } = validated;

        // Create payment, update mortgage balance, and update account balance in a transaction
        const payment = await prisma.$transaction(async (tx) => {
            const created = await tx.mortgagePayment.create({
                data: {
                    mortgageId: id,
                    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                    totalAmount,
                    principalAmount,
                    interestAmount,
                    note
                }
            });

            await tx.mortgage.update({
                where: { id },
                data: {
                    currentBalance: {
                        decrement: principalAmount
                    }
                }
            });

            // Raty kredytów są w PLN — księgowanie z konwersją do waluty konta
            // i aktualizacją per-walutowego AccountBalance (jak zwykłe wydatki)
            if (mortgage.personalAccountId) {
                await updateAccountBalance(tx, {
                    personalAccountId: mortgage.personalAccountId,
                    amount: totalAmount,
                    currency: 'PLN',
                    type: 'expense',
                    date: paymentDate ? new Date(paymentDate) : new Date()
                });
            }

            return created;
        });

        res.status(201).json({ ...payment, clamped });
    } catch (error) {
        captureServerError(error, req, 'Błąd dodawania raty:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

export const deletePayment = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { id, paymentId } = req.params;

        const mortgage = await prisma.mortgage.findFirst({
            where: { id, userId }
        });

        if (!mortgage) {
            return res.status(404).json({ error: 'Kredyt nie znaleziony' });
        }

        const payment = await prisma.mortgagePayment.findFirst({
            where: { id: paymentId, mortgageId: id }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Rata nie znaleziona' });
        }

        // Delete payment, restore mortgage balance, and restore account balance in a transaction
        await prisma.$transaction(async (tx) => {
            await tx.mortgagePayment.delete({ where: { id: paymentId } });

            await tx.mortgage.update({
                where: { id },
                data: {
                    currentBalance: {
                        increment: payment.principalAmount
                    }
                }
            });

            // Odwrócenie księgowania raty (PLN) — lustro createPayment
            if (mortgage.personalAccountId) {
                await updateAccountBalance(tx, {
                    personalAccountId: mortgage.personalAccountId,
                    amount: payment.totalAmount,
                    currency: 'PLN',
                    type: 'income',
                    date: payment.paymentDate
                });
            }
        });

        res.json({ message: 'Rata usunięta' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania raty:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
