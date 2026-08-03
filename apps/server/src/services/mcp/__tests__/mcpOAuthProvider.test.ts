import { vi, describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-0123456789';

vi.mock('../../../lib/prisma', () => ({
    default: {
        mcpToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        mcpAuthCode: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        mcpOAuthClient: { create: vi.fn(), findUnique: vi.fn() },
    },
}));

import prisma from '../../../lib/prisma';
import {
    signAuthRequest,
    verifyAuthRequest,
    issueAuthorizationCode,
    smartportfelOAuthProvider,
    type AuthRequestPayload,
} from '../mcpOAuthProvider';

const sha = (t: string) => crypto.createHash('sha256').update(t).digest('hex');
const client = { client_id: 'client-1', redirect_uris: ['https://perplexity.ai/cb'] } as any;
const basePayload: AuthRequestPayload = {
    client_id: 'client-1',
    client_name: 'Perplexity',
    redirect_uri: 'https://perplexity.ai/cb',
    code_challenge: 'CHALLENGE_XYZ',
    scope: 'mcp',
    state: 'st8',
};

describe('mcpOAuthProvider', () => {
    beforeEach(() => vi.clearAllMocks());

    it('signAuthRequest/verifyAuthRequest: round-trip zwraca payload', () => {
        const token = signAuthRequest(basePayload);
        const decoded = verifyAuthRequest(token);
        expect(decoded.client_id).toBe('client-1');
        expect(decoded.code_challenge).toBe('CHALLENGE_XYZ');
        expect(decoded.redirect_uri).toBe('https://perplexity.ai/cb');
    });

    it('verifyAuthRequest: odrzuca podrobiony/obcy token', () => {
        const forged = crypto.randomBytes(20).toString('hex');
        expect(() => verifyAuthRequest(forged)).toThrow();
    });

    it('DCR: registerClient zapisuje klienta i zwraca go; getClient mapuje wiersz', async () => {
        (prisma.mcpOAuthClient.create as any).mockResolvedValue({});
        const input = {
            client_id: 'c-new',
            client_secret: 'sek',
            redirect_uris: ['https://x/cb'],
            grant_types: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_method: 'client_secret_post',
            client_secret_expires_at: 0,
        } as any;
        const out = await smartportfelOAuthProvider.clientsStore.registerClient!(input);
        expect(out.client_id).toBe('c-new');
        expect((prisma.mcpOAuthClient.create as any)).toHaveBeenCalledOnce();

        (prisma.mcpOAuthClient.findUnique as any).mockResolvedValue({
            clientId: 'c-new', clientName: 'X', redirectUris: ['https://x/cb'],
            grantTypes: ['authorization_code'], tokenEndpointAuthMethod: 'none',
            clientSecret: null, clientSecretExpiresAt: null,
        });
        const got = await smartportfelOAuthProvider.clientsStore.getClient('c-new');
        expect(got?.client_id).toBe('c-new');
        expect(got?.redirect_uris).toEqual(['https://x/cb']);
    });

    it('issueAuthorizationCode: tworzy kod (hash) i buduje redirect z code+state', async () => {
        let captured: any;
        (prisma.mcpAuthCode.create as any).mockImplementation(async ({ data }: any) => { captured = data; return data; });
        const { redirectUrl } = await issueAuthorizationCode('u1', basePayload);
        expect(captured.userId).toBe('u1');
        expect(captured.codeChallenge).toBe('CHALLENGE_XYZ');
        // przechowujemy hash, nie jawny kod
        expect(captured.codeHash).toMatch(/^[a-f0-9]{64}$/);
        const u = new URL(redirectUrl);
        expect(u.origin + u.pathname).toBe('https://perplexity.ai/cb');
        expect(u.searchParams.get('code')).toBeTruthy();
        expect(u.searchParams.get('state')).toBe('st8');
    });

    it('challengeForAuthorizationCode: zwraca zapisany challenge, rzuca przy obcym kliencie', async () => {
        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({ clientId: 'client-1', codeChallenge: 'CHALLENGE_XYZ' });
        await expect(smartportfelOAuthProvider.challengeForAuthorizationCode(client, 'sp_ac_abc')).resolves.toBe('CHALLENGE_XYZ');

        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({ clientId: 'inny', codeChallenge: 'x' });
        await expect(smartportfelOAuthProvider.challengeForAuthorizationCode(client, 'sp_ac_abc')).rejects.toThrow();
    });

    it('exchangeAuthorizationCode: ważny kod → tokeny + oznacza użyty + mintuje McpToken', async () => {
        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({
            id: 'ac1', clientId: 'client-1', userId: 'u1', codeChallenge: 'c',
            redirectUri: 'https://perplexity.ai/cb', scope: 'mcp', resource: null,
            usedAt: null, expiresAt: new Date(Date.now() + 60000),
        });
        (prisma.mcpAuthCode.updateMany as any).mockResolvedValue({ count: 1 });
        (prisma.mcpToken.create as any).mockResolvedValue({});

        const tokens = await smartportfelOAuthProvider.exchangeAuthorizationCode(client, 'sp_ac_abc', undefined, 'https://perplexity.ai/cb');
        expect(tokens.access_token).toMatch(/^sp_mcp_/);
        expect(tokens.refresh_token).toMatch(/^sp_rt_/);
        expect(tokens.token_type).toBe('Bearer');
        // `usedAt: null` w WHERE to cała istota naprawy TOCTOU — asercja musi patrzeć na argument,
        // bo mock Prismy sam z siebie nie sprawdza warunku.
        expect((prisma.mcpAuthCode.updateMany as any)).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'ac1', usedAt: null } })
        );
        expect((prisma.mcpToken.create as any)).toHaveBeenCalledOnce();
    });

    it('exchangeAuthorizationCode: kod przejęty równolegle (count=0) → błąd i ZERO mintowania', async () => {
        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({
            id: 'ac1', clientId: 'client-1', userId: 'u1', codeChallenge: 'c',
            redirectUri: 'https://perplexity.ai/cb', scope: 'mcp', resource: null,
            usedAt: null, expiresAt: new Date(Date.now() + 60000),
        });
        // Wyścig: drugie żądanie widzi jeszcze usedAt=null, ale bazę przejęło już pierwsze.
        (prisma.mcpAuthCode.updateMany as any).mockResolvedValue({ count: 0 });

        await expect(
            smartportfelOAuthProvider.exchangeAuthorizationCode(client, 'sp_ac_abc', undefined, 'https://perplexity.ai/cb')
        ).rejects.toThrow();
        expect((prisma.mcpToken.create as any)).not.toHaveBeenCalled();
    });

    it('exchangeAuthorizationCode: kod użyty / wygasły / zły redirect → błąd', async () => {
        const base = { id: 'ac1', clientId: 'client-1', userId: 'u1', codeChallenge: 'c', redirectUri: 'https://perplexity.ai/cb', scope: 'mcp', resource: null };
        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({ ...base, usedAt: new Date(), expiresAt: new Date(Date.now() + 60000) });
        await expect(smartportfelOAuthProvider.exchangeAuthorizationCode(client, 'x', undefined, 'https://perplexity.ai/cb')).rejects.toThrow();

        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({ ...base, usedAt: null, expiresAt: new Date(Date.now() - 1000) });
        await expect(smartportfelOAuthProvider.exchangeAuthorizationCode(client, 'x', undefined, 'https://perplexity.ai/cb')).rejects.toThrow();

        (prisma.mcpAuthCode.findUnique as any).mockResolvedValue({ ...base, usedAt: null, expiresAt: new Date(Date.now() + 60000) });
        await expect(smartportfelOAuthProvider.exchangeAuthorizationCode(client, 'x', undefined, 'https://evil/cb')).rejects.toThrow();
    });

    it('verifyAccessToken: ważny token → AuthInfo; nieważny → rzuca', async () => {
        (prisma.mcpToken.findUnique as any).mockResolvedValue({
            id: 't1', userId: 'u1', revokedAt: null, expiresAt: new Date(Date.now() + 60000),
            clientId: 'client-1', kind: 'oauth',
        });
        (prisma.mcpToken.update as any).mockResolvedValue({});
        const info = await smartportfelOAuthProvider.verifyAccessToken('sp_mcp_valid');
        expect(info.clientId).toBe('client-1');
        expect(info.scopes).toContain('mcp');

        (prisma.mcpToken.findUnique as any).mockResolvedValue(null);
        await expect(smartportfelOAuthProvider.verifyAccessToken('sp_mcp_bad')).rejects.toThrow();
    });
});
