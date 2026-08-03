// Typy `test` w konfiguracji bierzemy z importu `vitest/config` poniżej —
// dyrektywy `/// <reference types="vitest" />` były zbędne.
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Trasa `/` jest lazy (App.tsx), więc jej chunki (LandingPageContainer + gsap +
 * landing.css) były odkrywane dopiero PO pobraniu i sparsowaniu entry — dwie
 * sekwencyjne fale sieciowe zanim pojawi się treść. Ten plugin dokleja dla nich
 * preloady, żeby leciały równolegle z falą 1.
 *
 * Warunek `pathname === '/'`: ten sam index.html jest serwowany dla wszystkich tras
 * SPA i nie chcemy dokładać ~62 KB gz zalogowanym wchodzącym na /dashboard.
 * Nazwy plików pochodzą z bundla, nie są wpisane na sztywno — hashe zmieniają się
 * przy każdym buildzie.
 */
function preloadLandingChunks(): Plugin {
  // 'Footer' jest tu nie dla samego JS (~3 KB gz), tylko dlatego, że to ten chunk
  // ciągnie landing.css — bez niego arkusz landingu nadal czekałby na falę 2.
  // GSAP-a tu świadomie NIE MA: animacja wejścia hero jest w CSS, a GSAP obsługuje
  // już tylko efekty scrollowe, więc doładowuje się sam, poza oknem ładowania.
  const WANTED = ['LandingPageContainer', 'Footer']
  return {
    name: 'preload-landing-chunks',
    enforce: 'post',
    transformIndexHtml(html, ctx) {
      const bundle = ctx.bundle
      if (!bundle) return // dev — brak bundla, preloady niepotrzebne

      const scripts = new Set<string>()
      const styles = new Set<string>()
      for (const [fileName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') continue
        if (!WANTED.includes(output.name)) continue
        scripts.add('/' + fileName)
        output.viteMetadata?.importedCss?.forEach((css) => styles.add('/' + css))
      }
      if (!scripts.size && !styles.size) return

      const tags: any[] = []

      // CSS landingu MUSI być zwykłym, blokującym <link rel="stylesheet">, a nie
      // preloadem. Strona główna jest prerenderowana, więc jej markup maluje się
      // zanim ruszy JS — bez tego arkusza hero pojawiłby się bez stylów `.lp-*`
      // i dopiero po wczytaniu bundla przeskoczył do docelowego wyglądu.
      // Reguły są scope'owane pod `.lp`, a plik waży ~3 KB gz, więc obecność na
      // pozostałych trasach jest nieszkodliwa.
      for (const href of styles) {
        tags.push({ tag: 'link', injectTo: 'head', attrs: { rel: 'stylesheet', crossorigin: '', href } })
      }

      // JS landingu preloadujemy tylko na `/` — ten sam index.html serwuje wszystkie
      // trasy SPA i nie ma powodu dokładać go zalogowanym wchodzącym na /dashboard.
      if (scripts.size) {
        tags.push({
          tag: 'script',
          injectTo: 'head',
          children:
            `if(location.pathname==='/'){${JSON.stringify([...scripts])}.forEach(function(h){` +
            `var l=document.createElement('link');` +
            `l.rel='modulepreload';l.crossOrigin='';l.href=h;` +
            `document.head.appendChild(l)})}`,
        })
      }

      return { html, tags }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preloadLandingChunks()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@smartportfel/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Vite domyślnie ignoruje PORT z env — respektujemy go, żeby dało się
    // podnieść równolegle drugi serwer dev na wolnym porcie.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Stabilne, długo-cache'owalne chunki vendorów (FAZA 3). Ciężkie liby
        // (charts/animation/xlsx) lądują osobno i — w parze z lazy trasami — nie
        // wchodzą do krytycznego bundla landingu.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          // lucide-react ma jeden plik na ikonę, więc Rollup robił z nich 14
          // OSOBNYCH chunków — 14 zapytań po ~1 KB. Na telefonie liczy się nie
          // rozmiar, tylko liczba round-tripów: te 14 kosztowało więcej niż bajty,
          // które niosły. Sklejone w jeden chunk to nadal ~20 KB, bo tree-shaking
          // i tak zostawia wyłącznie faktycznie użyte ikony.
          if (id.includes('lucide-react')) return 'icons';
          // MUSI być przed regułą 'charts'. clsx jest zależnością recharts, ale trafia
          // też do entry przez lib/utils.ts -> cn(). Bez jawnego przypisania Rollup
          // scala ~380 B clsx do chunku 'charts' i entry robi modulepreload na ~109 KB
          // gz wykresów, których landing nie ma ani jednego.
          if (id.includes('/clsx/') || id.includes('/tailwind-merge/')) {
            return 'react-vendor';
          }
          if (id.includes('react-router') || id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react-vendor';
          }
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('/d3/') || id.includes('victory-vendor')) {
            return 'charts';
          }
          // gsap i framer-motion rozdzielone: landing używa wyłącznie gsap, a ekrany
          // aplikacji/kalkulatory wyłącznie framera. Sklejone w jeden chunk kazały
          // każdej z tych stron pobierać ~44 KB gz drugiej biblioteki.
          if (id.includes('/gsap/')) {
            return 'gsap';
          }
          if (id.includes('framer-motion') || id.includes('/motion/')) {
            return 'framer';
          }
          if (id.includes('/xlsx/') || id.includes('papaparse')) {
            return 'data-tools';
          }
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})


