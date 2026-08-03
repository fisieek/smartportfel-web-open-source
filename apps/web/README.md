# @smartportfel/web

Frontend SmartPortfela: React 18 + TypeScript + Vite + Tailwind CSS.

Instalacja, konfiguracja i uruchomienie całego projektu: **[README w korzeniu repozytorium](../../README.md)**.

## Skrypty

```bash
pnpm dev      # serwer deweloperski Vite (http://localhost:5173)
pnpm build    # tsc -b + vite build + prerender landinga
pnpm preview  # podgląd zbudowanej wersji
pnpm test     # vitest + testing-library
pnpm lint     # eslint
```

## Warto wiedzieć

- **Zmienne środowiskowe** opisuje [`.env.example`](.env.example). Wszystko z prefiksem `VITE_`
  ląduje w bundlu wysyłanym do przeglądarki — nigdy nie wpisuj tam sekretów.
- **Front woła API bezpośrednio** (`http://localhost:3000/api` w dev), nie przez proxy Vite.
  Jeśli dev server wstanie na innym porcie niż 5173/5174, dopisz jego adres do
  `CORS_ALLOWED_ORIGINS` w `.env` serwera.
- **Landing jest prerenderowany** — `scripts/prerender.mjs` buduje go osobnym buildem SSR
  i wstrzykuje HTML do `dist/index.html`, a klient go hydratuje. Dzięki temu treść i animacja
  wejścia są widoczne, zanim pobierze się jakikolwiek bundle.
- **Typy sprawdzaj przez `tsc -b`** (tak robi skrypt `build`), nie przez `tsc --noEmit` — cache
  trybu incremental potrafi przepuścić błąd, który build złapie dopiero na wdrożeniu.
- **GSAP na landingu ładuje się leniwie.** Odwołanie do globalnego `gsap` przechodzi typecheck,
  ale wywala się w runtime — dlatego pilnuje tego osobna reguła lintera. Używaj
  `getGsap()` / `peekGsap()` z `useLandingGsap`.
