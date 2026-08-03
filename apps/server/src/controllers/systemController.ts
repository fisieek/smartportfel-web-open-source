import { Request, Response } from 'express';
import crypto from 'crypto';
import { sendFeedbackEmail } from '../utils/email';
import prisma from '../lib/prisma';
import { subDays } from 'date-fns';
import { logger } from '../utils/logger';
import { captureServerError } from '../lib/reportError';
import { reconcileAgainstBaseline } from '../services/reconciliationService';
import { refreshPrices } from '../services/priceRefreshService';

// Porównanie w stałym czasie — zwykłe !== zdradza długość prefiksu przez czas odpowiedzi
const isValidSystemToken = (provided: unknown): boolean => {
    const expected = process.env.SYSTEM_CLEANUP_TOKEN;
    if (!expected || typeof provided !== 'string') return false;
    const providedHash = crypto.createHash('sha256').update(provided).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    return crypto.timingSafeEqual(providedHash, expectedHash);
};

/**
 * GET /api/system/cron/reconcile-balances — do wywołania z harmonogramu (cron systemowy,
 * scheduler hostingu, cokolwiek). Wymaga nagłówka `Authorization: Bearer $CRON_SECRET`.
 *
 * Alarmuje (log poziomu error) tylko przy dryfie NOWYM lub ZMIENIONYM względem
 * baseline — zastane salda otwarcia siedzą w balance_drift_baseline i nie szumią.
 */
export const cronReconcileBalances = async (req: Request, res: Response): Promise<void> => {
    const auth = req.headers['authorization'];
    const expected = process.env.CRON_SECRET;
    if (!expected || auth !== `Bearer ${expected}`) {
        res.status(403).json({ message: 'Forbidden' });
        return;
    }

    try {
        // Przy okazji nocnego cronu: sprzątnij dawno wygasłe kubełki rate limitu
        // (store tylko nadpisuje/resetuje wpisy w miejscu, nigdy ich nie usuwa).
        const staleLimits = await prisma.rateLimitEntry.deleteMany({
            where: { resetAt: { lt: subDays(new Date(), 1) } }
        });
        if (staleLimits.count > 0) {
            logger.info(`[RECONCILE] Usunięto ${staleLimits.count} wygasłych wpisów rate limitu`);
        }

        const result = await reconcileAgainstBaseline();

        if (result.newOrChanged.length > 0) {
            const details = result.newOrChanged
                .map(d => `${d.accountType}:"${d.accountName}"(${d.accountId})${d.currency ? ' ' + d.currency : ''} drift=${d.drift}`)
                .join('; ');
            logger.error(`[RECONCILE] Nowe/zmienione dryfy sald: ${details}`);
        } else {
            logger.info(`[RECONCILE] OK — bez nowych dryfów (baseline: ${result.totalDrifts}, warns: ${result.warns}, rozwiązane: ${result.resolved})`);
        }

        res.json({
            ok: result.newOrChanged.length === 0,
            totalDrifts: result.totalDrifts,
            newOrChanged: result.newOrChanged.length,
            resolved: result.resolved,
            warns: result.warns
        });
    } catch (error) {
        captureServerError(error, req, '[RECONCILE] Rekoncyliacja nie powiodła się:');
        res.status(500).json({ message: 'Reconciliation failed' });
    }
};

/**
 * GET /api/system/cron/refresh-prices — do wywołania z harmonogramu (raz dziennie).
 * Odświeża wartość rynkową wszystkich podlinkowanych pozycji (dostawca notowań + NBP) + dopisuje historię.
 * Autoryzacja jak w cronReconcileBalances: nagłówek Authorization: Bearer CRON_SECRET.
 */
export const cronRefreshPrices = async (req: Request, res: Response): Promise<void> => {
    const auth = req.headers['authorization'];
    const expected = process.env.CRON_SECRET;
    if (!expected || auth !== `Bearer ${expected}`) {
        res.status(403).json({ message: 'Forbidden' });
        return;
    }

    try {
        const result = await refreshPrices(); // cały portfel, z historią (sparkline)
        res.json({ ok: true, ...result });
    } catch (error) {
        captureServerError(error, req, '[REFRESH] cron nie powiódł się:');
        res.status(500).json({ message: 'Price refresh failed' });
    }
};

export const submitFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message } = req.body;
        const userId = (req as any).user?.userId;

        if (!message || message.trim().length === 0) {
            res.status(400).json({ message: 'Wiadomość nie może być pusta' });
            return;
        }

        if (!userId) {
            res.status(401).json({ message: 'Nieautoryzowany' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, username: true }
        });

        if (!user) {
            res.status(404).json({ message: 'Użytkownik nie znaleziony' });
            return;
        }

        await sendFeedbackEmail(user.email, user.username, message);

        res.status(200).json({ message: 'Feedback wysłany pomyślnie' });
    } catch (error) {
        console.error('Błąd podczas wysyłania feedbacku:', error);
        res.status(500).json({ message: 'Wystąpił błąd podczas wysyłania feedbacku' });
    }
};

export const cleanupUnverifiedUsers = async (req: Request, res: Response) => {
    try {
        const { token } = req.body;
        if (!isValidSystemToken(token)) {
            return res.status(403).json({ message: 'Invalid token' });
        }

        const yesterday = subDays(new Date(), 1);

        const usersToRemove = await prisma.user.findMany({
            where: {
                isEmailVerified: false,
                createdAt: { lt: yesterday }
            },
            select: { id: true }
        });

        if (usersToRemove.length === 0) {
            return res.json({ message: 'Nothing to cleanup', count: 0 });
        }

        const userIds = usersToRemove.map(u => u.id);

        // Delete dependencies
        await prisma.expense.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).onboardingStatus.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).planItem.deleteMany({ where: { plan: { userId: { in: userIds } } } });
        await (prisma as any).monthlyPlan.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.savingsGoal.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).mortgagePayment.deleteMany({ where: { mortgage: { userId: { in: userIds } } } });
        await (prisma as any).mortgage.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).investmentHistory.deleteMany({ where: { investment: { userId: { in: userIds } } } });
        await (prisma as any).investment.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).investmentAccount.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).pPKTransaction.deleteMany({ where: { userId: { in: userIds } } });
        await (prisma as any).pPKConfig.deleteMany({ where: { userId: { in: userIds } } });

        const deleteResult = await prisma.user.deleteMany({
            where: {
                id: { in: userIds }
            }
        });

        logger.info(`[CLEANUP] Removed ${deleteResult.count} unverified users (ids: ${userIds.join(', ')})`);
        const { audit } = await import('../utils/auditLog');
        await audit('system.cleanup', { resource: `count:${deleteResult.count}`, req });

        res.json({
            message: 'Cleanup successful',
            count: deleteResult.count
        });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
