import { Express, Router } from 'express';
import { createOAuthMetadata, mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { smartportfelOAuthProvider, OAUTH_SCOPE } from '../services/mcp/mcpOAuthProvider';
import { authenticateToken } from '../middleware/authMiddleware';
import { oauthRateLimit } from '../middleware/rateLimitMiddleware';
import { getAuthRequestInfo, approve } from '../controllers/oauthConsentController';
import { logger } from '../utils/logger';

/**
 * Kanoniczny issuer TEJ instancji — publiczny adres, pod którym stoi serwer.
 * Klienci MCP (Perplexity / Claude.ai) discover'ują metadane właśnie stąd.
 *
 * ŚWIADOMIE bez wartości domyślnej. Zaszyty adres oznaczałby, że każda postawiona
 * instancja odsyła cudzych użytkowników po autoryzację na serwer autora kodu.
 * Brak zmiennej = OAuth dla MCP po prostu się nie montuje, a reszta aplikacji
 * (razem z samym protokołem MCP na tokenie z Ustawień) działa normalnie.
 */
export const MCP_OAUTH_ISSUER = process.env.MCP_OAUTH_ISSUER?.trim() || null;

/**
 * Montuje serwer OAuth 2.1 + DCR dla MCP. Wołane PRZED readiness-middleware (tylko Prisma+JWT).
 *
 * SDK twardo montuje endpointy w root (/authorize, /register…), co kolidowałoby z SPA /register
 * i wymagałoby method-aware routingu na warstwie hostingu. Dlatego składamy handlery RĘCZNIE pod
 * /api/oauth/* (objęte istniejącym rewrite /api/* — bez kolizji), a metadane .well-known
 * (RFC 8414 + 9728) zostawiamy w root z URL-ami endpointów wskazującymi na /api/oauth/*.
 */
export function registerMcpOAuth(app: Express): void {
    if (!MCP_OAUTH_ISSUER) {
        logger.warn(
            '[MCP] MCP_OAUTH_ISSUER nie ustawiony — OAuth dla klientów MCP (Perplexity, Claude.ai-web) ' +
            'jest WYŁĄCZONY. Ustaw publiczny adres tej instancji, np. https://twoja-domena.pl. ' +
            'Tokeny MCP generowane w Ustawieniach działają niezależnie od tej zmiennej.'
        );
        return;
    }

    const issuerUrl = new URL(MCP_OAUTH_ISSUER);

    const metadata = createOAuthMetadata({
        provider: smartportfelOAuthProvider,
        issuerUrl,
        scopesSupported: [OAUTH_SCOPE],
    });
    // Przekieruj endpointy pod /api/oauth/* (zamiast root) — bez zmiany issuera.
    metadata.authorization_endpoint = new URL('/api/oauth/authorize', issuerUrl).href;
    metadata.token_endpoint = new URL('/api/oauth/token', issuerUrl).href;
    metadata.registration_endpoint = new URL('/api/oauth/register', issuerUrl).href;
    metadata.revocation_endpoint = new URL('/api/oauth/revoke', issuerUrl).href;

    // .well-known/oauth-authorization-server + .well-known/oauth-protected-resource/api/mcp (root)
    app.use(
        mcpAuthMetadataRouter({
            oauthMetadata: metadata,
            resourceServerUrl: new URL('/api/mcp', issuerUrl),
            scopesSupported: [OAUTH_SCOPE],
            resourceName: 'SmartPortfel MCP',
        }),
    );

    // Endpointy OAuth + zgoda — pod /api/oauth/*
    // `rateLimit` podmienia domyślny MemoryStore SDK na współdzielony store w Postgresie —
    // bez tego limity są w serverless fikcją, a /register jest publiczny (patrz oauthRateLimit).
    const oauth = Router();
    oauth.use('/authorize', authorizationHandler({ provider: smartportfelOAuthProvider, rateLimit: oauthRateLimit('authorize') }));
    oauth.use('/token', tokenHandler({ provider: smartportfelOAuthProvider, rateLimit: oauthRateLimit('token') }));
    oauth.use('/register', clientRegistrationHandler({ clientsStore: smartportfelOAuthProvider.clientsStore, rateLimit: oauthRateLimit('register') }));
    oauth.use('/revoke', revocationHandler({ provider: smartportfelOAuthProvider, rateLimit: oauthRateLimit('revoke') }));

    // Publiczny: dane do ekranu zgody.
    oauth.get('/authrequest', getAuthRequestInfo);
    // Chroniony: zgodę wydaje tylko zalogowany użytkownik.
    const approveRouter = Router();
    approveRouter.use(authenticateToken);
    approveRouter.post('/', approve);
    oauth.use('/approve', approveRouter);

    app.use('/api/oauth', oauth);
}
