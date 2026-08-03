import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import prisma from '../../lib/prisma';
import {
    mintOAuthToken,
    rotateOAuthToken,
    revokeOAuthTokenByValue,
    verifyMcpToken,
    OAUTH_ACCESS_TTL_SECONDS,
} from './mcpTokenService';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError, ServerError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

// Pojedynczy scope — pełny dostęp do narzędzi MCP (czytaj/pisz), jak token-in-URL.
export const OAUTH_SCOPE = 'mcp';
const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 min
const AUTH_REQUEST_TTL_S = 10 * 60; // podpisany authRequest ważny 10 min

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const jwtSecret = () => process.env.JWT_SECRET as string;

// ── Podpisany "authorization request" (przekazywany do SPA i z powrotem) ──────
// Nie zawiera userId — usera ustalamy dopiero na ekranie zgody (z JWT z localStorage).
export interface AuthRequestPayload {
    client_id: string;
    client_name?: string;
    redirect_uri: string;
    code_challenge: string;
    scope: string;
    state?: string;
    resource?: string;
}

export const signAuthRequest = (p: AuthRequestPayload): string =>
    jwt.sign({ ...p, purpose: 'mcp_oauth_authreq' }, jwtSecret(), { expiresIn: AUTH_REQUEST_TTL_S, algorithm: 'HS256' });

export const verifyAuthRequest = (token: string): AuthRequestPayload => {
    const decoded = jwt.verify(token, jwtSecret(), { algorithms: ['HS256'] }) as any;
    if (decoded?.purpose !== 'mcp_oauth_authreq') throw new Error('Nieprawidłowy authRequest');
    return decoded as AuthRequestPayload;
};

/**
 * Po zgodzie użytkownika: mintuje kod autoryzacyjny związany z userId + parametrami
 * z (zaufanego, podpisanego) authRequest i buduje URL powrotny do klienta MCP.
 */
export const issueAuthorizationCode = async (
    userId: string,
    p: AuthRequestPayload,
): Promise<{ redirectUrl: string }> => {
    const code = `sp_ac_${crypto.randomBytes(32).toString('base64url')}`;
    await prisma.mcpAuthCode.create({
        data: {
            codeHash: sha256(code),
            userId,
            clientId: p.client_id,
            codeChallenge: p.code_challenge,
            redirectUri: p.redirect_uri,
            scope: p.scope || OAUTH_SCOPE,
            resource: p.resource ?? null,
            expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
        },
    });
    const url = new URL(p.redirect_uri);
    url.searchParams.set('code', code);
    if (p.state) url.searchParams.set('state', p.state);
    return { redirectUrl: url.href };
};

// ── Magazyn klientów (Dynamic Client Registration) ────────────────────────────
const toClientInfo = (c: NonNullable<Awaited<ReturnType<typeof prisma.mcpOAuthClient.findUnique>>>): OAuthClientInformationFull => ({
    client_id: c.clientId,
    client_secret: c.clientSecret ?? undefined,
    client_secret_expires_at: c.clientSecretExpiresAt
        ? Math.floor(c.clientSecretExpiresAt.getTime() / 1000)
        : (c.clientSecret ? 0 : undefined),
    redirect_uris: c.redirectUris,
    grant_types: c.grantTypes,
    token_endpoint_auth_method: c.tokenEndpointAuthMethod ?? undefined,
    client_name: c.clientName ?? undefined,
} as OAuthClientInformationFull);

const clientsStore: OAuthRegisteredClientsStore = {
    async getClient(clientId) {
        const c = await prisma.mcpOAuthClient.findUnique({ where: { clientId } });
        return c ? toClientInfo(c) : undefined;
    },
    // SDK generuje client_id i client_secret i przekazuje pełny obiekt; my zapisujemy i zwracamy as-is.
    async registerClient(client: any) {
        await prisma.mcpOAuthClient.create({
            data: {
                clientId: client.client_id,
                clientName: client.client_name ?? null,
                redirectUris: (client.redirect_uris ?? []).map(String),
                grantTypes: client.grant_types ?? ['authorization_code', 'refresh_token'],
                tokenEndpointAuthMethod: client.token_endpoint_auth_method ?? null,
                clientSecret: client.client_secret ?? null,
                clientSecretExpiresAt:
                    client.client_secret_expires_at && client.client_secret_expires_at > 0
                        ? new Date(client.client_secret_expires_at * 1000)
                        : null,
            },
        });
        return client as OAuthClientInformationFull;
    },
};

// Origin bieżącego żądania — bez zaszywania URL-a, więc działa pod dowolną domeną.
const originFromReq = (req: Request): string => {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
    const host = req.get('host');
    return `${proto}://${host}`;
};

// ── Provider ──────────────────────────────────────────────────────────────────
export const smartportfelOAuthProvider: OAuthServerProvider = {
    get clientsStore() {
        return clientsStore;
    },

    // Nie znamy jeszcze usera (brak ciasteczka serwerowego) → podpisz parametry i przekieruj do SPA.
    async authorize(client, params: AuthorizationParams, res: Response): Promise<void> {
        const token = signAuthRequest({
            client_id: client.client_id,
            client_name: (client as any).client_name,
            redirect_uri: params.redirectUri,
            code_challenge: params.codeChallenge,
            scope: (params.scopes && params.scopes.length ? params.scopes : [OAUTH_SCOPE]).join(' '),
            state: params.state,
            resource: params.resource?.href,
        });
        const url = new URL('/oauth/consent', originFromReq(res.req as Request));
        url.searchParams.set('req', token);
        res.redirect(url.href);
    },

    async challengeForAuthorizationCode(client, authorizationCode): Promise<string> {
        const rec = await prisma.mcpAuthCode.findUnique({ where: { codeHash: sha256(authorizationCode) } });
        if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Nieprawidłowy kod autoryzacyjny');
        return rec.codeChallenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri): Promise<OAuthTokens> {
        const rec = await prisma.mcpAuthCode.findUnique({ where: { codeHash: sha256(authorizationCode) } });
        if (!rec || rec.clientId !== client.client_id) throw new InvalidGrantError('Nieprawidłowy kod autoryzacyjny');
        if (rec.usedAt) throw new InvalidGrantError('Kod autoryzacyjny już użyty');
        if (rec.expiresAt < new Date()) throw new InvalidGrantError('Kod autoryzacyjny wygasł');
        if (redirectUri && redirectUri !== rec.redirectUri) throw new InvalidGrantError('Niezgodny redirect_uri');
        // PKCE (S256) walidowane lokalnie przez SDK (skipLocalPkceValidation niewłączone).

        // Jednorazowość kodu MUSI być rozstrzygnięta atomowo: sprawdzenie `usedAt` wyżej to tylko
        // tani fast-path, a między nim a zapisem mieści się drugie żądanie — dwa równoległe /token
        // z tym samym kodem wyminowałyby dwa komplety tokenów (TOCTOU). `usedAt: null` w `where`
        // przenosi rozstrzygnięcie do bazy: dokładnie jedno żądanie dostanie count === 1.
        const claimed = await prisma.mcpAuthCode.updateMany({
            where: { id: rec.id, usedAt: null },
            data: { usedAt: new Date() },
        });
        if (claimed.count !== 1) throw new InvalidGrantError('Kod autoryzacyjny już użyty');

        const { accessToken, refreshToken, expiresInSeconds } = await mintOAuthToken(rec.userId, {
            clientId: client.client_id,
            name: (client as any).client_name || 'OAuth',
        });
        return {
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: expiresInSeconds,
            scope: rec.scope,
            refresh_token: refreshToken,
        };
    },

    async exchangeRefreshToken(client, refreshToken): Promise<OAuthTokens> {
        const rotated = await rotateOAuthToken(refreshToken);
        if (!rotated) throw new InvalidGrantError('Nieprawidłowy refresh token');
        return {
            access_token: rotated.accessToken,
            token_type: 'Bearer',
            expires_in: rotated.expiresInSeconds,
            scope: OAUTH_SCOPE,
            refresh_token: rotated.refreshToken,
        };
    },

    async verifyAccessToken(token): Promise<AuthInfo> {
        const result = await verifyMcpToken(token);
        if (!result.ok) throw new InvalidTokenError(result.message);
        return {
            token,
            clientId: result.clientId ?? 'smartportfel',
            scopes: [OAUTH_SCOPE],
            expiresAt: Math.floor(Date.now() / 1000) + OAUTH_ACCESS_TTL_SECONDS,
        };
    },

    async revokeToken(_client, request: OAuthTokenRevocationRequest): Promise<void> {
        try {
            await revokeOAuthTokenByValue(request.token);
        } catch {
            throw new ServerError('Nie udało się odwołać tokenu');
        }
    },
};
