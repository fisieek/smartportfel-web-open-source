import 'dotenv/config';
import { captureServerError } from './lib/reportError';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import prisma from './lib/prisma';
import path from 'path';

import { seedCategories } from './utils/seed';
import { logger } from './utils/logger';

// 🛑 Environment Validation (Fail-Fast)
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
    logger.error(`Brakujące zmienne środowiskowe: ${missingEnv.join(', ')}`);
    logger.error('Aplikacja nie może zostać uruchomiona bez powyższych sekretów.');
    process.exit(1);
}

// Sekrety kryptograficzne muszą mieć min. 32 znaki entropii (np. crypto.randomBytes(32).toString('hex'))
const WEAK_SECRETS = ['JWT_SECRET'].filter(name => (process.env[name] as string).length < 32);
if (WEAK_SECRETS.length > 0) {
    logger.error(`Zbyt słabe sekrety (< 32 znaki): ${WEAK_SECRETS.join(', ')}. Wygeneruj: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
    process.exit(1);
}

// BYOK: klucz do szyfrowania kluczy API użytkowników. Świadomie NIE w REQUIRED_ENV —
// self-hosting bez funkcji AI musi dać się uruchomić. Ale jeśli zmienna JEST ustawiona
// i ma zły format, przerywamy start: cichy fallback oznaczałby, że użytkownik „zapisuje"
// klucz, którego nigdy nie da się odszyfrować.
const AI_ENCRYPTION_KEY = (process.env.AI_KEY_ENCRYPTION_KEY || '').trim();
if (AI_ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(AI_ENCRYPTION_KEY)) {
    logger.error('AI_KEY_ENCRYPTION_KEY musi mieć dokładnie 64 znaki hex (32 bajty). Wygeneruj: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}
if (!AI_ENCRYPTION_KEY) {
    logger.warn('AI_KEY_ENCRYPTION_KEY nie ustawiony — funkcje AI wyłączone (użytkownicy nie mogą zapisać własnego klucza).');
}

// Dostawca notowań (MARKET_DATA_PROVIDER). Domyślnie żaden — patrz services/marketData.
// Wypisujemy wybór do logu przy starcie: „ceny się nie odświeżają" ma mieć oczywistą przyczynę.
import { logMarketDataProvider } from './services/marketData';
logMarketDataProvider();

// Import routes
import authRoutes from './routes/auth';
import expenseRoutes from './routes/expenses';
import categoryRoutes from './routes/categories';
import storeRoutes from './routes/stores';
import savingsRoutes from './routes/savings';
import investmentRoutes from './routes/investments';
import savingsGoalRoutes from './routes/savingsGoals';
import personalAccountRoutes from './routes/personalAccounts';
import systemRoutes from './routes/system';
import mortgagesRoutes from './routes/mortgages';
import investmentAccountRoutes from './routes/investmentAccounts';
import instrumentRoutes from './routes/instruments';
import householdRoutes from './routes/household';
import aiRoutes from './routes/ai';
import ppkRoutes from './routes/ppkRoutes';
import onboardingRoutes from './routes/onboarding';
import planningRoutes from './routes/planning';
import gamificationRoutes from './routes/gamification';
import mcpRoutes from './routes/mcp';
import mcpTokenRoutes from './routes/mcpTokens';
import { registerMcpOAuth } from './routes/mcpOAuth';
import { registerSeoRoutes } from './seo/seo';
import { systemLimiter } from './middleware/rateLimitMiddleware';
import { cleanupUnverifiedUsers } from './controllers/systemController';
import { globalErrorHandler } from './middleware/errorHandler';

const app = express();
// Port z env (`PORT`), domyślnie 3000. Hostingi kontenerowe zwykle wstrzykują własny.
const port = Number(process.env.PORT) || 3000;

// Za reverse proxy (nginx, load balancer, hosting PaaS) req.ip to adres warstwy
// pośredniej — bez tego rate limiting kluczuje kubełki po IP proxy, nie klienta.
// `1` = ufaj dokładnie jednemu hopowi (nie `true` — express-rate-limit flaguje to
// jako podatne na spoofing X-Forwarded-For). Stawiasz serwer bez proxy? Ustaw 0.
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Dozwolone originy CORS. ŻADNA domena nie jest zaszyta w kodzie — instancja zna
 * wyłącznie to, co sama dostanie w konfiguracji:
 *
 *   CLIENT_URL             — adres Twojego frontu (dokładnie ten jeden)
 *   CORS_ALLOWED_ORIGINS   — lista po przecinku, gdy frontów jest więcej
 *
 * Poza produkcją dokładamy localhost, żeby `pnpm dev` działał bez konfigurowania czegokolwiek.
 */
const allowedOrigins = [
    process.env.CLIENT_URL?.trim(),
    ...(process.env.CORS_ALLOWED_ORIGINS?.split(',').map(o => o.trim()) ?? []),
    // Adres z sieci lokalnej (np. telefon uderzający w laptopa) dopisz sobie
    // w `CORS_ALLOWED_ORIGINS` w lokalnym `.env` — nie zaszywamy tu cudzych IP.
    ...(isProduction ? [] : [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:3000'
    ])
].filter(Boolean) as string[];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

// ── MCP (klienci AI: Claude, Perplexity) ─────────────────────────────────────
// Rejestrowane PRZED readiness-middleware: protokół MCP używa tylko Prismy (lazy),
// więc nie musi czekać na resztę inicjalizacji. Klient MCP wysyła `initialize` jako
// pierwsze żądanie i obrywanie na nim cold-startu kończyło się "failed to connect".
app.use('/api/mcp', mcpRoutes);

// OAuth 2.1 + DCR dla MCP (Perplexity / Claude.ai-web) — z tego samego powodu tutaj.
// Wystawia /.well-known/oauth-*, /authorize, /token, /register, /revoke + /api/oauth/*.
registerMcpOAuth(app);

// Debug route removed for security

// Pre-define initialization state
let isInitialized = false;

const initServer = async () => {
    if (isInitialized) return;
    logger.info(`--- INIT START: NODE_ENV=${process.env.NODE_ENV} ---`);
    try {
        logger.info('--- SYSTEM STARTUP ---');
        logger.debug('Project Root:', process.cwd());

        // Register standard API routes
        // Limitery auth wiszą na trasach w routes/auth.ts (authLimiter) — bez duplikatu tutaj.
        app.use('/api/system', systemRoutes);
        app.use('/api/auth', authRoutes);
        app.post('/api/system/cleanup-unverified', systemLimiter as any, cleanupUnverifiedUsers);
        app.use('/api/expenses', expenseRoutes);
        app.use('/api/categories', categoryRoutes);
        app.use('/api/stores', storeRoutes);
        app.use('/api/savings', savingsRoutes);
        app.use('/api/investments', investmentRoutes);
        app.use('/api/savings-goals', savingsGoalRoutes);
        app.use('/api/personal-accounts', personalAccountRoutes);
        app.use('/api/mortgages', mortgagesRoutes);
        app.use('/api/investment-accounts', investmentAccountRoutes);
        app.use('/api/instruments', instrumentRoutes);
        app.use('/api/household', householdRoutes);
        app.use('/api/ai', aiRoutes);
        app.use('/api/ppk', ppkRoutes);
        app.use('/api/planning', planningRoutes);
        app.use('/api/onboarding', onboardingRoutes);
        app.use('/api/gamification', gamificationRoutes);
        app.use('/api/mcp-tokens', mcpTokenRoutes);
        // /api/mcp zarejestrowane na górze — patrz sekcja „MCP (klienci AI)"

        // SEO (FAZA 2): meta-injection dla publicznych stron statycznych + dynamiczny
        // /sitemap.xml. MUSI być przed express.static(public) — inaczej statyczny plik
        // przechwyciłby /sitemap.xml.
        registerSeoRoutes(app);

        // Zbudowany front (`pnpm build` kopiuje tu apps/web/dist) + robots.txt i favicony.
        // UWAGA: nigdy nie serwuj `process.cwd()` — wystawiłoby to cały projekt razem z `.env`.
        const publicDir = path.join(process.cwd(), 'public');
        app.use(express.static(publicDir));

        // Catch-all SPA. Trasy aplikacji nie istnieją na dysku, więc każde żądanie
        // „nie-API i bez kropki w ścieżce" dostaje skorupę Reacta i routing po stronie klienta.
        //
        // `index.shell.html` (skorupa bez prerenderu) idzie PRZED `index.html`: ten drugi
        // niesie prerenderowany landing i należy wyłącznie do `/`, które obsłuży wcześniejszy
        // express.static. Odwrotna kolejność pokazywałaby landing pod /dashboard.
        app.get('*', (req, res, next) => {
            const p = req.path;
            if (p.startsWith('/api/') || p.includes('.')) {
                return next();
            }

            res.sendFile(path.join(publicDir, 'index.shell.html'), (err) => {
                if (!err) return;
                res.sendFile(path.join(publicDir, 'index.html'), (err2) => {
                    if (err2) next();
                });
            });
        });

        // Global error handler — MUSI być ostatni w stacku, za wszystkimi trasami
        // i catch-allem powyżej. Rejestrowany tu (a nie na poziomie modułu), bo
        // trasy /api/* są dodawane asynchronicznie wewnątrz tej funkcji; handler
        // zarejestrowany wcześniej nigdy nie złapałby ich next(err) (bug I4).
        app.use(globalErrorHandler);

        isInitialized = true;
        logger.info('--- Server Initialized ---');
    } catch (err: any) {
        logger.error('CRITICAL: Server initialization failed:', err.message);
        throw err;
    }
};

// Start initialization immediately
const initPromise = initServer();

// Request logger for debugging
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
        logger.debug(`[REQ] ${req.method} ${req.path}`);
    }
    next();
});

// Middleware to await initialization for every request
app.use(async (req, res, next) => {
    try {
        await initPromise;
        next();
    } catch (err: any) {
        captureServerError(err, req, `Init failed for: ${req.path}`);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Server failed to start correctly',
                message: isProduction ? 'Internal Server Error' : err.message,
                initializationError: true
            });
        }
    }
});

// Global error handler jest rejestrowany na końcu initServer() (po trasach) —
// patrz middleware/errorHandler.ts (bug I4).

// Nasłuchiwanie startuje dopiero po inicjalizacji tras — inaczej pierwsze żądanie
// mogłoby trafić na Express bez zarejestrowanego /api/*.
initPromise.then(() => {
    app.listen(port, '0.0.0.0', () => {
        logger.info(`🚀 Serwer nasłuchuje na porcie ${port}`);
    });
});

// Eksport dla środowisk, które same zarządzają nasłuchiwaniem (testy, własny wrapper).
export default app;
