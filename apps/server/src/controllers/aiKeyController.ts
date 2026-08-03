import { Response } from 'express';
import { generateText } from 'ai';
import { SetAiKeyRequestSchema } from '@smartportfel/contracts';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../lib/prisma';
import { seal, isEncryptionConfigured } from '../utils/crypto';
import { getAiModelFor } from '../services/ai/aiClient';
import { captureServerError } from '../lib/reportError';

/**
 * BYOK — zarządzanie kluczem API użytkownika do funkcji AI.
 *
 * Sam klucz NIGDY nie wraca do klienta: wszystkie trzy endpointy zwracają ten sam
 * status z `last4` i metadanymi.
 */

const PROVIDER_DB = { gemini: 'GEMINI', openai: 'OPENAI' } as const;
const PROVIDER_ID = { GEMINI: 'gemini', OPENAI: 'openai' } as const;

async function buildStatus(userId: string) {
    const row = await prisma.userAiKey.findUnique({
        where: { userId },
        select: { provider: true, last4: true, createdAt: true },
    });
    return {
        configured: row !== null,
        provider: row ? PROVIDER_ID[row.provider] : null,
        last4: row?.last4 ?? null,
        createdAt: row?.createdAt.toISOString() ?? null,
        encryptionAvailable: isEncryptionConfigured(),
    };
}

/** GET /api/ai/key */
export const getAiKeyStatus = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        res.json(await buildStatus(userId));
    } catch (error) {
        captureServerError(error, req, 'getAiKeyStatus error:');
        res.status(500).json({ message: 'Nie udało się odczytać stanu klucza AI' });
    }
};

/** PUT /api/ai/key — waliduje klucz u dostawcy, dopiero potem zapisuje. */
export const setAiKey = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        if (!isEncryptionConfigured()) {
            return res.status(503).json({
                code: 'AI_ENCRYPTION_UNAVAILABLE',
                message: 'Ta instancja nie ma skonfigurowanego szyfrowania kluczy (AI_KEY_ENCRYPTION_KEY), więc nie może ich przechowywać.',
            });
        }

        const parsed = SetAiKeyRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                code: 'AI_KEY_INVALID',
                message: 'Nieprawidłowy klucz API',
                errors: parsed.error.flatten(),
            });
        }
        const { provider, apiKey } = parsed.data;

        // Jedno tanie zapytanie do dostawcy. Bez tego literówka daje zielony ptaszek
        // przy zapisie i nieczytelny błąd dopiero przy imporcie wyciągu.
        try {
            await generateText({
                model: getAiModelFor({ provider, apiKey }),
                prompt: 'ping',
                maxOutputTokens: 1,
            });
        } catch (e: any) {
            const status = e?.statusCode ?? e?.status ?? e?.response?.status;
            if (status === 401 || status === 403) {
                return res.status(400).json({
                    code: 'AI_KEY_REJECTED',
                    message: 'Dostawca odrzucił ten klucz. Sprawdź, czy skopiowałeś go w całości.',
                });
            }
            if (status === 429) {
                return res.status(400).json({
                    code: 'AI_KEY_RATE_LIMITED',
                    message: 'Klucz działa, ale dostawca zwrócił limit zapytań. Spróbuj za chwilę.',
                });
            }
            return res.status(400).json({
                code: 'AI_KEY_UNVERIFIED',
                message: 'Nie udało się zweryfikować klucza u dostawcy. Sprawdź klucz i spróbuj ponownie.',
            });
        }

        const sealed = seal(apiKey, userId);
        const payload = {
            provider: PROVIDER_DB[provider],
            ciphertext: sealed.ciphertext,
            iv: sealed.iv,
            authTag: sealed.authTag,
            last4: apiKey.slice(-4),
        };
        await prisma.userAiKey.upsert({
            where: { userId },
            create: { userId, ...payload },
            update: payload,
        });

        res.json(await buildStatus(userId));
    } catch (error) {
        // Świadomie bez `req.body` w logu — niósłby jawny klucz.
        captureServerError(error, req, 'setAiKey error:');
        res.status(500).json({ message: 'Nie udało się zapisać klucza AI' });
    }
};

/** DELETE /api/ai/key — idempotentne. */
export const deleteAiKey = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });
        await prisma.userAiKey.deleteMany({ where: { userId } });
        res.json(await buildStatus(userId));
    } catch (error) {
        captureServerError(error, req, 'deleteAiKey error:');
        res.status(500).json({ message: 'Nie udało się usunąć klucza AI' });
    }
};
