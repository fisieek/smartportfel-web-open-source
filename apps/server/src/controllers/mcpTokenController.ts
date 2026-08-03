import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateMcpToken, listMcpTokens, revokeMcpToken } from '../services/mcp/mcpTokenService';
import { logger } from '../utils/logger';
import { captureServerError } from '../lib/reportError';

export const createMcpToken = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const { name, scope } = req.body || {};
        // Domyślnie 'read' — token przekazywany w URL nie może dawać zapisu (bug I3).
        const safeScope = scope === 'write' ? 'write' : 'read';
        const result = await generateMcpToken(userId, typeof name === 'string' ? name : undefined, safeScope);
        // Jawny token zwracamy TYLKO tutaj (raz).
        res.status(201).json(result);
    } catch (error) {
        captureServerError(error, req, 'Błąd tworzenia tokenu MCP:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const getMcpTokens = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const tokens = await listMcpTokens(userId);
        res.json(tokens);
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania tokenów MCP:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};

export const deleteMcpToken = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }
        const ok = await revokeMcpToken(userId, req.params.id);
        if (!ok) {
            res.status(404).json({ message: 'Token nie znaleziony' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        captureServerError(error, req, 'Błąd odwoływania tokenu MCP:');
        res.status(500).json({ message: 'Błąd serwera' });
    }
};
