import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import * as authController from '../authController';
import { sendVerificationEmail, sendAdminNotificationEmail } from '../../utils/email';

// Mock dependencies
vi.mock('../../lib/prisma', () => {
    const mockPrisma: any = {
        user: {
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        // login/refresh wydają refresh-token (issueRefreshToken → prisma.refreshToken.create);
        // change/resetPassword revokują wszystkie (updateMany)
        refreshToken: {
            create: vi.fn(),
            updateMany: vi.fn(),
        },
        mcpToken: {
            updateMany: vi.fn(),
        },
    };
    // Interaktywna transakcja: callback dostaje ten sam mock — asercje idą po prisma.*
    mockPrisma.$transaction = vi.fn(async (fn: any) => fn(mockPrisma));
    return { default: mockPrisma };
});

// audit() zapisuje log; w testach ma być no-opem (nie zależymy od req.ip itp.)
vi.mock('../../utils/auditLog', () => ({
    audit: vi.fn(),
}));

vi.mock('bcryptjs', () => ({
    default: {
        hash: vi.fn(),
        compare: vi.fn(),
    },
}));

vi.mock('jsonwebtoken', () => ({
    default: {
        sign: vi.fn(),
    },
}));

vi.mock('../../utils/email', () => ({
    sendVerificationEmail: vi.fn(),
    sendAdminNotificationEmail: vi.fn(),
}));

vi.mock('../../utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('AuthController', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let jsonMock: ReturnType<typeof vi.fn>;
    let statusMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = 'test-secret'; // login: `if (!JWT_SECRET) throw`
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        mockRes = {
            status: statusMock as any,
            json: jsonMock as any,
        };
        // Domyślne wyniki revoke — clearAllMocks nie czyści implementacji,
        // ale per-testowe mockResolvedValue by wyciekały między testami.
        (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 0 });
        (prisma.mcpToken.updateMany as any).mockResolvedValue({ count: 0 });
    });

    describe('register', () => {
        it('should return 400 if required fields are missing', async () => {
            mockReq = {
                body: { name: 'testuser', email: '' }, // missing password
            };

            await authController.register(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Nieprawidłowe dane rejestracji',
                errors: expect.anything(),
            }));
        });

        it('should return 409 if user already exists', async () => {
            mockReq = {
                body: { name: 'testuser', email: 'test@example.com', password: 'password123' },
            };

            (prisma.user.findFirst as any).mockResolvedValue({ id: 'existing-id' });

            await authController.register(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(409);
            expect(jsonMock).toHaveBeenCalledWith({ message: 'User with this email or username already exists' });
        });

        it('should create user and return 201 on success', async () => {
            mockReq = {
                body: { name: 'newuser', email: 'new@example.com', password: 'password123' },
            };

            (prisma.user.findFirst as any).mockResolvedValue(null);
            (bcrypt.hash as any).mockResolvedValue('hashedPassword');
            (prisma.user.create as any).mockResolvedValue({
                id: 'new-id',
                username: 'newuser',
                email: 'new@example.com',
                isEmailVerified: false,
            });

            await authController.register(mockReq as Request, mockRes as Response);

            expect(prisma.user.create).toHaveBeenCalled();
            expect(sendVerificationEmail).toHaveBeenCalled();
            expect(sendAdminNotificationEmail).toHaveBeenCalled();
            expect(statusMock).toHaveBeenCalledWith(201);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                message: expect.stringContaining('User created successfully')
            }));
        });

        it('nie zapisuje żadnych pól planu — stary link /register?plan=LITE nic nie zmienia', async () => {
            mockReq = {
                body: { name: 'legacyuser', email: 'legacy@example.com', password: 'password123' },
            };

            (prisma.user.findFirst as any).mockResolvedValue(null);
            (bcrypt.hash as any).mockResolvedValue('hashedPassword');
            (prisma.user.create as any).mockResolvedValue({
                id: 'legacy-id',
                username: 'legacyuser',
                email: 'legacy@example.com',
                isEmailVerified: false,
            });

            await authController.register(mockReq as Request, mockRes as Response);

            // Rejestracja nie dotyka pól planu — pełny dostęp zapewniają defaulty w bazie
            // (migracja grant_all_access). Zapis czegokolwiek tutaj oznaczałby powrót gatingu.
            // `subscriptionStatus` i `trialEndsAt` nie istnieją już w schemacie, więc te dwie
            // asercje są z definicji spełnione — zostają jako bezpiecznik na wypadek, gdyby
            // ktoś kiedyś przywrócił pola razem z gatingiem. `plan` wciąż jest realną kolumną.
            const created = (prisma.user.create as any).mock.calls[0][0].data;
            expect(created.plan).toBeUndefined();
            expect(created.subscriptionStatus).toBeUndefined();
            expect(created.trialEndsAt).toBeUndefined();
        });
    });

    describe('login', () => {
        it('should return 400 if credentials missing', async () => {
            mockReq = { body: {} };
            await authController.login(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it('should return 401 if user not found', async () => {
            mockReq = { body: { email: 'unknown@example.com', password: 'pass' } };
            (prisma.user.findFirst as any).mockResolvedValue(null);

            await authController.login(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(401);
        });

        it('should return 401 if password invalid', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'wrong' } };
            const mockUser = { id: 'u1', password: 'hashed', isEmailVerified: true, failedLoginAttempts: 0, lockedUntil: null };
            (prisma.user.findFirst as any).mockResolvedValue(mockUser);
            (bcrypt.compare as any).mockResolvedValue(false);

            await authController.login(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(401);
        });

        it('should return 403 if email not verified', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'pass' } };
            const mockUser = { id: 'u1', password: 'hashed', isEmailVerified: false, failedLoginAttempts: 0, lockedUntil: null };
            (prisma.user.findFirst as any).mockResolvedValue(mockUser);
            (bcrypt.compare as any).mockResolvedValue(true);

            await authController.login(mockReq as Request, mockRes as Response);
            expect(statusMock).toHaveBeenCalledWith(403);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'EMAIL_NOT_VERIFIED' }));
        });

        it('should return token on success', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'pass' } };
            const mockUser = {
                id: 'u1', username: 'test', email: 'test@example.com',
                password: 'hashed', isEmailVerified: true,
                failedLoginAttempts: 0, lockedUntil: null, tokenVersion: 2
            };
            (prisma.user.findFirst as any).mockResolvedValue(mockUser);
            (bcrypt.compare as any).mockResolvedValue(true);
            (jwt.sign as any).mockReturnValue('mock-token');

            await authController.login(mockReq as Request, mockRes as Response);

            // B2: payload access tokenu musi nieść tokenVersion (weryfikowany w middleware)
            expect(jwt.sign).toHaveBeenCalledWith(
                expect.objectContaining({ userId: 'u1', tokenVersion: 2 }),
                expect.any(String),
                expect.anything(),
            );
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                token: 'mock-token',
                user: expect.objectContaining({ id: 'u1' })
            }));
        });
    });

    // Lockout per-konto (audyt B1): licznik nieudanych logowań niezależny od IP
    describe('login lockout', () => {
        const baseUser = {
            id: 'u1', username: 'test', email: 'test@example.com',
            password: 'hashed', isEmailVerified: true,
        };

        it('returns 429 ACCOUNT_LOCKED when lockedUntil is in the future, without comparing password', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'correct' } };
            (prisma.user.findFirst as any).mockResolvedValue({
                ...baseUser, failedLoginAttempts: 0,
                lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
            });

            await authController.login(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(429);
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'ACCOUNT_LOCKED' }));
            expect(bcrypt.compare).not.toHaveBeenCalled();
        });

        it('increments failedLoginAttempts on wrong password', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'wrong' } };
            (prisma.user.findFirst as any).mockResolvedValue({ ...baseUser, failedLoginAttempts: 3, lockedUntil: null });
            (bcrypt.compare as any).mockResolvedValue(false);

            await authController.login(mockReq as Request, mockRes as Response);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { failedLoginAttempts: 4 },
            });
            expect(statusMock).toHaveBeenCalledWith(401);
        });

        it('locks the account on 10th failed attempt', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'wrong' } };
            (prisma.user.findFirst as any).mockResolvedValue({ ...baseUser, failedLoginAttempts: 9, lockedUntil: null });
            (bcrypt.compare as any).mockResolvedValue(false);

            await authController.login(mockReq as Request, mockRes as Response);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { failedLoginAttempts: 0, lockedUntil: expect.any(Date) },
            });
        });

        it('allows login after lock expires and clears the counter', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'correct' } };
            (prisma.user.findFirst as any).mockResolvedValue({
                ...baseUser, failedLoginAttempts: 0,
                lockedUntil: new Date(Date.now() - 60 * 1000), // lock już wygasł
            });
            (bcrypt.compare as any).mockResolvedValue(true);
            (jwt.sign as any).mockReturnValue('mock-token');

            await authController.login(mockReq as Request, mockRes as Response);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { failedLoginAttempts: 0, lockedUntil: null },
            });
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ token: 'mock-token' }));
        });

        it('does not touch the counter on successful login when it is already clean', async () => {
            mockReq = { body: { email: 'test@example.com', password: 'correct' } };
            (prisma.user.findFirst as any).mockResolvedValue({ ...baseUser, failedLoginAttempts: 0, lockedUntil: null });
            (bcrypt.compare as any).mockResolvedValue(true);
            (jwt.sign as any).mockReturnValue('mock-token');

            await authController.login(mockReq as Request, mockRes as Response);

            expect(prisma.user.update).not.toHaveBeenCalled();
        });
    });

    // Audyt B2: zmiana/reset hasła unieważnia wszystkie sesje (bump tokenVersion,
    // revoke refresh tokenów i tokenów MCP) — atomowo, w jednej transakcji.
    describe('changePassword', () => {
        const authedReq = (body: any) => ({ body, user: { userId: 'u1', username: 'test' } }) as any;
        const dbUser = { id: 'u1', username: 'test', password: 'oldHashed', tokenVersion: 3 };

        it('revokes all sessions and returns fresh tokens on success', async () => {
            mockReq = authedReq({ currentPassword: 'old', newPassword: 'newPassword123' });
            (prisma.user.findUnique as any).mockResolvedValue(dbUser);
            (bcrypt.compare as any).mockResolvedValue(true);
            (bcrypt.hash as any).mockResolvedValue('newHashed');
            (prisma.user.update as any).mockResolvedValue({ ...dbUser, password: 'newHashed', tokenVersion: 4 });
            (prisma.refreshToken.updateMany as any).mockResolvedValue({ count: 2 });
            (prisma.mcpToken.updateMany as any).mockResolvedValue({ count: 1 });
            (jwt.sign as any).mockReturnValue('fresh-token');

            await authController.changePassword(mockReq as Request, mockRes as Response);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: expect.objectContaining({
                    password: 'newHashed',
                    tokenVersion: { increment: 1 },
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                }),
            });
            expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
                where: { userId: 'u1', revokedAt: null },
                data: { revokedAt: expect.any(Date) },
            });
            expect(prisma.mcpToken.updateMany).toHaveBeenCalledWith({
                where: { userId: 'u1', revokedAt: null },
                data: { revokedAt: expect.any(Date) },
            });
            // Świeża para dla bieżącego urządzenia — wydana PO revoke
            expect(prisma.refreshToken.create).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
                token: 'fresh-token',
                refreshToken: expect.any(String),
            }));
        });

        it('rejects wrong current password without touching sessions', async () => {
            mockReq = authedReq({ currentPassword: 'wrong', newPassword: 'newPassword123' });
            (prisma.user.findUnique as any).mockResolvedValue(dbUser);
            (bcrypt.compare as any).mockResolvedValue(false);

            await authController.changePassword(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(401);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.user.update).not.toHaveBeenCalled();
            expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
            expect(prisma.mcpToken.updateMany).not.toHaveBeenCalled();
        });

        it('rejects account without password set, without touching sessions', async () => {
            mockReq = authedReq({ currentPassword: 'irrelevant', newPassword: 'newPassword123' });
            (prisma.user.findUnique as any).mockResolvedValue({ ...dbUser, password: null });

            await authController.changePassword(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(401);
            expect(prisma.$transaction).not.toHaveBeenCalled();
        });
    });

    describe('resetPassword', () => {
        it('clears account lockout together with the password change', async () => {
            mockReq = { body: { token: 'reset-token', password: 'newPassword123' } };
            (prisma.user.findFirst as any).mockResolvedValue({ id: 'u1' });
            (bcrypt.hash as any).mockResolvedValue('newHashed');
            (prisma.user.update as any).mockResolvedValue({ id: 'u1', tokenVersion: 1 });

            await authController.resetPassword(mockReq as Request, mockRes as Response);

            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: expect.objectContaining({
                    password: 'newHashed',
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                }),
            });
        });

        it('revokes all sessions atomically with the password change (B2)', async () => {
            mockReq = { body: { token: 'reset-token', password: 'newPassword123' } };
            (prisma.user.findFirst as any).mockResolvedValue({ id: 'u1' });
            (bcrypt.hash as any).mockResolvedValue('newHashed');
            (prisma.user.update as any).mockResolvedValue({ id: 'u1', tokenVersion: 1 });

            await authController.resetPassword(mockReq as Request, mockRes as Response);

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: expect.objectContaining({
                    tokenVersion: { increment: 1 },
                    passwordResetToken: null,
                    passwordResetExpiresAt: null,
                }),
            });
            expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
                where: { userId: 'u1', revokedAt: null },
                data: { revokedAt: expect.any(Date) },
            });
            expect(prisma.mcpToken.updateMany).toHaveBeenCalledWith({
                where: { userId: 'u1', revokedAt: null },
                data: { revokedAt: expect.any(Date) },
            });
            // Reset NIE loguje — user świadomie loguje się nowym hasłem
            expect(jsonMock).toHaveBeenCalledWith(expect.not.objectContaining({ token: expect.anything() }));
        });

        it('rejects invalid/expired reset token without touching sessions', async () => {
            mockReq = { body: { token: 'bad-token', password: 'newPassword123' } };
            (prisma.user.findFirst as any).mockResolvedValue(null);

            await authController.resetPassword(mockReq as Request, mockRes as Response);

            expect(statusMock).toHaveBeenCalledWith(400);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
        });
    });
});
