import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import LandingPage from './pages/LandingPage/LandingPageContainer';

/**
 * Punkt wejścia dla prerenderu strony głównej (scripts/prerender.mjs).
 *
 * Landing jest w 100% statyczny — nie używa react-routera ani żadnego API
 * przeglądarki w trakcie renderu (`useIsLoggedIn` celowo zwraca `false` przy
 * pierwszym renderze), więc wystarczy owinąć go HelmetProviderem.
 *
 * Zwracamy WYŁĄCZNIE markup body. Meta z <head> nie wstrzykujemy — index.html ma
 * już komplet statycznych tagów dla `/`, a duplikat title/canonical byłby błędem SEO.
 */
export function render(): string {
    return renderToString(
        <HelmetProvider context={{}}>
            <LandingPage />
        </HelmetProvider>
    );
}
