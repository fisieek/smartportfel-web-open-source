# SmartPortfel

**Otwarta aplikacja do finansów osobistych.**

> **In English:** SmartPortfel is a personal finance app for the Polish market — expenses, bank
> accounts, investments, savings goals, mortgages and PPK (the Polish workplace pension scheme)
> in one place. Free, MIT-licensed and self-hostable. AI features are **bring-your-own-key**.
> **The interface, the code comments and the documentation are in Polish**, because the product
> is built for Polish users and their tax and pension rules.

## Co potrafi

- **Wydatki i przychody** — ręcznie albo importem z CSV/XLSX, z kategoryzacją i regułami sklepów
- **Konta osobiste** — salda, transfery, wielowalutowość (przeliczenia po kursach NBP)
- **Inwestycje** — portfel aktywów, wyceny w PLN, realny zysk, cena złota z NBP
- **Oszczędności** — cele, wpłaty, lokaty, rozliczanie odsetek
- **Kredyty hipoteczne** — harmonogramy, nadpłaty, symulacje
- **PPK** — śledzenie Pracowniczych Planów Kapitałowych
- **Budżet i planowanie** — wydatki stałe, subskrypcje, oś czasu płatności
- **Gospodarstwo domowe** — wspólne finanse dla kilku osób
- **Gamifikacja** — serie i odznaki
- **Publiczne kalkulatory** — wynagrodzeń (UoP/zlecenie/B2B), oszczędności, PPK, zdolności
  kredytowej, nadpłaty i rat kredytu
- **Serwer MCP** — dostęp do własnych danych z klienta MCP (Claude Desktop, Perplexity)
- **Funkcje AI na Twoim kluczu** — kategoryzacja transakcji, odczyt wyciągów PDF, import
  inwestycji, dodawanie wydatków językiem naturalnym

## AI działa na Twoim kluczu (BYOK)

W Ustawieniach podajesz własny klucz **Gemini** albo **OpenAI**. Serwer trzyma go zaszyfrowanego
(AES-256-GCM, związany z Twoim `userId`) i nigdy nie zwraca do przeglądarki. Zapytania idą na
Twój rachunek, bezpośrednio do dostawcy.

**Instancja nie ma własnego klucza do modeli.** Bez klucza aplikacja działa normalnie — tracisz
tylko funkcje AI. Import CSV/XLSX od AI nie zależy: parsowanie dzieje się w przeglądarce.

## Notowania

Repozytorium nie zawiera żadnego dostawcy notowań giełdowych. Wartość rynkową pozycji wpisujesz
ręcznie („Wpisz ceny" w Portfelu) lub bierzesz z importowanego wyciągu.

Cena złota i kursy walut korzystają z publicznego API NBP.

## Stack

| Warstwa | Technologia |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express 4, Prisma ORM |
| Baza | PostgreSQL |
| E-mail | Resend |

```
apps/server        — API (Express + Prisma)
apps/web           — SPA (React + Vite), landing z prerenderem
packages/shared    — logika współdzielona front/back
packages/contracts — typy kontraktów API
```

## Uruchomienie u siebie

Wymagania: **Node ≥ 22**, **pnpm 10**, **PostgreSQL**. Bazę stawiasz gdzie chcesz — kod potrzebuje
tylko adresu połączenia.

```bash
git clone https://github.com/fisieek/smartportfel-web-open-source.git
cd smartportfel-web-open-source
pnpm install
cp apps/server/.env.example apps/server/.env
```

Uzupełnij `DATABASE_URL`, `DIRECT_URL` i `JWT_SECRET` (min. 32 znaki — bez tego serwer nie
wystartuje). Resztę zmiennych opisuje `.env.example`. Potem:

```bash
pnpm db:deploy
pnpm dev
```

Front na `http://localhost:5173`, API na `http://localhost:3000`.

### Warto wiedzieć

- **Bez `RESEND_API_KEY` nie dojdzie mail weryfikacyjny.** Konto potwierdzisz w bazie:
  `UPDATE users SET "isEmailVerified"=true WHERE email='…';`
- **`AI_KEY_ENCRYPTION_KEY` ustaw raz i nie zmieniaj** — zmiana unieważnia wszystkie zapisane
  klucze użytkowników.
- **Typy serwera sprawdzaj z flagą `--noEmit`**
  (`npx tsc -p apps/server/tsconfig.json --noEmit`). Bez niej `tsc` wysypie pliki `.js` obok
  źródeł i popsuje testy.

## Wdrożenie

To zwykła aplikacja Node — postawisz ją na VPS-ie, w kontenerze albo na dowolnej platformie PaaS.

```bash
pnpm install && pnpm build && pnpm db:deploy && pnpm start
```

Jeden proces serwuje API, zbudowany front z `public/` i routing SPA. Na produkcji ustaw
`CLIENT_URL` na publiczny adres instancji — bez tego CORS przepuści tylko localhost, a adresy
kanoniczne i sitemap nie zadziałają. Endpointy `/api/system/cron/*` chroni `CRON_SECRET`;
podepnij je pod dowolny harmonogram.

## Strony prawne

`/regulamin`, `/polityka-prywatnosci` i `/polityka-cookies` to celowo puste zaślepki. Treść
zależy od podmiotu prowadzącego instancję — uzupełnij je, zanim udostępnisz ją komukolwiek
poza sobą.

## Testy

```bash
pnpm --filter @smartportfel/server test    # nie wymaga bazy danych
pnpm --filter @smartportfel/web test
pnpm --filter @smartportfel/web lint
```

To samo puszcza CI przy każdym pushu i pull requeście — [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Bezpieczeństwo

Znalazłeś podatność? **Nie zakładaj publicznego issue** — patrz [SECURITY.md](SECURITY.md).

## Licencja

Kod: **MIT** — patrz [LICENSE](LICENSE).

**Nazwa „SmartPortfel", logo i identyfikacja wizualna nie są objęte licencją kodu.** Możesz
postawić własną instancję, zmieniać kod i go redystrybuować, ale nie pod tą nazwą ani z tym logo.

Fonty w `apps/web/public/fonts/` są na licencji SIL Open Font License 1.1 — tekst licencji leży
obok plików.
