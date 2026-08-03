import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';

vi.mock('ai', () => ({
    generateText: vi.fn(),
    generateObject: vi.fn(),
}));
vi.mock('../../services/ai/aiClient', () => ({
    getAiModelFor: vi.fn(() => ({})),
}));
vi.mock('../../services/ai/aiKeyService', () => ({
    resolveAiKey: vi.fn(),
}));
// aiController importuje też prisma i providerów na górze pliku — zamockuj, by się załadował.
vi.mock('../../lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: vi.fn(() => vi.fn()) }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: vi.fn(() => vi.fn()) }));

import { generateObject } from 'ai';
import { resolveAiKey } from '../../services/ai/aiKeyService';
import { detectColumns } from '../aiController';

let jsonMock: any;
let statusMock: any;
const makeRes = () => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    return { json: jsonMock, status: statusMock } as any as Response;
};

const userKey = { ok: true, key: { provider: 'gemini', apiKey: 'k' } };

beforeEach(() => {
    vi.clearAllMocks();
});

const body = {
    headers: ['Data operacji', 'Opis', 'Kwota', 'Waluta'],
    sampleRows: [['2024-01-15', 'Biedronka', '-150,50', 'PLN']],
};

describe('detectColumns', () => {
    it('zwraca mapowanie kolumn na kluczu użytkownika, bez licznika', async () => {
        (resolveAiKey as any).mockResolvedValue(userKey);
        (generateObject as any).mockResolvedValue({
            object: { dateColumn: 0, descriptionColumn: 1, amountColumn: 2, debitColumn: null, creditColumn: null, currencyColumn: 3 },
        });

        const res = makeRes();
        await detectColumns({ user: { userId: 'u1' }, body } as any, res);

        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
            mapping: expect.objectContaining({ dateColumn: 0, amountColumn: 2, currencyColumn: 3 }),
        }));
    });


    it('bez klucza użytkownika → 402 z kodem AI_KEY_REQUIRED', async () => {
        (resolveAiKey as any).mockResolvedValue({
            ok: false, status: 402, code: 'AI_KEY_REQUIRED', message: 'Funkcje AI wymagają własnego klucza API',
        });
        const res = makeRes();
        await detectColumns({ user: { userId: 'u1' }, body } as any, res);

        expect(statusMock).toHaveBeenCalledWith(402);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ code: 'AI_KEY_REQUIRED' }));
        expect(generateObject).not.toHaveBeenCalled();
    });


    it('odrzuca brak headers/sampleRows (400)', async () => {
        (resolveAiKey as any).mockResolvedValue(userKey);
        const res = makeRes();
        await detectColumns({ user: { userId: 'u1' }, body: {} } as any, res);
        expect(statusMock).toHaveBeenCalledWith(400);
    });
});
