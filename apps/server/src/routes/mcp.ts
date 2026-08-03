import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateMcp, McpRequest } from '../middleware/mcpAuth';
import { buildMcpServer } from '../services/mcp/mcpServer';
import { PrismaRateLimitStore } from '../middleware/prismaRateLimitStore';

const router = Router();

const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { jsonrpc: '2.0', error: { code: -32029, message: 'Zbyt wiele żądań — spróbuj za chwilę' }, id: null },
    store: new PrismaRateLimitStore('mcp'),
});

// Bezstanowo: nowy serwer + transport na każde żądanie (bezpieczne też przy limitach czasu funkcji serverless)
const handleMcpPost = async (req: McpRequest, res: Response) => {
    try {
        const server = buildMcpServer(req.mcpUserId!, req.mcpScope ?? 'read');
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,
        });
        res.on('close', () => {
            transport.close();
            server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (err) {
        console.error('[MCP] handler error', err);
        if (!res.headersSent) {
            res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
        }
    }
};

const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server)' }, id: null });
};

// Wariant z tokenem w URL (najprostszy dla łączników Claude/Perplexity)
router.post('/:token', mcpLimiter, authenticateMcp, handleMcpPost);
router.get('/:token', methodNotAllowed);
router.delete('/:token', methodNotAllowed);

// Wariant z nagłówkiem Authorization: Bearer (np. mcp-remote / Claude Desktop)
router.post('/', mcpLimiter, authenticateMcp, handleMcpPost);
router.get('/', methodNotAllowed);

export default router;
