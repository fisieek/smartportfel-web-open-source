import { Request, Response, NextFunction } from 'express';
import { verifyMcpToken, McpScope } from '../services/mcp/mcpTokenService';

export interface McpRequest extends Request {
    mcpUserId?: string;
    mcpScope?: McpScope;
}

// URL metadanych zasobu (RFC 9728). Klient bez tokenu dostaje 401 z tym nagłówkiem
// i rozpoczyna discovery → OAuth (Perplexity / Claude.ai-web). Bez MCP_OAUTH_ISSUER
// nagłówka nie wysyłamy — nie ma sensu wskazywać cudzej domeny (patrz routes/mcpOAuth.ts).
const RESOURCE_METADATA_URL = process.env.MCP_OAUTH_ISSUER?.trim()
    ? `${process.env.MCP_OAUTH_ISSUER.trim()}/.well-known/oauth-protected-resource/api/mcp`
    : null;

/**
 * Autoryzacja serwera MCP. Token przyjmowany z parametru ścieżki `:token`
 * (najprostsze dla „łączników") lub z nagłówka `Authorization: Bearer`.
 * Odmowy zwracamy w formacie błędu JSON-RPC, by klient MCP je zrozumiał.
 */
export const authenticateMcp = async (req: McpRequest, res: Response, next: NextFunction) => {
    const headerToken = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const token = (req.params.token || headerToken || '').trim();

    const result = await verifyMcpToken(token);
    if (!result.ok) {
        // Odmowa jest zawsze 401 (brak/nieważny/wygasły token) → wskaż metadane zasobu,
        // by klient wszedł w OAuth discovery. Bez skonfigurowanego issuera zostaje samo 401.
        if (RESOURCE_METADATA_URL) {
            res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`);
        }
        res.status(result.status).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: result.message },
            id: null,
        });
        return;
    }

    req.mcpUserId = result.userId;
    // Efektywny scope = min(scope tokenu, kanał transmisji). Token w ścieżce URL (req.params.token)
    // wycieka do logów, więc niezależnie od scope tokenu daje wyłącznie odczyt (obrona w głąb, bug I3).
    const viaPath = Boolean(req.params.token);
    req.mcpScope = (viaPath || result.scope === 'read') ? 'read' : 'write';
    next();
};
