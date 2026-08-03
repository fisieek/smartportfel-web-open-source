import prisma from '../../lib/prisma';
import { open, isEncryptionConfigured, DecryptionFailedError } from '../../utils/crypto';

/**
 * BYOK — funkcje AI działają WYŁĄCZNIE na kluczu API użytkownika.
 *
 * Instancja nie ma własnego klucza i nie wykonuje zapytań „na swój rachunek": nie ma puli
 * darmowej, licznika ani limitów. Konsekwencja jest celowa — skoro za zapytania płaci
 * użytkownik, nie ma czego limitować, a self-hoster nigdy nie zapłaci za cudze zapytania.
 */

export type AiProviderId = 'gemini' | 'openai';

export interface ResolvedAiKey {
    provider: AiProviderId;
    /** Jawny klucz API — NIGDY nie serializować ani nie logować. */
    apiKey: string;
}

export type AiKeyDenialCode = 'AI_KEY_REQUIRED' | 'AI_KEY_UNREADABLE';

export interface AiKeyDenial {
    ok: false;
    /** 402, nie 403 — 403 bywa tłumione na froncie jako „brak uprawnień". */
    status: 402;
    code: AiKeyDenialCode;
    message: string;
}

export type AiKeyResolution = { ok: true; key: ResolvedAiKey } | AiKeyDenial;

export async function resolveAiKey(userId: string): Promise<AiKeyResolution> {
    if (!isEncryptionConfigured()) {
        return {
            ok: false,
            status: 402,
            code: 'AI_KEY_REQUIRED',
            message: 'Funkcje AI są wyłączone na tej instancji (brak AI_KEY_ENCRYPTION_KEY).',
        };
    }

    const row = await prisma.userAiKey.findUnique({ where: { userId } });
    if (!row) {
        return {
            ok: false,
            status: 402,
            code: 'AI_KEY_REQUIRED',
            message: 'Funkcje AI wymagają własnego klucza API (Gemini lub OpenAI). Dodaj go w Ustawieniach → Klucz AI.',
        };
    }

    try {
        const apiKey = open({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.authTag }, userId);
        return { ok: true, key: { provider: row.provider === 'OPENAI' ? 'openai' : 'gemini', apiKey } };
    } catch (e) {
        if (e instanceof DecryptionFailedError) {
            // Najczęściej: rotacja AI_KEY_ENCRYPTION_KEY. Użytkownik musi wpisać klucz ponownie.
            return {
                ok: false,
                status: 402,
                code: 'AI_KEY_UNREADABLE',
                message: 'Nie można odczytać zapisanego klucza AI. Wprowadź go ponownie w Ustawieniach.',
            };
        }
        throw e;
    }
}
