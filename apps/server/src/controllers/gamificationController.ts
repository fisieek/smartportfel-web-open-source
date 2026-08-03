import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { logger } from '../utils/logger';
import { evaluate, markSeen } from '../services/gamificationService';
import { captureServerError } from '../lib/reportError';

// GET /api/gamification — przelicza serię + odznaki (read-time) i zwraca podsumowanie.
export const getGamification = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const summary = await evaluate(userId);
        res.json(summary);
    } catch (error) {
        captureServerError(error, req, 'Błąd gamifikacji:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

// POST /api/gamification/seen — zbija celebrację (znacznik „widziane").
export const postSeen = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        await markSeen(userId);
        res.json({ ok: true });
    } catch (error) {
        captureServerError(error, req, 'Błąd gamifikacji (seen):');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};
