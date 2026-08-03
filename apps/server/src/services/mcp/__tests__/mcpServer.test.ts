import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMcpServer } from '../mcpServer';

// mcpServer importuje logikę biznesową ciągnącą prisma — mockujemy klienta,
// żeby rejestracja narzędzi i wywołania handlerów nie dotykały DB.
vi.mock('../../../lib/prisma', () => ({
    default: { user: { findMany: vi.fn() } },
}));
vi.mock('../../expense/expenseViewService', () => ({
    getExpensesLogic: vi.fn(),
    getDashboardSummaryLogic: vi.fn(),
}));

import prisma from '../../../lib/prisma';
import { getExpensesLogic } from '../../expense/expenseViewService';

const toolNames = (server: any): string[] => Object.keys(server._registeredTools);
/** Handler narzędzia MCP — SDK trzyma go pod `handler` w `_registeredTools`. */
const callTool = (server: any, name: string, args: any = {}) =>
    server._registeredTools[name].handler(args);

describe('buildMcpServer — gating narzędzi zapisu przez scope (bug I3)', () => {
    it('scope=read: NIE rejestruje commit_transactions/commit_investment', () => {
        const names = toolNames(buildMcpServer('u1', 'read'));
        expect(names).not.toContain('commit_transactions');
        expect(names).not.toContain('commit_investment');
        // odczyt i podglądy nadal dostępne
        expect(names).toContain('get_accounts');
        expect(names).toContain('preview_transactions');
    });

    it('scope=write: rejestruje narzędzia zapisu', () => {
        const names = toolNames(buildMcpServer('u1', 'write'));
        expect(names).toContain('commit_transactions');
        expect(names).toContain('commit_investment');
    });

    it('domyślnie (bez scope) = write — kompatybilność wsteczna wywołań', () => {
        const names = toolNames(buildMcpServer('u1'));
        expect(names).toContain('commit_transactions');
    });
});

describe('buildMcpServer — zakres danych gospodarstwa', () => {
    beforeEach(() => vi.clearAllMocks());

    it('list_transactions bez scope: pyta o WYŁĄCZNIE własne wpisy (mine)', async () => {
        (getExpensesLogic as any).mockResolvedValue([]);
        await callTool(buildMcpServer('u1', 'read'), 'list_transactions', { limit: 50 });
        // Bez `scope: 'mine'` getExpensesLogic domyśla się 'all' i dociąga wpisy współczłonka
        // na wspólnych kontach — dlatego asercja patrzy na argument, a nie na sam fakt wywołania.
        expect(getExpensesLogic).toHaveBeenCalledWith('u1', expect.objectContaining({ scope: 'mine' }));
    });

    it('list_transactions ze scope=shared: przekazuje zakres dalej', async () => {
        (getExpensesLogic as any).mockResolvedValue([]);
        await callTool(buildMcpServer('u1', 'read'), 'list_transactions', { scope: 'shared', limit: 50 });
        expect(getExpensesLogic).toHaveBeenCalledWith('u1', expect.objectContaining({ scope: 'shared' }));
    });

    it('get_shared_expenses: NIE pobiera e-maili współczłonków', async () => {
        (getExpensesLogic as any).mockResolvedValue([
            { userId: 'u1', amount: 100, plnAmount: 100 },
            { userId: 'u2', amount: 50, plnAmount: 50 },
        ]);
        (prisma.user.findMany as any).mockResolvedValue([{ id: 'u2', username: 'Partner' }]);

        const res = await callTool(buildMcpServer('u1', 'read'), 'get_shared_expenses', {});

        const select = (prisma.user.findMany as any).mock.calls[0][0].select;
        expect(select).not.toHaveProperty('email');
        expect(select).toEqual({ id: true, username: true });
        expect(res.content[0].text).toContain('Partner');
        expect(res.content[0].text).not.toContain('@');
    });

    it('get_shared_expenses: brak username → neutralna etykieta zamiast danych kontaktowych', async () => {
        (getExpensesLogic as any).mockResolvedValue([{ userId: 'u2', amount: 50, plnAmount: 50 }]);
        (prisma.user.findMany as any).mockResolvedValue([{ id: 'u2', username: null }]);

        const res = await callTool(buildMcpServer('u1', 'read'), 'get_shared_expenses', {});
        expect(res.content[0].text).toContain('Współczłonek');
    });
});
