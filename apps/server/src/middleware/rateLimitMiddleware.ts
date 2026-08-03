import rateLimit, { type Options as RateLimitOptions } from 'express-rate-limit';
import { PrismaRateLimitStore } from './prismaRateLimitStore';

// Wszystkie limitery używają współdzielonego store'a w Postgresie (audyt B1) —
// domyślny MemoryStore w środowisku serverless resetuje się per inwokacja i niczego nie limituje.
// Wymaga `app.set('trust proxy', 1)` w index.ts, żeby req.ip było adresem klienta.

// Ogólny limit autoryzacyjny - zapobieganie próbom zgadnięcia hasła i credential stuffing
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 10, // Max 10 żądań z jednego IP w ciągu 15 minut
    message: {
        message: 'Przekroczono limit prób logowania/rejestracji. Spróbuj ponownie za 15 minut.'
    },
    standardHeaders: true, // Zwraca RateLimit-* w headerach
    legacyHeaders: false, // Wyłącza X-RateLimit-* headery
    store: new PrismaRateLimitStore('auth'),
});

// Zwiększony rygor dla e-maili resetujących (zapobieganie spamowi)
export const emailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 3, // Max 3 żądania wysyłki e-maila z jednego IP na godzinę
    message: {
        message: 'Przekroczono limit prób odzyskiwania hasła. Spróbuj ponownie za godzinę.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PrismaRateLimitStore('email'),
});

// Limit prób użycia tokenów (reset hasła, weryfikacja e-mail) - blokuje brute-force tokenów
export const tokenLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 10,
    message: {
        message: 'Przekroczono limit prób. Spróbuj ponownie za godzinę.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PrismaRateLimitStore('token'),
});

// Endpointy systemowe (cleanup) - bardzo restrykcyjny limit
export const systemLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 5,
    message: {
        message: 'Przekroczono limit żądań systemowych.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PrismaRateLimitStore('system'),
});

/**
 * Konfiguracja limitera dla handlerów OAuth z MCP SDK (authorize/token/register/revoke).
 * SDK montuje własny express-rate-limit, ale z domyślnym MemoryStore — w serverless to znaczy
 * BRAK limitu (reset per inwokacja), a `/api/oauth/register` jest nieuwierzytelniony.
 * Podmieniamy WYŁĄCZNIE store; progi zostawiamy SDK (register 20/h, authorize 100/15min,
 * token i revoke 50/15min). Każdy endpoint dostaje własny `bucket` — inaczej dzieliłyby kubełek.
 */
export const oauthRateLimit = (bucket: string): Partial<RateLimitOptions> => ({
    store: new PrismaRateLimitStore(`oauth-${bucket}`),
    standardHeaders: true,
    legacyHeaders: false,
});

// Zapis klucza AI wykonuje realne zapytanie do dostawcy — bez limitu endpoint byłby
// oraclem „czy ten skradziony klucz działa" i wzmacniaczem kosztów.
export const aiKeyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 10,
    message: {
        message: 'Zbyt wiele prób zapisu klucza AI. Spróbuj ponownie za 15 minut.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: new PrismaRateLimitStore('ai-key'),
});
