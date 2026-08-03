import { Helmet } from 'react-helmet-async';

interface SEOProps {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: 'website' | 'article';
    /** Wyłącz indeksowanie (np. strona „nie znaleziono"). */
    noindex?: boolean;
    /** Data publikacji (ISO) dla artykułów → og/article:published_time. */
    publishedTime?: string;
    /** Surowy JSON-LD do wstrzyknięcia (np. WebApplication). */
    jsonLd?: Record<string, unknown>;
}

/**
 * Adres kanoniczny instancji. ŚWIADOMIE liczony z `window.location.origin`, a nie zaszyty:
 * ten kod stoi pod dowolną domeną, a zaszyty adres kazałby cudzym instancjom ogłaszać
 * w metatagach OG i w `<link rel="canonical">` czyjąś inną witrynę.
 *
 * Podczas prerenderu (SSR w scripts/prerender.mjs) `window` nie istnieje — zostaje pusty
 * string, czyli adresy względne. Klient nadpisze je przy pierwszym renderze.
 */
const site = () => (typeof window !== 'undefined' ? window.location.origin : '');

const defaultMeta = {
    title: 'SmartPortfel - Twój inteligentny asystent finansowy',
    description: 'Zarządzaj swoimi finansami inteligentnie z SmartPortfel. Śledź wydatki, planuj budżet i oszczędzaj efektywniej.',
    image: '/og-image.png',
    url: '/',
};

export function SEO({
    title,
    description = defaultMeta.description,
    image = defaultMeta.image,
    url = defaultMeta.url,
    type = 'website',
    noindex = false,
    publishedTime,
    jsonLd,
}: SEOProps) {
    const fullTitle = title ? `${title} | SmartPortfel` : defaultMeta.title;
    const origin = site();
    const fullImageUrl = image.startsWith('http') ? image : `${origin}${image}`;
    const canonical = url.startsWith('http') ? url : `${origin}${url}`;

    return (
        <Helmet>
            <html lang="pl" />
            <title>{fullTitle}</title>
            <meta name="description" content={description} />
            <link rel="canonical" href={canonical} />
            {noindex && <meta name="robots" content="noindex, follow" />}

            {/* Open Graph */}
            <meta property="og:type" content={type} />
            <meta property="og:site_name" content="SmartPortfel" />
            <meta property="og:locale" content="pl_PL" />
            <meta property="og:title" content={fullTitle} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={fullImageUrl} />
            <meta property="og:url" content={canonical} />
            {type === 'article' && publishedTime && (
                <meta property="article:published_time" content={publishedTime} />
            )}

            {/* Twitter */}
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={fullTitle} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={fullImageUrl} />

            {jsonLd && (
                <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
            )}
        </Helmet>
    );
}
