import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Response } from 'express';
import prisma from '../../lib/prisma';
import { exportData } from '../accountController';

// Mock prisma — ręczny, jak w authController.test.ts. Eksport RODO odpytuje kilkanaście
// modeli równolegle; wszystkie poza `user` i `userAiKey` zwracają puste kolekcje.
vi.mock('../../lib/prisma', () => {
    const empty = () => vi.fn(async () => []);
    const mockPrisma: any = {
        user: { findUnique: vi.fn() },
        userAiKey: { findUnique: vi.fn() },
        personalAccount: { findMany: empty() },
        savingsAccount: { findMany: empty() },
        investmentAccount: { findMany: empty() },
        expense: { findMany: empty() },
        savingsGoal: { findMany: empty() },
        investment: { findMany: empty() },
        mortgage: { findMany: empty() },
        pPKConfig: { findUnique: vi.fn(async () => null) },
        pPKTransaction: { findMany: empty() },
        monthlyPlan: { findMany: empty() },
        portfolioSnapshot: { findMany: empty() },
        category: { findMany: empty() },
        store: { findMany: empty() },
    };
    return { default: mockPrisma };
});

vi.mock('../../utils/auditLog', () => ({ audit: vi.fn() }));
vi.mock('../../lib/reportError', () => ({ captureServerError: vi.fn() }));

const mockPrisma = prisma as any;

function mockRes(): Response {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.setHeader = vi.fn().mockReturnValue(res);
    return res as Response;
}

const req = { user: { userId: 'user-1' } } as any;

describe('exportData — metadana klucza AI (BYOK)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValue({
            id: 'user-1', username: 'filip', email: 'filip@example.com',
            createdAt: new Date('2026-01-01'), isEmailVerified: true,
        });
    });

    it('dokłada provider, last4 i createdAt, gdy użytkownik ma zapisany klucz', async () => {
        mockPrisma.userAiKey.findUnique.mockResolvedValue({
            provider: 'OPENAI', last4: 'x9Fq', createdAt: new Date('2026-07-01T10:00:00Z'),
        });
        const res = mockRes();

        await exportData(req, res);

        const payload = (res.json as any).mock.calls[0][0];
        expect(payload.aiKey).toEqual({
            provider: 'openai',
            last4: 'x9Fq',
            createdAt: new Date('2026-07-01T10:00:00Z'),
        });
    });

    it('mapuje GEMINI na identyfikator używany przez API', async () => {
        mockPrisma.userAiKey.findUnique.mockResolvedValue({
            provider: 'GEMINI', last4: 'ab12', createdAt: new Date('2026-07-01T10:00:00Z'),
        });
        const res = mockRes();

        await exportData(req, res);

        expect((res.json as any).mock.calls[0][0].aiKey.provider).toBe('gemini');
    });

    it('zwraca aiKey: null, gdy klucza nie ma', async () => {
        mockPrisma.userAiKey.findUnique.mockResolvedValue(null);
        const res = mockRes();

        await exportData(req, res);

        expect((res.json as any).mock.calls[0][0].aiKey).toBeNull();
    });

    // REGRESJA: `ciphertext`, `iv` i `authTag` leżą w tym samym wierszu co metadana.
    // Odczyt bez `select` wpuściłby zaszyfrowany klucz do pobieranego przez użytkownika pliku.
    it('nigdy nie wypuszcza szyfrogramu — odpytuje wąskim select', async () => {
        mockPrisma.userAiKey.findUnique.mockResolvedValue({
            provider: 'GEMINI', last4: 'ab12', createdAt: new Date('2026-07-01T10:00:00Z'),
        });
        const res = mockRes();

        await exportData(req, res);

        expect(mockPrisma.userAiKey.findUnique).toHaveBeenCalledWith({
            where: { userId: 'user-1' },
            select: { provider: true, last4: true, createdAt: true },
        });

        // Szukamy kluczy JSON, nie gołych podciągów — samo „iv" trafiłoby w pierwsze
        // lepsze słowo i test przechodziłby albo padał z przypadkowego powodu.
        const serialized = JSON.stringify((res.json as any).mock.calls[0][0]);
        expect(serialized).not.toContain('"ciphertext"');
        expect(serialized).not.toContain('"authTag"');
        expect(serialized).not.toContain('"iv"');
    });
});
