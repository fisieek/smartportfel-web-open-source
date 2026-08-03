import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { captureServerError } from '../lib/reportError';


export interface AuthRequest extends Request {
    user?: {
        userId: string;
        username: string;
    };
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
        res.status(500).json({ message: 'Server configuration error' });
        return;
    }
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        console.log('Auth Failure: No token found in headers');
        // `code` odróżnia awarię bramki auth od biznesowych 401/403 (klient mobilny
        // reaguje tylko na te kody: brak → NO_TOKEN, wygasły/niepoprawny → TOKEN_INVALID).
        res.status(401).json({ message: 'Authentication required', code: 'NO_TOKEN' });
        return;
    }

    let payload: any;
    try {
        payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err: any) {
        console.log('Auth Failure: JWT Verify error', err?.message);
        res.status(403).json({ message: 'Invalid or expired token', code: 'TOKEN_INVALID' });
        return;
    }

    if (!payload || typeof payload.userId !== 'string') {
        res.status(403).json({ message: 'Invalid or expired token', code: 'TOKEN_INVALID' });
        return;
    }

    try {
        // Kryptograficznie poprawny JWT nie wystarcza: zmiana/reset hasła bumpuje
        // tokenVersion w DB i wszystkie wcześniejsze tokeny mają się natychmiast
        // przestać liczyć (a token usuniętego konta — również). Tokeny sprzed
        // wdrożenia nie mają pola w payloadzie → traktujemy jako wersję 0.
        const dbUser = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: { tokenVersion: true },
        });

        if (!dbUser || (payload.tokenVersion ?? 0) !== dbUser.tokenVersion) {
            res.status(403).json({ message: 'Invalid or expired token', code: 'TOKEN_INVALID' });
            return;
        }
    } catch (error) {
        // Fail-closed: bez odpowiedzi z DB nie potwierdzimy ważności sesji.
        captureServerError(error, req, 'Auth token version check error:');
        res.status(500).json({ message: 'Internal server error' });
        return;
    }

    req.user = { userId: payload.userId, username: payload.username };
    next();
};
