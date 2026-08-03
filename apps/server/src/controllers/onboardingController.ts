import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { captureServerError } from '../lib/reportError';

export const getStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        // console.log('[ONBOARDING] Fetching status for user:', userId);

        let status = await prisma.onboardingStatus.findUnique({
            where: { userId }
        });

        if (!status) {
            // console.log('[ONBOARDING] No status found, creating new one for user:', userId);
            status = await prisma.onboardingStatus.create({
                data: { userId }
            });
        }

        // console.log('[ONBOARDING] Returning status:', status);
        res.json(status);
    } catch (error) {
        captureServerError(error, req, '[ONBOARDING] Error fetching onboarding status:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const { accountsDone, firstExpenseDone, goalsDone } = req.body;
        // console.log('[ONBOARDING] Updating status for user:', userId, req.body);

        const status = await prisma.onboardingStatus.upsert({
            where: { userId },
            update: {
                ...(accountsDone !== undefined && { accountsDone }),
                ...(firstExpenseDone !== undefined && { firstExpenseDone }),
                ...(goalsDone !== undefined && { goalsDone })
            },
            create: {
                userId,
                accountsDone: accountsDone || false,
                firstExpenseDone: firstExpenseDone || false,
                goalsDone: goalsDone || false
            }
        });

        // console.log('[ONBOARDING] Update success:', status);
        res.json(status);
    } catch (error) {
        captureServerError(error, req, '[ONBOARDING] Error updating onboarding status:');
        res.status(500).json({ message: 'Internal server error' });
    }
};
