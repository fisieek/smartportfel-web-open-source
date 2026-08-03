import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { logger } from '../utils/logger';
import { audit } from '../utils/auditLog';
import { captureServerError } from '../lib/reportError';

/**
 * GET /auth/data-export
 * RODO: prawo do przenoszalności danych — pełny eksport danych użytkownika jako JSON.
 */
export const exportData = async (req: any, res: Response): Promise<void> => {
    try {
        const userId = req.user.userId;

        const [user, personalAccounts, savingsAccounts, investmentAccounts, expenses, savingsGoals,
            investments, mortgages, ppkConfig, ppkTransactions, monthlyPlans, portfolioSnapshots,
            categories, stores, aiKeyRow] = await Promise.all([
            prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, username: true, email: true, createdAt: true, isEmailVerified: true
                }
            }),
            prisma.personalAccount.findMany({ where: { userId }, include: { balances: true } }),
            prisma.savingsAccount.findMany({ where: { userId } }),
            prisma.investmentAccount.findMany({ where: { userId } }),
            prisma.expense.findMany({ where: { userId } }),
            prisma.savingsGoal.findMany({ where: { userId } }),
            prisma.investment.findMany({ where: { userId }, include: { history: true } }),
            prisma.mortgage.findMany({ where: { userId }, include: { payments: true } }),
            (prisma as any).pPKConfig.findUnique({ where: { userId } }),
            (prisma as any).pPKTransaction.findMany({ where: { userId } }),
            (prisma as any).monthlyPlan.findMany({ where: { userId }, include: { items: true } }),
            prisma.portfolioSnapshot.findMany({ where: { userId } }),
            prisma.category.findMany({ where: { userId } }),
            prisma.store.findMany({ where: { userId } }),
            // BYOK: do eksportu idzie wyłącznie metadana klucza. `select` jest OBOWIĄZKOWY —
            // w tym samym wierszu leżą `ciphertext`/`iv`/`authTag`, a odczyt bez `select`
            // wpuściłby zaszyfrowany klucz użytkownika do pobieranego pliku.
            prisma.userAiKey.findUnique({
                where: { userId },
                select: { provider: true, last4: true, createdAt: true }
            })
        ]);

        if (!user) {
            res.status(404).json({ message: 'Użytkownik nie znaleziony' });
            return;
        }

        await audit('account.data_exported', { userId, req });

        res.setHeader('Content-Disposition', 'attachment; filename="smartportfel-export.json"');
        res.json({
            exportedAt: new Date().toISOString(),
            user,
            personalAccounts,
            savingsAccounts,
            investmentAccounts,
            expenses,
            savingsGoals,
            investments,
            mortgages,
            ppk: { config: ppkConfig, transactions: ppkTransactions },
            monthlyPlans,
            portfolioSnapshots,
            categories,
            stores,
            aiKey: aiKeyRow && {
                provider: aiKeyRow.provider === 'OPENAI' ? 'openai' : 'gemini',
                last4: aiKeyRow.last4,
                createdAt: aiKeyRow.createdAt
            }
        });
    } catch (error) {
        captureServerError(error, req, 'Data export error:');
        res.status(500).json({ message: 'Błąd eksportu danych' });
    }
};

/**
 * DELETE /auth/account
 * RODO: prawo do bycia zapomnianym — trwałe usunięcie konta i wszystkich danych.
 * Wymaga potwierdzenia hasłem, a dla kont bez hasła — adresem e-mail.
 * Body: { password?: string, confirmEmail?: string }
 */
export const deleteAccount = async (req: any, res: Response): Promise<void> => {
    try {
        const userId = req.user.userId;
        const { password, confirmEmail } = req.body;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            res.status(404).json({ message: 'Użytkownik nie znaleziony' });
            return;
        }

        if (user.password) {
            if (!password || !(await bcrypt.compare(password, user.password))) {
                res.status(401).json({ message: 'Nieprawidłowe hasło — usunięcie konta wymaga potwierdzenia hasłem' });
                return;
            }
        } else {
            if (!confirmEmail || confirmEmail.toLowerCase().trim() !== user.email.toLowerCase()) {
                res.status(401).json({ message: 'Potwierdź usunięcie konta, wpisując swój adres e-mail' });
                return;
            }
        }

        // Audyt PRZED usunięciem — wpis przetrwa (AuditLog nie ma FK do User)
        await audit('account.deleted', { userId, resource: `email:${user.email}`, req });

        // Kolejność wynika z FK: dzieci przed rodzicami; PlanItem linkuje do Expense, więc idzie pierwszy
        await prisma.$transaction(async (tx) => {
            await (tx as any).planItem.deleteMany({ where: { plan: { userId } } });
            await (tx as any).monthlyPlan.deleteMany({ where: { userId } });
            await tx.expense.deleteMany({ where: { userId } });
            await tx.savingsGoal.deleteMany({ where: { userId } });
            await (tx as any).mortgagePayment.deleteMany({ where: { mortgage: { userId } } });
            await (tx as any).mortgage.deleteMany({ where: { userId } });
            await (tx as any).investmentHistory.deleteMany({ where: { investment: { userId } } });
            await (tx as any).investment.deleteMany({ where: { userId } });
            await (tx as any).pPKTransaction.deleteMany({ where: { userId } });
            await (tx as any).pPKConfig.deleteMany({ where: { userId } });
            await tx.savingsAccount.deleteMany({ where: { userId } });
            await (tx as any).investmentAccount.deleteMany({ where: { userId } });
            await tx.personalAccount.deleteMany({ where: { userId } }); // AccountBalance kasuje się kaskadowo
            await tx.store.deleteMany({ where: { userId } });
            await tx.category.deleteMany({ where: { userId } });
            await tx.user.delete({ where: { id: userId } }); // PortfolioSnapshot i OnboardingStatus mają onDelete: Cascade
        }, { timeout: 30000 });

        logger.info(`[GDPR] Account deleted: ${userId}`);
        res.json({ message: 'Konto i wszystkie dane zostały trwale usunięte' });
    } catch (error) {
        captureServerError(error, req, 'Account deletion error:');
        res.status(500).json({ message: 'Błąd usuwania konta' });
    }
};
