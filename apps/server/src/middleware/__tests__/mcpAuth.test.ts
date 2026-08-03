import { vi, describe, it, expect, beforeEach } from 'vitest';
import { authenticateMcp, McpRequest } from '../mcpAuth';
import { verifyMcpToken } from '../../services/mcp/mcpTokenService';
import type { Response } from 'express';

vi.mock('../../services/mcp/mcpTokenService', () => ({
    verifyMcpToken: vi.fn(),
}));

const mockRes = () => {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.setHeader = vi.fn(() => res);
    return res as Response;
};

describe('authenticateMcp — efektywny scope (bug I3)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('token write w NAGŁÓWKU Bearer → mcpScope=write', async () => {
        (verifyMcpToken as any).mockResolvedValue({ ok: true, userId: 'u1', clientId: null, scope: 'write' });
        const req = { params: {}, headers: { authorization: 'Bearer sp_mcp_abc' } } as unknown as McpRequest;
        const next = vi.fn();
        await authenticateMcp(req, mockRes(), next);
        expect(next).toHaveBeenCalled();
        expect(req.mcpUserId).toBe('u1');
        expect(req.mcpScope).toBe('write');
    });

    it('token write w ŚCIEŻCE URL → degraduje do read (URL wycieka do logów)', async () => {
        (verifyMcpToken as any).mockResolvedValue({ ok: true, userId: 'u1', clientId: null, scope: 'write' });
        const req = { params: { token: 'sp_mcp_abc' }, headers: {} } as unknown as McpRequest;
        const next = vi.fn();
        await authenticateMcp(req, mockRes(), next);
        expect(req.mcpScope).toBe('read');
    });

    it('token read w nagłówku → pozostaje read (scope tokenu jest sufitem)', async () => {
        (verifyMcpToken as any).mockResolvedValue({ ok: true, userId: 'u1', clientId: null, scope: 'read' });
        const req = { params: {}, headers: { authorization: 'Bearer sp_mcp_abc' } } as unknown as McpRequest;
        const next = vi.fn();
        await authenticateMcp(req, mockRes(), next);
        expect(req.mcpScope).toBe('read');
    });

    it('nieważny token → 401, brak next', async () => {
        (verifyMcpToken as any).mockResolvedValue({ ok: false, status: 401, message: 'zły' });
        const req = { params: { token: 'garbage' }, headers: {} } as unknown as McpRequest;
        const res = mockRes();
        const next = vi.fn();
        await authenticateMcp(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect((res.status as any)).toHaveBeenCalledWith(401);
    });
});
