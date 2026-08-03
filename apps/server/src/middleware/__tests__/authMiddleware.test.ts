import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma';
import { authenticateToken, AuthRequest } from '../authMiddleware';

// Realny jsonwebtoken (testujemy prawdziwe payloady), mock tylko DB i raportowania błędów.
vi.mock('../../lib/prisma', () => ({
    default: {
        user: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock('../../lib/reportError', () => ({
    captureServerError: vi.fn(),
}));

const SECRET = 'test-secret';

describe('authenticateToken (B2: weryfikacja tokenVersion)', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let jsonMock: ReturnType<typeof vi.fn>;
    let statusMock: ReturnType<typeof vi.fn>;
    let nextMock: ReturnType<typeof vi.fn>;

    const reqWithToken = (token: string | null): Partial<AuthRequest> => ({
        headers: token ? { authorization: `Bearer ${token}` } : {},
    });

    const sign = (payload: object) => jwt.sign(payload, SECRET, { expiresIn: '7d' });

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.JWT_SECRET = SECRET;
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        mockRes = { status: statusMock as any, json: jsonMock as any };
        nextMock = vi.fn();
    });

    it('calls next() when tokenVersion matches DB', async () => {
        (prisma.user.findUnique as any).mockResolvedValue({ tokenVersion: 3 });
        mockReq = reqWithToken(sign({ userId: 'u1', username: 'test', tokenVersion: 3 }));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(nextMock).toHaveBeenCalled();
        expect(mockReq.user).toEqual({ userId: 'u1', username: 'test' });
        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 'u1' },
            select: { tokenVersion: true },
        });
    });

    it('returns 403 TOKEN_INVALID when tokenVersion is stale (sessions revoked)', async () => {
        (prisma.user.findUnique as any).mockResolvedValue({ tokenVersion: 4 });
        mockReq = reqWithToken(sign({ userId: 'u1', username: 'test', tokenVersion: 3 }));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
        expect(nextMock).not.toHaveBeenCalled();
    });

    it('treats legacy token without tokenVersion field as version 0 (backward compat)', async () => {
        (prisma.user.findUnique as any).mockResolvedValue({ tokenVersion: 0 });
        mockReq = reqWithToken(sign({ userId: 'u1', username: 'test' })); // token sprzed wdrożenia

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(nextMock).toHaveBeenCalled();
    });

    it('rejects legacy token once the version has been bumped', async () => {
        (prisma.user.findUnique as any).mockResolvedValue({ tokenVersion: 1 });
        mockReq = reqWithToken(sign({ userId: 'u1', username: 'test' }));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
    });

    it('returns 403 TOKEN_INVALID when user no longer exists (deleted account)', async () => {
        (prisma.user.findUnique as any).mockResolvedValue(null);
        mockReq = reqWithToken(sign({ userId: 'ghost', username: 'test', tokenVersion: 0 }));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
    });

    it('returns 401 NO_TOKEN when no token is provided', async () => {
        mockReq = reqWithToken(null);

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'NO_TOKEN' }));
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('returns 403 TOKEN_INVALID for a malformed/mis-signed JWT without hitting DB', async () => {
        mockReq = reqWithToken(jwt.sign({ userId: 'u1' }, 'wrong-secret'));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('fails closed with 500 when the DB check errors', async () => {
        (prisma.user.findUnique as any).mockRejectedValue(new Error('db down'));
        mockReq = reqWithToken(sign({ userId: 'u1', username: 'test', tokenVersion: 0 }));

        await authenticateToken(mockReq as AuthRequest, mockRes as Response, nextMock);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(nextMock).not.toHaveBeenCalled();
    });
});
