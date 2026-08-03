import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { verifyAuthRequest, issueAuthorizationCode } from '../services/mcp/mcpOAuthProvider';

/**
 * Publiczny: zwraca dane do wyświetlenia na ekranie zgody (nazwa klienta, dokąd wróci).
 * Weryfikuje podpis authRequest, ale nie wymaga logowania (samo wyświetlenie).
 */
export const getAuthRequestInfo = async (req: Request, res: Response): Promise<void> => {
    try {
        const p = verifyAuthRequest(String(req.query.req || ''));
        let redirectHost = '';
        try {
            redirectHost = new URL(p.redirect_uri).host;
        } catch {
            /* ignore */
        }
        res.json({ clientName: p.client_name || 'Aplikacja zewnętrzna', scope: p.scope, redirectHost });
    } catch {
        res.status(400).json({ message: 'Link autoryzacji wygasł lub jest nieprawidłowy.' });
    }
};

/**
 * Zatwierdzenie/odrzucenie zgody. Wymaga zalogowanego usera PRO (middleware na trasie).
 * Allow → mintuje kod autoryzacyjny i zwraca URL powrotny do klienta MCP.
 * Deny  → zwraca URL powrotny z error=access_denied.
 */
export const approve = async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ message: 'Wymagane logowanie' });
        return;
    }

    let payload;
    try {
        payload = verifyAuthRequest(String(req.body?.req || ''));
    } catch {
        res.status(400).json({ message: 'Link autoryzacji wygasł lub jest nieprawidłowy.' });
        return;
    }

    if (req.body?.decision === 'deny') {
        const url = new URL(payload.redirect_uri);
        url.searchParams.set('error', 'access_denied');
        if (payload.state) url.searchParams.set('state', payload.state);
        res.json({ redirectUrl: url.href });
        return;
    }

    const { redirectUrl } = await issueAuthorizationCode(userId, payload);
    res.json({ redirectUrl });
};
