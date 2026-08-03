import crypto from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import prisma from '../../lib/prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

const TOKEN_PREFIX = 'sp_mcp_';
const PREFIX_DISPLAY_LEN = TOKEN_PREFIX.length + 6; // np. "sp_mcp_ab12cd"

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// Zakres uprawnień tokenu (bug I3). "read" = tylko odczyt (token-in-URL), "write" = pełny (OAuth/Bearer header).
export type McpScope = 'read' | 'write';

export interface McpTokenListItem {
    id: string;
    prefix: string;
    name: string | null;
    scope: McpScope;
    lastUsedAt: Date | null;
    createdAt: Date;
}

/**
 * Tworzy nowy token MCP dla użytkownika. Zwraca JAWNY token (do pokazania RAZ)
 * oraz dane do listy. W bazie trzymamy wyłącznie hash SHA-256.
 * `scope` domyślnie 'read' — token przekazywany w URL nie może dawać zapisu (wyciek do logów).
 */
export const generateMcpToken = async (userId: string, name?: string, scope: McpScope = 'read') => {
    const secret = crypto.randomBytes(32).toString('base64url');
    const token = `${TOKEN_PREFIX}${secret}`;

    const record = await prisma.mcpToken.create({
        data: {
            userId,
            tokenHash: hash(token),
            prefix: token.slice(0, PREFIX_DISPLAY_LEN),
            name: name?.trim() || null,
            scope,
        },
    });

    return {
        token, // jawny — pokazujemy raz
        id: record.id,
        prefix: record.prefix,
        name: record.name,
        scope: record.scope as McpScope,
        createdAt: record.createdAt,
    };
};

export type McpVerifyResult =
    | { ok: true; userId: string; clientId: string | null; scope: McpScope }
    | { ok: false; status: 401; message: string };

/**
 * Weryfikuje token MCP: musi istnieć, nie być odwołany i nie być wygasły.
 * Aktualizuje lastUsedAt. Zwraca userId lub powód odmowy.
 */
export const verifyMcpToken = async (token: string): Promise<McpVerifyResult> => {
    if (!token || !token.startsWith(TOKEN_PREFIX)) {
        return { ok: false, status: 401, message: 'Nieprawidłowy token MCP' };
    }

    const record = await prisma.mcpToken.findUnique({
        where: { tokenHash: hash(token) },
    });

    if (!record || record.revokedAt) {
        return { ok: false, status: 401, message: 'Token MCP nieważny lub odwołany' };
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
        return { ok: false, status: 401, message: 'Token MCP wygasł' };
    }

    // Best-effort aktualizacja lastUsedAt (nie blokuje żądania)
    prisma.mcpToken
        .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
        .catch(() => { /* ignore */ });

    return { ok: true, userId: record.userId, clientId: record.clientId, scope: record.scope as McpScope };
};

// ── OAuth: access/refresh tokeny jako McpToken (kind="oauth") ──────────────────
const OAUTH_REFRESH_PREFIX = 'sp_rt_';
export const OAUTH_ACCESS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 dni

/**
 * Mintuje parę access+refresh dla flow OAuth (Perplexity/Claude.ai-web). Access token
 * to zwykły token MCP (sp_mcp_…), więc obsługuje go istniejący verifyMcpToken/endpoint.
 * Zwraca JAWNE tokeny (przekazywane klientowi raz). W bazie tylko hashe.
 */
export const mintOAuthToken = async (
    userId: string,
    opts: { clientId: string; name?: string },
) => {
    const accessToken = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const refreshToken = `${OAUTH_REFRESH_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + OAUTH_ACCESS_TTL_SECONDS * 1000);

    await prisma.mcpToken.create({
        data: {
            userId,
            tokenHash: hash(accessToken),
            prefix: accessToken.slice(0, PREFIX_DISPLAY_LEN),
            name: opts.name ?? null,
            kind: 'oauth',
            scope: 'write', // OAuth nigdy nie kładzie tokenu w URL → pełny dostęp
            clientId: opts.clientId,
            expiresAt,
            refreshHash: hash(refreshToken),
        },
    });

    return { accessToken, refreshToken, expiresInSeconds: OAUTH_ACCESS_TTL_SECONDS };
};

/** Rotacja refresh→nowy access+refresh (odwołuje stary). Zwraca null gdy refresh nieważny. */
export const rotateOAuthToken = async (refreshToken: string) => {
    if (!refreshToken || !refreshToken.startsWith(OAUTH_REFRESH_PREFIX)) return null;
    const old = await prisma.mcpToken.findUnique({ where: { refreshHash: hash(refreshToken) } });
    if (!old || old.revokedAt || old.kind !== 'oauth' || !old.clientId) return null;
    await prisma.mcpToken.update({ where: { id: old.id }, data: { revokedAt: new Date() } });
    return mintOAuthToken(old.userId, { clientId: old.clientId, name: old.name ?? undefined });
};

/** Odwołuje token OAuth po wartości access LUB refresh (RFC 7009). */
export const revokeOAuthTokenByValue = async (token: string): Promise<void> => {
    const h = hash(token);
    await prisma.mcpToken.updateMany({
        where: { OR: [{ tokenHash: h }, { refreshHash: h }], revokedAt: null },
        data: { revokedAt: new Date() },
    });
};

export const listMcpTokens = async (userId: string): Promise<McpTokenListItem[]> => {
    const rows = await prisma.mcpToken.findMany({
        where: { userId, revokedAt: null },
        select: { id: true, prefix: true, name: true, scope: true, lastUsedAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r, scope: r.scope as McpScope }));
};

/**
 * Odwołuje WSZYSTKIE aktywne tokeny MCP użytkownika (manual + oauth) — używane przy
 * zmianie/resecie hasła, żeby odzyskanie konta odcinało też łączniki Claude/Perplexity.
 * Przyjmuje opcjonalnie klienta transakcji. Zwraca liczbę odwołanych tokenów.
 */
export const revokeAllUserMcpTokens = async (userId: string, db: DbClient = prisma): Promise<number> => {
    const { count } = await db.mcpToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    return count;
};

/** Odwołuje token (soft-delete przez revokedAt). Zwraca false, jeśli nie należy do usera. */
export const revokeMcpToken = async (userId: string, id: string): Promise<boolean> => {
    const record = await prisma.mcpToken.findFirst({ where: { id, userId, revokedAt: null } });
    if (!record) return false;
    await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return true;
};
