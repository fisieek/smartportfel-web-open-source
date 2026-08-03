import { vi, describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import { generateMcpToken, verifyMcpToken, revokeMcpToken, mintOAuthToken } from '../mcpTokenService';
import prisma from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
    default: {
        mcpToken: {
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
    },
}));

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

describe('mcpTokenService', () => {
    beforeEach(() => vi.clearAllMocks());

    it('generate: zwraca jawny token sp_mcp_*, zapisuje HASH (nie jawny token) i prefix', async () => {
        (prisma.mcpToken.create as any).mockImplementation(async ({ data }: any) => ({ id: 't1', createdAt: new Date(), ...data }));
        const res = await generateMcpToken('u1', 'Mój Claude');

        expect(res.token.startsWith('sp_mcp_')).toBe(true);
        const arg = (prisma.mcpToken.create as any).mock.calls[0][0].data;
        expect(arg.userId).toBe('u1');
        expect(arg.tokenHash).toBe(sha(res.token));
        expect(arg.tokenHash).not.toBe(res.token); // trzymamy hash, nie jawny token
        expect(res.token.startsWith(arg.prefix)).toBe(true);
        expect(arg.name).toBe('Mój Claude');
    });

    it('verify: poprawny token → ok z userId', async () => {
        (prisma.mcpToken.findUnique as any).mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null, scope: 'read' });
        (prisma.mcpToken.update as any).mockResolvedValue({}); // best-effort lastUsedAt
        const r = await verifyMcpToken('sp_mcp_abc');
        expect(r).toMatchObject({ ok: true, userId: 'u1' });
    });

    it('generate: domyślnie scope=read; jawne write zapisuje write (bug I3)', async () => {
        (prisma.mcpToken.create as any).mockImplementation(async ({ data }: any) => ({ id: 't1', createdAt: new Date(), ...data }));

        const readTok = await generateMcpToken('u1');
        expect((prisma.mcpToken.create as any).mock.calls[0][0].data.scope).toBe('read');
        expect(readTok.scope).toBe('read');

        const writeTok = await generateMcpToken('u1', 'Pełny', 'write');
        expect((prisma.mcpToken.create as any).mock.calls[1][0].data.scope).toBe('write');
        expect(writeTok.scope).toBe('write');
    });

    it('verify: zwraca scope z rekordu (write)', async () => {
        (prisma.mcpToken.findUnique as any).mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: null, scope: 'write', clientId: null });
        (prisma.mcpToken.update as any).mockResolvedValue({});
        const r = await verifyMcpToken('sp_mcp_abc');
        expect(r).toMatchObject({ ok: true, userId: 'u1', scope: 'write' });
    });

    it('mintOAuthToken: token OAuth dostaje scope=write (nigdy nie ląduje w URL)', async () => {
        (prisma.mcpToken.create as any).mockResolvedValue({});
        await mintOAuthToken('u1', { clientId: 'client-abc' });
        expect((prisma.mcpToken.create as any).mock.calls[0][0].data.scope).toBe('write');
    });

    it('verify: zły format → 401', async () => {
        const r = await verifyMcpToken('garbage');
        expect(r).toMatchObject({ ok: false, status: 401 });
        expect((prisma.mcpToken.findUnique as any)).not.toHaveBeenCalled();
    });

    it('verify: brak rekordu lub odwołany → 401', async () => {
        (prisma.mcpToken.findUnique as any).mockResolvedValue(null);
        expect(await verifyMcpToken('sp_mcp_x')).toMatchObject({ ok: false, status: 401 });

        (prisma.mcpToken.findUnique as any).mockResolvedValue({ id: 't1', userId: 'u1', revokedAt: new Date() });
        expect(await verifyMcpToken('sp_mcp_x')).toMatchObject({ ok: false, status: 401 });
    });

    it('verify: token po expiresAt → 401', async () => {
        (prisma.mcpToken.findUnique as any).mockResolvedValue({
            id: 't1', userId: 'u1', revokedAt: null, scope: 'read', clientId: null,
            expiresAt: new Date(Date.now() - 1000),
        });
        expect(await verifyMcpToken('sp_mcp_x')).toMatchObject({ ok: false, status: 401 });
    });

    it('revoke: ustawia revokedAt gdy token należy do usera; false gdy nie', async () => {
        (prisma.mcpToken.findFirst as any).mockResolvedValueOnce({ id: 't1', userId: 'u1' });
        (prisma.mcpToken.update as any).mockResolvedValue({});
        expect(await revokeMcpToken('u1', 't1')).toBe(true);

        (prisma.mcpToken.findFirst as any).mockResolvedValueOnce(null);
        expect(await revokeMcpToken('u1', 'nope')).toBe(false);
    });
});
