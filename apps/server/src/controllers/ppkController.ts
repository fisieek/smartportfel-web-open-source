import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { calculatePPK } from '../utils/ppkCalculator';
import { reconcilePPKBonuses } from '../services/ppkBonusService';
import { startOfMonth, endOfMonth, addMonths, differenceInMonths, format } from 'date-fns';
import { captureServerError } from '../lib/reportError';

export const setupPPK = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const {
            grossSalary,
            startDate,
            employeeRate,
            employerRate,
            hasHistoryToImport
        } = req.body;

        if (!grossSalary || !startDate) {
            return res.status(400).json({ error: 'Wynagrodzenie brutto i data rozpoczęcia są wymagane' });
        }

        const start = new Date(startDate);
        const now = new Date();

        // 1. Create or update config
        const pPKConfig = await prisma.pPKConfig.upsert({
            where: { userId },
            update: {
                grossSalary: parseFloat(grossSalary),
                employeeRate: parseFloat(employeeRate) || 2.0,
                employerRate: parseFloat(employerRate) || 1.5,
                startDate: start,
                active: true
            },
            create: {
                userId,
                grossSalary: parseFloat(grossSalary),
                employeeRate: parseFloat(employeeRate) || 2.0,
                employerRate: parseFloat(employerRate) || 1.5,
                startDate: start,
                active: true
            }
        });

        // 2. If no manual history import, calculate automatically
        if (!hasHistoryToImport) {
            // Clear existing transactions first to avoid duplicates on re-setup
            await prisma.pPKTransaction.deleteMany({ where: { userId } });

            const transactions = [];
            let current = startOfMonth(start);
            const today = startOfMonth(now);

            let annualGross = 0;
            let lastYear = current.getFullYear();

            while (current <= today) {
                // Reset annual gross on new year
                if (current.getFullYear() !== lastYear) {
                    annualGross = 0;
                    lastYear = current.getFullYear();
                }

                const { employeeContribution, employerContribution, employerTax } = calculatePPK(
                    parseFloat(grossSalary),
                    parseFloat(employeeRate) || 2.0,
                    parseFloat(employerRate) || 1.5,
                    annualGross
                );

                // Add employee contribution
                transactions.push({
                    userId,
                    date: current,
                    type: 'EMPLOYEE',
                    amount: employeeContribution,
                    grossSalary: parseFloat(grossSalary),
                });

                // Add employer contribution
                transactions.push({
                    userId,
                    date: current,
                    type: 'EMPLOYER',
                    amount: employerContribution,
                    grossSalary: parseFloat(grossSalary),
                    taxAmount: employerTax
                });

                annualGross += parseFloat(grossSalary);
                current = addMonths(current, 1);
            }

            await prisma.pPKTransaction.createMany({
                data: transactions
            });

            // Dotacje państwowe (premia powitalna + dopłaty roczne) — po wpłatach bazowych.
            await reconcilePPKBonuses(userId);
        }

        res.status(201).json(pPKConfig);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd setup PPK:');
        res.status(500).json({ error: 'Błąd serwera', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
    }
};

export const getPPKSummary = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        const config = await prisma.pPKConfig.findUnique({ where: { userId } });
        if (!config) {
            return res.json({
                totalEmployee: 0,
                totalEmployer: 0,
                totalState: 0,
                totalAccumulated: 0,
                isConfigured: false
            });
        }

        const transactions = await prisma.pPKTransaction.findMany({
            where: { userId },
            orderBy: { date: 'asc' }
        });

        const summary = transactions.reduce((acc: { totalEmployee: number, totalEmployer: number, totalState: number, totalAccumulated: number }, t) => {
            const amount = Number(t.amount);
            if (t.type === 'EMPLOYEE') acc.totalEmployee += amount;
            if (t.type === 'EMPLOYER') acc.totalEmployer += amount;
            if (t.type === 'STATE_WELCOME' || t.type === 'STATE_ANNUAL') acc.totalState += amount;
            acc.totalAccumulated += amount;
            return acc;
        }, {
            totalEmployee: 0,
            totalEmployer: 0,
            totalState: 0,
            totalAccumulated: 0
        });

        res.json({
            ...summary,
            isConfigured: true,
            config: {
                grossSalary: Number(config.grossSalary),
                employeeRate: Number(config.employeeRate),
                employerRate: Number(config.employerRate),
                startDate: config.startDate
            }
        });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd podsumowania PPK:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// Aktualizacja konfiguracji PPK BEZ kasowania historii transakcji.
// Nowe wartości obowiązują od kolejnych wpłat (confirm-suggestion czyta bieżący config).
export const updatePPKConfig = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { grossSalary, employeeRate, employerRate } = req.body;

        const config = await prisma.pPKConfig.findUnique({ where: { userId } });
        if (!config) {
            return res.status(404).json({ error: 'Brak konfiguracji PPK — najpierw skonfiguruj moduł' });
        }

        const gross = parseFloat(grossSalary);
        const empRate = parseFloat(employeeRate);
        const emplrRate = parseFloat(employerRate);

        if (isNaN(gross) || gross <= 0) {
            return res.status(400).json({ error: 'Wynagrodzenie brutto musi być liczbą dodatnią' });
        }
        // Ustawowe widełki PPK: pracownik 0,5–4%, pracodawca 1,5–4%
        if (isNaN(empRate) || empRate < 0.5 || empRate > 4) {
            return res.status(400).json({ error: 'Składka pracownika musi mieścić się w przedziale 0,5–4%' });
        }
        if (isNaN(emplrRate) || emplrRate < 1.5 || emplrRate > 4) {
            return res.status(400).json({ error: 'Składka pracodawcy musi mieścić się w przedziale 1,5–4%' });
        }

        const updated = await prisma.pPKConfig.update({
            where: { userId },
            data: {
                grossSalary: gross,
                employeeRate: empRate,
                employerRate: emplrRate
            }
        });

        res.json(updated);
    } catch (error: any) {
        captureServerError(error, req, 'Błąd aktualizacji konfiguracji PPK:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

export const getPPKTransactions = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const config = await prisma.pPKConfig.findUnique({ where: { userId } });
        if (!config) {
            return res.json({
                transactions: [],
                pagination: {
                    total: 0,
                    page,
                    limit,
                    totalPages: 0
                },
                isConfigured: false
            });
        }

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            prisma.pPKTransaction.findMany({
                where: { userId },
                orderBy: { date: 'desc' },
                skip,
                take: limit
            }),
            prisma.pPKTransaction.count({ where: { userId } })
        ]);

        res.json({
            transactions,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd pobierania transakcji PPK:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

export const getPendingSuggestion = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const config = await prisma.pPKConfig.findUnique({ where: { userId } });

        if (!config || !config.active) {
            return res.json({ hasSuggestion: false });
        }

        const now = new Date();
        const currentMonthStart = startOfMonth(now);

        // Check if any transaction exists for the current month
        const existing = await prisma.pPKTransaction.findFirst({
            where: {
                userId,
                date: {
                    gte: currentMonthStart,
                    lte: endOfMonth(now)
                },
                type: 'EMPLOYEE'
            }
        });

        if (existing) {
            return res.json({ hasSuggestion: false });
        }

        res.json({
            hasSuggestion: true,
            suggestion: {
                grossSalary: config.grossSalary,
                employeeRate: config.employeeRate,
                employerRate: config.employerRate,
                monthName: format(now, 'MMMM yyyy'),
                date: currentMonthStart
            }
        });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd sugestii PPK:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

export const confirmSuggestion = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { grossSalary, employeeRate, employerRate } = req.body;

        const config = await prisma.pPKConfig.findUnique({ where: { userId } });
        if (!config) return res.status(404).json({ error: 'Brak konfiguracji PPK' });

        const now = new Date();
        const currentMonthStart = startOfMonth(now);

        // Calculate annual gross to check tax bracket
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearlyTransactions = await prisma.pPKTransaction.findMany({
            where: {
                userId,
                date: {
                    gte: yearStart,
                    lt: currentMonthStart
                },
                type: 'EMPLOYEE'
            },
            select: { grossSalary: true }
        });

        const cumulativeAnnualGross = yearlyTransactions.reduce((sum: number, t) => sum + Number(t.grossSalary || 0), 0);

        const { employeeContribution, employerContribution, employerTax } = calculatePPK(
            parseFloat(grossSalary),
            parseFloat(employeeRate),
            parseFloat(employerRate),
            cumulativeAnnualGross
        );

        // Create transactions in a transaction
        await prisma.$transaction([
            prisma.pPKTransaction.create({
                data: {
                    userId,
                    date: currentMonthStart,
                    type: 'EMPLOYEE',
                    amount: employeeContribution,
                    grossSalary: parseFloat(grossSalary)
                }
            }),
            prisma.pPKTransaction.create({
                data: {
                    userId,
                    date: currentMonthStart,
                    type: 'EMPLOYER',
                    amount: employerContribution,
                    grossSalary: parseFloat(grossSalary),
                    taxAmount: employerTax
                }
            })
        ]);

        // Update config if gross changed
        if (parseFloat(grossSalary) !== Number(config.grossSalary)) {
            await prisma.pPKConfig.update({
                where: { userId },
                data: { grossSalary: parseFloat(grossSalary) }
            });
        }

        // Dotacje państwowe: dopisz premię powitalną (po 3. miesiącu) / dopłatę roczną
        // (gdy rok się domknął) i skoryguj legacy wpisy.
        await reconcilePPKBonuses(userId);

        res.json({ message: 'Wpłata PPK potwierdzona' });
    } catch (error: any) {
        captureServerError(error, req, 'Błąd potwierdzenia PPK:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
