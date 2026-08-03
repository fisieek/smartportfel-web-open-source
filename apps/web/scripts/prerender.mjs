/**
 * Prerender strony głównej do statycznego HTML.
 *
 * Po co: `/` była pustym `<div id="root">`, więc przeglądarka nie miała czego
 * pokazać, dopóki nie pobrała i nie wykonała JS. Teraz treść jest w HTML, a że
 * animacja wejścia hero siedzi w CSS (landing.css), to i ona gra od pierwszej
 * klatki — bez czekania na jakikolwiek bundle.
 *
 * Jak: budujemy landing osobnym buildem SSR, renderujemy do stringa i wstrzykujemy
 * do `dist/index.html`. Klient (main.tsx) wykrywa markup w #root i HYDRATUJE.
 *
 * Uruchamiane jako `postbuild` — patrz package.json.
 */
import { build } from 'vite';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distHtml = path.join(root, 'dist/index.html');
const shellHtml = path.join(root, 'dist/index.shell.html');
const ssrOutDir = path.join(root, '.prerender');

const ROOT_DIV = '<div id="root"></div>';

async function main() {
    // 1. Build SSR samego landingu (osobny outDir, żeby nie mieszać do dist/)
    await build({
        root,
        logLevel: 'warn',
        // react-helmet-async i lucide-react to CommonJS — zostawione jako external
        // wywalają się przy imporcie z ESM ("Named export not found"). Każemy Vite
        // je zbundlować, wtedy interop CJS→ESM robi bundler.
        ssr: { noExternal: ['react-helmet-async', 'lucide-react'] },
        build: {
            ssr: path.join(root, 'src/entry-prerender.tsx'),
            outDir: ssrOutDir,
            emptyOutDir: true,
            // CSS jest już zlinkowany w index.html z buildu klienckiego —
            // z SSR nie potrzebujemy żadnych assetów, tylko markupu.
            cssCodeSplit: false,
        },
    });

    // 2. Render do stringa
    const entry = path.join(ssrOutDir, 'entry-prerender.js');
    const { render } = await import(`file://${entry}`);
    const html = render();

    if (!html || html.length < 1000) {
        throw new Error(`Prerender zwrocil podejrzanie krotki markup (${html?.length ?? 0} znakow)`);
    }

    // 3. Wstrzyknięcie do dist/index.html
    const template = await readFile(distHtml, 'utf-8');
    if (!template.includes(ROOT_DIV)) {
        throw new Error(`Nie znaleziono "${ROOT_DIV}" w dist/index.html — zmienil sie szablon?`);
    }

    // Czysta skorupa SPA obok prerenderu. Prerenderowany index.html nalezy
    // WYLACZNIE do `/` — kazda inna trasa dostaje ta skorupe:
    //   * catch-all SPA w serwerze (/login, /dashboard, ... -> /index.shell.html),
    //   * serwerowe wstrzykiwanie meta (kalkulatory — apps/server/src/seo/seo.ts).
    // Inaczej kazda podstrona wiozla by w HTML ~97 KB markupu landingu: duplikat
    // tresci dla crawlerow (/login i /register sa w sitemapie!) i martwy balast
    // na sciezce krytycznej telefonu.
    await writeFile(shellHtml, template, 'utf-8');

    const out = template.replace(ROOT_DIV, `<div id="root">${html}</div>`);
    await writeFile(distHtml, out, 'utf-8');

    // 4. Sprzątanie
    await rm(ssrOutDir, { recursive: true, force: true });

    const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
    console.log(`✓ prerender: landing wstrzykniety do dist/index.html (${kb} KB, markup ${html.length} znakow)`);
    const shellKb = (Buffer.byteLength(template, 'utf8') / 1024).toFixed(1);
    console.log(`✓ prerender: czysta skorupa zapisana do dist/index.shell.html (${shellKb} KB — dokument wszystkich tras poza /)`);
}

main().catch((err) => {
    console.error('✗ prerender nie powiodl sie:', err);
    process.exit(1);
});
