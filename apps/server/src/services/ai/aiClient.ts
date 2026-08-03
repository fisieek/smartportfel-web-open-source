import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { ResolvedAiKey } from './aiKeyService';

/**
 * Współdzielona konfiguracja modelu AI. Reużywana przez kategoryzację,
 * wykrywanie kolumn wyciągów i ekstrakcję inwestycji.
 *
 * Model jest tworzony PER ŻĄDANIE, bo klucz API jest per użytkownik (BYOK).
 * Moduł nie może trzymać singletona — byłby to wyciek klucza między kontami.
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENAI_MODEL = 'gpt-4o-mini';

export function getAiModelFor(resolved: Pick<ResolvedAiKey, 'provider' | 'apiKey'>) {
    if (resolved.provider === 'gemini') {
        return createGoogleGenerativeAI({ apiKey: resolved.apiKey })(GEMINI_MODEL);
    }
    return createOpenAI({ apiKey: resolved.apiKey })(OPENAI_MODEL);
}
