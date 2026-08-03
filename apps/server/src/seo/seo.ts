// Server-side meta injection + sitemap (FAZA 2 audytu SEO/GEO).
//
// Po co: aplikacja webowa to czysty CSR — scrapery social (FB/LinkedIn/Slack/WA)
// i część AI-crawlerów nie wykonują JS, więc w surowym HTML widziały zawsze
// generyczny OG i pusty <div id="root">. Tu wstrzykujemy prawdziwe meta/OG/JSON-LD
// dla publicznych stron statycznych (kalkulatory) i generujemy sitemap.
//
// Trasy rejestruje `registerSeoRoutes(app)` PRZED serwowaniem statyków i przed
// catch-allem SPA — patrz apps/server/src/index.ts.
import fs from 'fs';
import path from 'path';
import type { Express, Request, Response } from 'express';
import { logger } from '../utils/logger';

// Adres kanoniczny tej instancji — trafia do `<link rel="canonical">`, metatagów OG
// i do sitemapy. ŻADNEJ domeny domyślnej: zaszyty adres kazałby cudzej instancji
// ogłaszać w wynikach wyszukiwania nie swoją witrynę. Bez `CLIENT_URL` adresy
// zostają względne, a sitemap się nie generuje (patrz `handleSitemap`).
const SITE = process.env.CLIENT_URL?.trim().replace(/\/$/, '') || '';
const DEFAULT_OG_IMAGE = `${SITE}/og-image.png`;

// Statyczne trasy do sitemap (jak w starym pliku public/sitemap.xml).
const STATIC_ROUTES: Array<{ loc: string; changefreq: string; priority: string }> = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/kalkulatory', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-kredytu', changefreq: 'monthly', priority: '0.9' },
    { loc: '/kalkulator-wynagrodzen', changefreq: 'monthly', priority: '0.9' },
    { loc: '/kalkulator-umowa-zlecenie', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-b2b', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-oszczednosci', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-ppk', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-zdolnosci-kredytowej', changefreq: 'monthly', priority: '0.8' },
    { loc: '/kalkulator-nadplaty-kredytu', changefreq: 'monthly', priority: '0.8' },
    { loc: '/login', changefreq: 'monthly', priority: '0.5' },
    { loc: '/register', changefreq: 'monthly', priority: '0.5' },
];

// Publiczne strony statyczne z serwerowym meta (kalkulatory — magnesy SEO).
// UWAGA: title/description trzymaj w zgodzie z apps/web/src/pages/salaryCalculatorsContent.tsx
// i pages/{CalculatorsPage,LoanCalculatorPage}.tsx (klientowy helmet renderuje to samo).
// Każda z nich jest rejestrowana jako osobna trasa Expressa przed catch-allem SPA.
const STATIC_PAGES: Array<{ path: string; name: string; title: string; description: string }> = [
    {
        path: '/kalkulatory',
        name: 'Kalkulatory finansowe',
        title: 'Darmowe kalkulatory finansowe online | SmartPortfel',
        description:
            'Darmowe kalkulatory finansowe: wynagrodzeń brutto-netto (UoP, zlecenie, B2B) i kredytu hipotecznego. Bez rejestracji, aktualne stawki 2026, pełne rozbicie wyników.',
    },
    {
        path: '/kalkulator-wynagrodzen',
        name: 'Kalkulator wynagrodzeń',
        title: 'Kalkulator wynagrodzeń brutto-netto 2026 (umowa o pracę) | SmartPortfel',
        description:
            'Darmowy kalkulator wynagrodzeń 2026: przelicz brutto na netto (i odwrotnie) na umowie o pracę. Składki ZUS, zdrowotna, PIT, PPK i ulga dla młodych — z pełnym rozbiciem „skąd ta kwota".',
    },
    {
        path: '/kalkulator-umowa-zlecenie',
        name: 'Kalkulator umowy zlecenia',
        title: 'Kalkulator umowy zlecenia 2026 — brutto netto | SmartPortfel',
        description:
            'Darmowy kalkulator umowy zlecenia 2026: ile dostaniesz na rękę ze zlecenia. Student do 26 lat bez składek, dobrowolna chorobowa, koszty 20% — pełne rozbicie potrąceń.',
    },
    {
        path: '/kalkulator-b2b',
        name: 'Kalkulator B2B',
        title: 'Kalkulator B2B 2026 — ile zostaje na rękę z faktury | SmartPortfel',
        description:
            'Darmowy kalkulator B2B 2026: porównaj skalę, podatek liniowy i ryczałt przy Twoich przychodach. Składki ZUS (ulga na start, preferencyjny, pełny), zdrowotna per forma — ile realnie zostaje.',
    },
    {
        path: '/kalkulator-oszczednosci',
        name: 'Kalkulator oszczędności',
        title: 'Kalkulator oszczędności 2026 — lokata i konto z podatkiem Belki | SmartPortfel',
        description:
            'Darmowy kalkulator oszczędności: policz, ile uzbierasz na koncie oszczędnościowym lub lokacie. Kapitalizacja miesięczna i roczna, podatek Belki 19%, wykres narastania odsetek.',
    },
    {
        path: '/kalkulator-ppk',
        name: 'Kalkulator PPK',
        title: 'Kalkulator PPK 2026 — ile kosztuje i ile uzbierasz do 60. roku | SmartPortfel',
        description:
            'Darmowy kalkulator PPK: sprawdź, ile realnie kosztuje Cię udział w PPK i ile kapitału uzbierasz do 60. roku życia z dopłatami pracodawcy i państwa. Projekcja z wykresem narastania.',
    },
    {
        path: '/kalkulator-zdolnosci-kredytowej',
        name: 'Kalkulator zdolności kredytowej',
        title: 'Kalkulator zdolności kredytowej 2026 — ile kredytu dostanę | SmartPortfel',
        description:
            'Darmowy kalkulator zdolności kredytowej 2026: sprawdź, na jaki kredyt hipoteczny możesz liczyć przy swoich dochodach. Wskaźnik DStI i bufor stopy KNF (+2,5 p.p.) — wynik od razu.',
    },
    {
        path: '/kalkulator-nadplaty-kredytu',
        name: 'Kalkulator nadpłaty kredytu',
        title: 'Kalkulator nadpłaty kredytu 2026 — ile zaoszczędzisz | SmartPortfel',
        description:
            'Darmowy kalkulator nadpłaty kredytu hipotecznego: policz, ile zaoszczędzisz na odsetkach i o ile skrócisz kredyt dzięki regularnym nadpłatom. Skrócenie okresu lub obniżenie raty.',
    },
    {
        path: '/kalkulator-kredytu',
        name: 'Kalkulator kredytu',
        title: 'Kalkulator kredytu hipotecznego i gotówkowego | SmartPortfel',
        description:
            'Darmowy kalkulator kredytu: oblicz ratę, całkowity koszt i harmonogram spłaty. Sprawdź ratę równą i malejącą, zasymuluj nadpłatę oraz zmianę stopy WIBOR/WIRON.',
    },
];

// ── Szablon HTML (zbudowany index.html z hashowanymi assetami) ───────────────
let cachedTemplate: string | null = null;

function loadTemplate(): string | null {
    if (cachedTemplate) return cachedTemplate;
    const candidates = [
        // `index.shell.html` to PUSTA skorupa SPA (bez prerenderu), emitowana obok
        // index.html przez apps/web/scripts/prerender.mjs. Musi być pierwsza:
        // index.html zawiera prerenderowany landing, a wstrzyknięcie w niego meta
        // podstrony dałoby ją z treścią strony głównej w HTML — realny błąd SEO.
        path.join(process.cwd(), 'public', 'index.shell.html'),
        path.join(process.cwd(), 'public', 'index.html'),
        path.join(process.cwd(), 'client', 'dist', 'index.html'),
        path.join(process.cwd(), 'index.html'),
    ];
    for (const file of candidates) {
        try {
            if (fs.existsSync(file)) {
                cachedTemplate = fs.readFileSync(file, 'utf8');
                logger.info(`[SEO] Załadowano szablon HTML: ${file}`);
                return cachedTemplate;
            }
        } catch {
            /* spróbuj następnej lokalizacji */
        }
    }
    logger.error('[SEO] Nie znaleziono szablonu index.html w żadnej z lokalizacji.');
    return null;
}

// ── Helpery HTML / meta ──────────────────────────────────────────────────────
function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Bezpieczny JSON-LD: blokuje przedwczesne zamknięcie </script>.
function jsonLdScript(obj: Record<string, unknown>): string {
    const json = JSON.stringify(obj).replace(/</g, '\\u003c');
    return `<script type="application/ld+json">${json}</script>`;
}

// Podmienia istniejący <meta {attr}="{key}" content="..."> albo dokłada nowy przed </head>.
function setMeta(html: string, attr: 'name' | 'property', key: string, value: string): string {
    const re = new RegExp(`<meta\\s+${attr}="${escapeRegex(key)}"\\s+content="[^"]*"\\s*/?>`, 'i');
    const tag = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
    if (re.test(html)) return html.replace(re, tag);
    return html.replace('</head>', `  ${tag}\n</head>`);
}

interface MetaInput {
    title: string;
    description: string;
    canonical: string;
    image: string;
    type: 'website' | 'article';
    publishedTime?: string;
    modifiedTime?: string;
    noindex?: boolean;
    jsonLd?: Array<Record<string, unknown>>;
}

function injectMeta(template: string, meta: MetaInput): string {
    const description = meta.description.replace(/\s+/g, ' ').trim();
    let html = template;

    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`);
    html = setMeta(html, 'name', 'description', description);

    html = setMeta(html, 'property', 'og:type', meta.type);
    html = setMeta(html, 'property', 'og:title', meta.title);
    html = setMeta(html, 'property', 'og:description', description);
    html = setMeta(html, 'property', 'og:image', meta.image);
    html = setMeta(html, 'property', 'og:url', meta.canonical);

    html = setMeta(html, 'property', 'twitter:url', meta.canonical);
    html = setMeta(html, 'property', 'twitter:title', meta.title);
    html = setMeta(html, 'property', 'twitter:description', description);
    html = setMeta(html, 'property', 'twitter:image', meta.image);

    // canonical (brak w szablonie → wstrzyknij)
    const canonicalTag = `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`;
    if (/<link\s+rel="canonical"[^>]*>/i.test(html)) {
        html = html.replace(/<link\s+rel="canonical"[^>]*>/i, canonicalTag);
    } else {
        html = html.replace('</head>', `  ${canonicalTag}\n</head>`);
    }

    const extra: string[] = [];
    if (meta.noindex) extra.push('<meta name="robots" content="noindex, follow" />');
    if (meta.type === 'article' && meta.publishedTime) {
        extra.push(`<meta property="article:published_time" content="${escapeHtml(meta.publishedTime)}" />`);
        if (meta.modifiedTime) extra.push(`<meta property="article:modified_time" content="${escapeHtml(meta.modifiedTime)}" />`);
    }
    for (const obj of meta.jsonLd ?? []) extra.push(jsonLdScript(obj));

    if (extra.length) {
        html = html.replace('</head>', `  ${extra.join('\n  ')}\n</head>`);
    }
    return html;
}

function breadcrumbList(items: Array<{ name: string; url: string }>): Record<string, unknown> {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((it, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: it.name,
            item: it.url,
        })),
    };
}

// CSP z helmeta (scriptSrc bez 'unsafe-inline') blokuje inline'owy skrypt z <head>
// szablonu — ten, który dokłada klasę `.not-landing`. Statycznie serwowany index.html
// nie ma CSP w ogóle, więc tu zdejmujemy nagłówek dla parytetu (to wciąż ten sam
// shell SPA — bez nowej powierzchni ataku).
function sendHtml(res: Response, status: number, html: string, sMaxAge: number): void {
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=86400`);
    res.status(status).send(html);
}

// ── Handlery ─────────────────────────────────────────────────────────────────
function handleSitemap(_req: Request, res: Response): void {
    // `<loc>` w sitemapie MUSI być adresem bezwzględnym (wymóg protokołu), a instancja
    // zna swój adres wyłącznie z `CLIENT_URL`. Bez niej lepiej nie wystawiać nic niż
    // wystawić sitemapę z połamanymi adresami — wyszukiwarka zapamiętałaby śmieci.
    if (!SITE) {
        logger.warn('[SEO] CLIENT_URL nie ustawiony — /sitemap.xml wyłączony (adresy w sitemapie muszą być bezwzględne).');
        res.status(404).type('text/plain').send('Sitemap niedostępny: ustaw CLIENT_URL.');
        return;
    }

    const urls = STATIC_ROUTES.map(
        (r) =>
            `  <url>\n    <loc>${SITE}${r.loc}</loc>\n    <changefreq>${r.changefreq}</changefreq>\n    <priority>${r.priority}</priority>\n  </url>`,
    );

    const xml =
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        urls.join('\n') +
        `\n</urlset>\n`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(xml);
}

// Fabryka handlera dla statycznych stron publicznych (kalkulatory): wstrzykuje
// title/description/OG/canonical + JSON-LD WebApplication i breadcrumb.
function makeStaticPageHandler(page: (typeof STATIC_PAGES)[number]) {
    return (_req: Request, res: Response): void => {
        const template = loadTemplate();
        if (!template) {
            res.status(500).send('Szablon HTML niedostępny');
            return;
        }
        const url = `${SITE}${page.path}`;
        const crumbs = [
            { name: 'Strona główna', url: `${SITE}/` },
            { name: 'Kalkulatory', url: `${SITE}/kalkulatory` },
        ];
        if (page.path !== '/kalkulatory') crumbs.push({ name: page.name, url });

        const html = injectMeta(template, {
            title: page.title,
            description: page.description,
            canonical: url,
            image: DEFAULT_OG_IMAGE,
            type: 'website',
            jsonLd: [
                {
                    '@context': 'https://schema.org',
                    '@type': 'WebApplication',
                    name: page.name,
                    url,
                    applicationCategory: 'FinanceApplication',
                    operatingSystem: 'Web',
                    offers: { '@type': 'Offer', price: '0', priceCurrency: 'PLN' },
                },
                breadcrumbList(crumbs),
            ],
        });
        sendHtml(res, 200, html, 3600);
    };
}

/**
 * Rejestruje trasy SEO. MUSI być wywołane PRZED `express.static(public)` i przed
 * katch-allem SPA, żeby /sitemap.xml trafiał tu, a nie na statyczny plik.
 */
export function registerSeoRoutes(app: Express): void {
    app.get('/sitemap.xml', handleSitemap);
    for (const page of STATIC_PAGES) {
        app.get(page.path, makeStaticPageHandler(page));
    }
}
