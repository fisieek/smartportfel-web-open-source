import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { addDays } from 'date-fns';
import crypto from 'crypto';
import { Prisma, User } from '@prisma/client';
import { LoginRequestSchema, RegisterRequestSchema } from '@smartportfel/contracts';
import prisma from '../lib/prisma';
import { signAccessToken, hashToken, issueRefreshToken } from '../lib/authTokens';
import { revokeAllUserMcpTokens } from '../services/mcp/mcpTokenService';
import { sendVerificationEmail, sendAdminNotificationEmail } from '../utils/email';
import { logger } from '../utils/logger';
import { audit } from '../utils/auditLog';
import { captureServerError } from '../lib/reportError';

const SALT_ROUNDS = 10;
// Lockout per-konto (uzupełnia limit per-IP, który nie zatrzyma ataku rozproszonego)
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Atomowo: nowe hasło + bump tokenVersion (unieważnia access JWT w authenticateToken)
 * + revoke wszystkich refresh tokenów i tokenów MCP. Jedna transakcja — częściowy fail
 * nie może zostawić nowego hasła z żywymi starymi sesjami (ani odwrotnie).
 * Świeże tokeny dla bieżącego klienta wydawaj PO transakcji, inaczej revoke je zabije.
 */
async function updatePasswordAndRevokeSessions(
    userId: string,
    hashedPassword: string,
    extraUserData: Prisma.UserUpdateInput = {},
): Promise<{ user: User; revokedRefresh: number; revokedMcp: number }> {
    return prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                tokenVersion: { increment: 1 },
                ...extraUserData,
            },
        });
        const { count: revokedRefresh } = await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
        const revokedMcp = await revokeAllUserMcpTokens(userId, tx);
        return { user, revokedRefresh, revokedMcp };
    });
}

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = RegisterRequestSchema.safeParse(req.body);

        if (!result.success) {
            res.status(400).json({
                message: 'Nieprawidłowe dane rejestracji',
                errors: result.error.flatten()
            });
            return;
        }

        const { name: username, email, password } = result.data;
        // `plan` z body jest świadomie ignorowany — produkt jest darmowy, każdy dostaje pełny
        // dostęp. Stare linki `/register?plan=PRO` nadal działają, po prostu nic nie zmieniają.

        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [{ email }, { username }],
            },
        });

        if (existingUser) {
            res.status(409).json({ message: 'User with this email or username already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const verificationToken = crypto.randomUUID();
        const verificationTokenExpiresAt = addDays(new Date(), 1); // 24 hours

        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword,
                isEmailVerified: false, // Explicitly false for new users
                verificationToken,
                verificationTokenExpiresAt,
                savingsGoals: {
                    create: {
                        name: "Poduszka finansowa",
                        targetAmount: 10000,
                        allocatedAmount: 0,
                        isMain: true
                    }
                },
                personalAccounts: {
                    create: {
                        name: "Gotówka",
                        bank: "Portfel",
                        balance: 0,
                        isSystem: true,
                        isMain: false
                    }
                }
            },
        });

        // Send verification email
        try {
            await sendVerificationEmail(user.email, verificationToken);
        } catch (emailError) {
            logger.error('Failed to send verification email:', emailError);
        }

        // Notify admin about new registration
        try {
            await sendAdminNotificationEmail(user.email, user.username);
        } catch (adminError) {
            logger.error('Failed to send admin notification email:', adminError);
        }

        await audit('auth.register', { userId: user.id, req });

        res.status(201).json({
            message: 'User created successfully. Please check your email to verify your account.',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isEmailVerified: user.isEmailVerified
            },
        });
    } catch (error) {
        captureServerError(error, req, 'Registration error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * GET /auth/me
 * Zwraca aktualny stan zalogowanego użytkownika z bazy danych.
 * Używany do odświeżania cache'u w localStorage bez ponownego logowania.
 */
export const getMe = async (req: any, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Unauthorized' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                username: true,
                email: true,
                isEmailVerified: true,
                createdAt: true,
            }
        });

        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.json({ user });
    } catch (error) {
        captureServerError(error, req, 'getMe error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = LoginRequestSchema.safeParse(req.body);

        if (!result.success) {
            res.status(400).json({
                message: 'Nieprawidłowe dane logowania',
                errors: result.error.flatten()
            });
            return;
        }

        const { email, password } = result.data;

        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { email: email },
                    { username: email }
                ]
            },
        });

        if (!user || !user.password) {
            res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
            return;
        }

        // Lockout per-konto: limit per-IP nie chroni przed atakiem rozproszonym po wielu
        // adresach, więc po LOCKOUT_THRESHOLD nieudanych próbach blokujemy samo konto.
        // Sprawdzane PRZED bcrypt — zablokowane konto odrzuca też poprawne hasło.
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            await audit('auth.login_locked', { userId: user.id, req });
            res.status(429).json({
                message: 'Zbyt wiele prób logowania. Spróbuj ponownie później.',
                code: 'ACCOUNT_LOCKED'
            });
            return;
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            const attempts = user.failedLoginAttempts + 1;
            const shouldLock = attempts >= LOCKOUT_THRESHOLD;
            await prisma.user.update({
                where: { id: user.id },
                data: shouldLock
                    ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) }
                    : { failedLoginAttempts: attempts },
            });
            await audit('auth.login_failed', { userId: user.id, req });
            res.status(401).json({ message: 'Nieprawidłowy email lub hasło' });
            return;
        }

        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: null },
            });
        }

        if (!user.isEmailVerified) {
            res.status(403).json({
                message: 'Konto nie zostało jeszcze zweryfikowane',
                code: 'EMAIL_NOT_VERIFIED'
            });
            return;
        }

        const token = signAccessToken(user);

        // Refresh token dla klienta mobilnego (dodatkowe pole — web go ignoruje).
        const refreshToken = await issueRefreshToken(user.id);

        await audit('auth.login', { userId: user.id, req });

        res.json({
            message: 'Login successful',
            token,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                isEmailVerified: user.isEmailVerified
            },
        });
    } catch (error) {
        captureServerError(error, req, 'Login error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/refresh
 * Wymienia ważny refresh token na nowy access token (+ zrotowany refresh token).
 * Używane przez aplikację mobilną do cichego odnowienia sesji.
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawToken = req.body?.refreshToken;
        if (!rawToken || typeof rawToken !== 'string') {
            res.status(400).json({ message: 'Refresh token jest wymagany' });
            return;
        }

        const tokenHash = hashToken(rawToken);
        const existing = await prisma.refreshToken.findUnique({
            where: { tokenHash },
            include: { user: true },
        });

        if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
            res.status(401).json({ message: 'Refresh token nieprawidłowy lub wygasły', code: 'REFRESH_INVALID' });
            return;
        }

        // Rotacja: revoke stary token, wydaj nowy (ochrona przed replay).
        await prisma.refreshToken.update({
            where: { id: existing.id },
            data: { revokedAt: new Date() },
        });
        const newRefreshToken = await issueRefreshToken(existing.userId);

        const token = signAccessToken(existing.user);

        res.json({ token, refreshToken: newRefreshToken });
    } catch (error) {
        captureServerError(error, req, 'Refresh token error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/logout
 * Revoke refresh tokenu po stronie serwera (best-effort — brak tokenu też zwraca 200).
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const rawToken = req.body?.refreshToken;
        if (rawToken && typeof rawToken === 'string') {
            await prisma.refreshToken.updateMany({
                where: { tokenHash: hashToken(rawToken), revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }
        res.json({ message: 'Wylogowano' });
    } catch (error) {
        captureServerError(error, req, 'Logout error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const { username, email } = req.body;

        if (!username && !email) {
            res.status(400).json({ message: 'Brak danych do aktualizacji' });
            return;
        }

        // Sprawdź czy nazwa/email nie jest już zajęta
        if (username || email) {
            const existing = await prisma.user.findFirst({
                where: {
                    AND: [
                        { id: { not: userId } },
                        {
                            OR: [
                                username ? { username } : {},
                                email ? { email } : {}
                            ]
                        }
                    ]
                }
            });

            if (existing) {
                res.status(409).json({ message: 'Nazwa użytkownika lub email jest już zajęty' });
                return;
            }
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(username && { username }),
                ...(email && { email })
            }
        });

        res.json({
            message: 'Profil zaktualizowany',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        });
    } catch (error) {
        captureServerError(error, req, 'Profile update error:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user.userId;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({ message: 'Obecne i nowe hasło są wymagane' });
            return;
        }

        if (newPassword.length < 8) {
            res.status(400).json({ message: 'Nowe hasło musi mieć minimum 8 znaków' });
            return;
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });

        if (!user) {
            res.status(404).json({ message: 'Użytkownik nie znaleziony' });
            return;
        }

        if (!user.password) {
            res.status(401).json({ message: 'Użytkownik nie ma ustawionego hasła' });
            return;
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

        if (!isPasswordValid) {
            res.status(401).json({ message: 'Obecne hasło jest nieprawidłowe' });
            return;
        }

        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Zmiana hasła = intencja "zabezpieczam konto": unieważnij wszystkie sesje
        // (inne urządzenia, refresh tokeny mobilki, łączniki MCP). Skoro user zna
        // obecne hasło, lockout per-konto też można zdjąć.
        const { user: updatedUser, revokedRefresh, revokedMcp } =
            await updatePasswordAndRevokeSessions(userId, hashedPassword, {
                failedLoginAttempts: 0,
                lockedUntil: null,
            });

        // Świeże tokeny dla urządzenia, na którym user zmienia hasło — nie wylogowujemy go.
        const token = signAccessToken(updatedUser);
        const refreshToken = await issueRefreshToken(userId);

        await audit('auth.password_changed', {
            userId,
            resource: `sessions_revoked:refresh=${revokedRefresh},mcp=${revokedMcp}`,
            req,
        });

        res.json({
            message: 'Hasło zostało zmienione. Pozostałe sesje zostały wylogowane.',
            token,
            refreshToken,
        });
    } catch (error) {
        captureServerError(error, req, 'Password change error:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token } = req.params;

        if (!token) {
            res.status(400).json({ message: 'Token is required' });
            return;
        }

        const user = await prisma.user.findUnique({
            where: { verificationToken: token }
        });

        if (!user) {
            res.status(400).json({ message: 'Link weryfikacyjny jest nieprawidłowy lub został już wykorzystany.' });
            return;
        }

        if (user.verificationTokenExpiresAt && user.verificationTokenExpiresAt < new Date()) {
            res.status(400).json({ message: 'Link weryfikacyjny wygasł. Zarejestruj się ponownie.' });
            return;
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                verificationToken: null,
                verificationTokenExpiresAt: null
            }
        });

        res.json({ message: 'Email verified successfully. You can now log in.' });
    } catch (error) {
        captureServerError(error, req, 'Email verification error:');
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * POST /auth/forgot-password
 * Wysyła email z linkiem do resetu hasła.
 * Zawsze zwraca 200 (zapobiega user enumeration attack).
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== 'string') {
            res.status(400).json({ message: 'Adres e-mail jest wymagany' });
            return;
        }

        // Always respond OK to prevent user enumeration
        const genericResponse = { message: 'Jeśli konto z tym adresem e-mail istnieje, wyślemy na nie link do resetu hasła.' };

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

        if (!user || !user.isEmailVerified) {
            res.json(genericResponse);
            return;
        }

        // Generate secure token valid for 1 hour
        const resetToken = crypto.randomUUID();
        const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetToken: resetToken,
                passwordResetExpiresAt: resetExpiresAt
            }
        });

        try {
            const { sendPasswordResetEmail } = await import('../utils/email');
            await sendPasswordResetEmail(user.email, resetToken);
        } catch (emailErr) {
            logger.error('Failed to send password reset email:', emailErr);
        }

        res.json(genericResponse);
    } catch (error) {
        captureServerError(error, req, 'Forgot password error:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

/**
 * POST /auth/reset-password
 * Ustawia nowe hasło na podstawie tokena z emaila.
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            res.status(400).json({ message: 'Token i nowe hasło są wymagane' });
            return;
        }

        if (typeof password !== 'string' || password.length < 8) {
            res.status(400).json({ message: 'Hasło musi mieć co najmniej 8 znaków' });
            return;
        }

        const user = await prisma.user.findFirst({
            where: {
                passwordResetToken: token,
                passwordResetExpiresAt: { gt: new Date() }
            }
        });

        if (!user) {
            res.status(400).json({ message: 'Nieprawidłowy lub wygasły link do resetu hasła' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Reset hasła = odzyskiwanie konta po (potencjalnej) kompromitacji — atakujący
        // nie może zachować dostępu przez skradziony JWT, refresh token ani token MCP.
        const { revokedRefresh, revokedMcp } = await updatePasswordAndRevokeSessions(
            user.id,
            hashedPassword,
            {
                passwordResetToken: null,
                passwordResetExpiresAt: null,
                // Reset hasła to legalna ścieżka odzyskania konta — zdejmij lockout
                failedLoginAttempts: 0,
                lockedUntil: null,
            },
        );

        await audit('auth.password_reset_completed', {
            userId: user.id,
            resource: `sessions_revoked:refresh=${revokedRefresh},mcp=${revokedMcp}`,
            req,
        });

        res.json({ message: 'Hasło zostało zmienione. Możesz się teraz zalogować.' });
    } catch (error) {
        captureServerError(error, req, 'Reset password error:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};
