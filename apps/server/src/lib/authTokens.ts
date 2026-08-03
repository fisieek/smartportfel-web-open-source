import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { addDays } from 'date-fns';
import prisma from './prisma';

export const TOKEN_EXPIRY = '7d';
const REFRESH_TOKEN_EXPIRY_DAYS = 60;

export interface AccessTokenUser {
    id: string;
    username: string;
    tokenVersion: number;
}

// Jedyne miejsce podpisywania access tokenów (login, refresh).
// tokenVersion w payloadzie pozwala unieważnić wszystkie sesje bumpem kolumny w DB
// (zmiana/reset hasła) — authenticateToken porównuje wartość z aktualną w bazie.
export function signAccessToken(user: AccessTokenUser): string {
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
    return jwt.sign(
        { userId: user.id, username: user.username, tokenVersion: user.tokenVersion },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY, algorithm: 'HS256' }
    );
}

// Refresh tokeny (aplikacja mobilna). Trzymamy w DB tylko hash — surowy token widzi
// wyłącznie klient. Web nie używa tej ścieżki (cookie-auth).
export function hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function issueRefreshToken(userId: string): Promise<string> {
    const raw = crypto.randomBytes(48).toString('hex');
    await prisma.refreshToken.create({
        data: {
            userId,
            tokenHash: hashToken(raw),
            expiresAt: addDays(new Date(), REFRESH_TOKEN_EXPIRY_DAYS),
        },
    });
    return raw;
}
