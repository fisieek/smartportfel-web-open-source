import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import App from './App.tsx'

// Konfiguracja TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dane "świeże" przez 5 minut - nie będą re-fetchowane
      staleTime: 5 * 60 * 1000,
      // Cache przez 30 minut
      gcTime: 30 * 60 * 1000,
      // Retry 2 razy przy błędzie
      retry: 2,
      // Refetch przy powrocie do zakładki
      refetchOnWindowFocus: true,
    },
  },
})

const container = document.getElementById('root')!

const tree = (
  <StrictMode>
    <ErrorBoundary fallback={<div style={{ padding: 24, textAlign: 'center' }}>Coś poszło nie tak. Odśwież stronę — błąd został zgłoszony.</div>}>
      <QueryClientProvider client={queryClient}>
        <HelmetProvider>
          <App />
        </HelmetProvider>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
)

// Prerenderowany jest WYŁĄCZNIE landing (scripts/prerender.mjs) i tylko `/` dostaje
// index.html — pozostałe trasy serwowane są ze skorupy index.shell.html (catch-all
// SPA w serwerze, SSR meta w apps/server/src/seo/seo.ts). Stąd warunek na ścieżkę:
// na `/` mamy pasujący markup i HYDRATUJEMY (createRoot wyrzuciłby serwerowy HTML
// i przemalował stronę, marnując cały zysk); gdzie indziej #root jest pusty, więc
// renderujemy normalnie.
//
// Czyszczenie #root i `.not-landing` zostają jako siatka bezpieczeństwa: gdyby
// jakaś trasa dostała jednak prerenderowany index.html (pomyłka w konfiguracji
// serwera albo proxy), landing i tak nie mignie ani nie zostanie na ekranie.
if (window.location.pathname === '/' && container.hasChildNodes()) {
  hydrateRoot(container, tree)
} else {
  container.innerHTML = ''
  document.documentElement.classList.remove('not-landing')
  createRoot(container).render(tree)
}
