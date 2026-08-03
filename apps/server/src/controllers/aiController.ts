import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateText, generateObject } from 'ai';
import { z } from 'zod';
import { getAiModelFor } from '../services/ai/aiClient';
import { resolveAiKey } from '../services/ai/aiKeyService';
import { resolveStoreCategory } from '../services/mcp/resolveStoreCategory';
import { captureServerError } from '../lib/reportError';
// Ekstrakcja tekstu z PDF: unpdf (dynamiczny import w parsePdf). Wcześniej pdf-parse@2
// wymagał natywnego @napi-rs/canvas (DOMMatrix), który nie pakował się w funkcji serverless
// serverless → 500 na /parse-pdf. unpdf ma własny serverless-owy build pdfjs, bez canvas.

// Maks. długość tekstu wysyłanego do modelu. Gemini ma ogromny kontekst, więc
// limit jest hojny — chroni głównie przed skrajnie dużymi plikami i nie ucina
// realnych wyciągów (np. XTB ~20k znaków) w połowie wiersza.
const AI_TEXT_LIMIT = 50000;

// Gemini 2.5 Flash domyślnie „myśli" (reasoning) → ~6× wolniej przy structured output
// (44 pozycje: 55s → 9s). Nasze zadania (ekstrakcja z tabeli, kategoryzacja) reasoningu nie
// wymagają, więc wyłączamy. Klucz `google` jest ignorowany przez OpenAI.
const AI_PROVIDER_OPTIONS = { google: { thinkingConfig: { thinkingBudget: 0 } } } as any;

export const mapTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { transactions } = req.body;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const resolution = await resolveAiKey(userId);
    if (!resolution.ok) {
      return res.status(resolution.status).json({
        message: resolution.message,
        code: resolution.code,
      });
    }
    const aiKey = resolution.key;

    // BYOK: klucz jest użytkownika, więc nie ma limitu ani przycinania paczek.
    const transactionsToProcess = transactions;

    // Lista kategorii i sklepów jest w prompcie zaszyta na sztywno (niżej) — celowo, bo to
    // słownik mapowania, nie dane użytkownika. NIE dociągać tu kategorii z bazy: zapytanie bez
    // `where` obejmuje kategorie wszystkich kont instancji i przy wstawieniu do promptu wysłałoby
    // cudze nazwy do dostawcy AI.
    const prompt = `Jesteś ekspertem od finansów osobistych. Twoim zadaniem jest analiza i kategoryzacja surowych opisów transakcji bankowych.

### ZDEFINIOWANA LISTA SKLEPÓW (Baza wiedzy):
Oto JEDYNE dozwolone nazwy sklepów dla poszczególnych kategorii.
Jeśli rozpoznasz sklep, MUSISZ użyć dokładnej nazwy z tej listy.

- **Sklepy spożywcze**: Biedronka, Lidl, Kaufland, Auchan, Carrefour, Tesco, Żabka, Lewiatan, Dino, Netto, Stokrotka, Aldi, Społem, Dealz. (Fallback: "Pozostałe sklepy spożywcze")
- **Stacje Paliw**: Orlen, BP, Shell, Lotos, Circle K, Amic. (Fallback: "Inna stacja paliw")
- **Restauracje**: McDonalds, KFC, Burger King, Pizza Hut, Starbucks, Costa Coffee, Grycan, Manekin, Pyszne.pl, Uber Eats, Wolt, Glovo. (Fallback: "Restauracja")
- **Markety budowlane**: Castorama, Leroy Merlin, OBI, Bricoman, Mrówka. (Fallback: "Market budowlany")
- **Elektronika**: RTV Euro AGD, Media Expert, Media Markt, X-Kom, Komputronik, Morele, Samsung, Apple, iSpot. (Fallback: "Sklep elektroniczny")
- **Ubrania i buty**: Zara, H&M, Reserved, eobuwie, Zalando, Modivo, TK Maxx, Pepco, CCC, Deichmann, Sinsay, Mohito, Cropp, House. (Fallback: "Inny sklep odzieżowy")
- **Apteki**: DOZ, Gemini, Cefarm, SuperPharm, Super-Pharm. (Fallback: "Apteka")
- **Transport**: Uber, Bolt, Free Now, FreeNow, Taxi, MPK, ZTM, Jakdojade, PKP, Intercity, SKM, Bilety, Autostrada, Hulajnoga, Samochód. (Fallback: "Inny rodzaj transportu")
- **Rozrywka**: Kino, Teatr, Opera, Koncert, Netflix, Spotify, Steam, PlayStation, Xbox, Nintendo, Ticketmaster, eBilet. (Fallback: "Rozrywka")
- **Usługi beauty**: Fryzjer, Barber, Kosmetyczka, Paznokcie, Manicure, Pedicure. (Fallback: "Usługi beauty")
- **Służba zdrowia**: Dermatolog, Dentysta, Stomatolog, Ortodonta, Okulista, LuxMed, Medicover, Badania, Kardiolog, Fizjoterapeuta, Przychodnia, Szpital, Laboratorium, Diagnostyka. (Fallback: "Lekarz")
- **Drogerie**: Rossmann, Hebe, Douglas, Sephora, Natura, Chemia. (Fallback: "Drogeria")
- **Podróże**: Booking, Airbnb, LOT, Ryanair, Wizzair, Hotel, Nocleg. (Fallback: "Wycieczka")
- **Zakupy internetowe**: Allegro, Amazon, eBay, AliExpress, Temu, Shein, InPost, Paczkomat. (Fallback: "Sklep online")
- **Abonamenty**: Orange, T-Mobile, Play, Plus, UPC, Vectra, Multimedia, Canal+, Cyfrowy Polsat, Telefon. (Fallback: "Abonament")
- **Zajęcia Sportowe**: Multisport, Siłownia, Joga, Fitness, Basen, Decathlon, Martes, Intersport, Zdrofit, CityFit. (Fallback: "Sport")
- **Opłaty**: PGE, Gaz, Prąd, Śmieci, Czynsz, Podatki, Energa, PGNiG, Wodociągi, Mieszkanie, Internet, Urząd Skarbowy. (Fallback: "Inne opłaty")
- **Dom**: IKEA, Jysk, Duka, Home&You, Action, Tedi, Agata Meble, Black Red White. (Fallback: "Meble")
- **Jedzenie i napoje**: Alkohol, Winoteka, Bar, Pub. (Fallback: "Miasto")
- **Edukacja**: Księgarnia, Empik, Kurs, Szkoła, Uczelnia, Studia, Udemy, Coursera, Angielski. (Fallback: "Edukacja")
- **Działalność gospodarcza**: ZUS, PPE, VAT, PIT, Księgowy, Biuro Rachunkowe. (Fallback: "Inny koszt")
- **Ubezpieczenia**: OC, AC, Ubezpieczenie na Życie, Ubezpieczenie Zdrowotne, Ubezpieczenie Turystyczne, NNW, Generali. (Fallback: "Inne ubezpieczenie")
- **Inne**: Inne.

### INSTRUKCJA DOPASOWANIA:
1. Analiza: Sprawdź opis transakcji (np. "Biedra" -> "Biedronka", "Super Farma" -> "SuperPharm", "Market budowlany" -> kategoria "Markety budowlane").
2. Jeśli marka z listy -> użyj jej nazwy. Jeśli brak marki -> użyj Fallbacka z kategorii.
3. NIE wymyślaj własnych nazw sklepów.
4. KAŻDA transakcja MUSI mieć przypisaną kategorię - jeśli nie możesz dopasować, użyj kategorii "Inne".

### ZASADY DLA WPŁYWÓW (Income):
- Kategoria: "Wpływ"
- Sklep: TYLKO ["Wypłata", "Premia", "Zwrot", "Inny przychód", "Odsetki", "Dywidenda", "Ankieta", "Sprzedaż", "Obligacje"].

### FORMAT WYJŚCIOWY:
Zwróć TYLKO JSON array. Każdy obiekt MUSI zawierać:
- "original": DOKŁADNIE taki sam tekst jak w danych wejściowych (case-sensitive, bez zmian)
- "store": rozpoznana nazwa sklepu lub Fallback
- "category": nazwa kategorii z listy powyżej (NIGDY nie zostawiaj pustego!)

WAŻNE: Jeśli nie wiesz jakiej kategorii użyć, zawsze użyj "Inne".

Przykłady:
[{"original": "Biedra zakupy", "store": "Biedronka", "category": "Sklepy spożywcze"},
{"original": "Super-Pharm", "store": "Super-Pharm", "category": "Apteki"},
{"original": "Market budowlany", "store": "Market budowlany", "category": "Markety budowlane"},
{"original": "Nieznany sklep XYZ", "store": "Inne", "category": "Inne"}]

### TRANSAKCJE DO ANALIZY:
${transactionsToProcess.join('\n')}
`;


    const { text } = await generateText({
      model: getAiModelFor(aiKey),
      prompt,
      providerOptions: AI_PROVIDER_OPTIONS,
    });

    // console.log('[AI Mapping] Received response');

    // Parse JSON from text (in case there's markdown formatting)
    const jsonMatch = text.match(/\[.*\]/s);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    res.json({
      mappings: result,
      processedCount: transactionsToProcess.length,
      skippedCount: 0,
    });
  } catch (error: any) {
    console.error('[AI Mapping] Full Error Information:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      status: error.status,
      code: error.code,
      data: error.response?.data,
      headers: error.response?.headers
    });

    // Rate-limit darmowego tier AI Gateway → 429 (a nie mylące 500), bez palenia kredytów.
    const status = error.statusCode || error.status || error.response?.status;
    const isRateLimited = status === 429 || /rate.?limit|too many requests|quota|free tier/i.test(error.message || '');
    if (isRateLimited) {
      return res.status(429).json({
        message: 'Limit zapytań darmowego AI chwilowo wyczerpany',
        details: error.message,
        rateLimited: true,
      });
    }

    captureServerError(error, req);
    res.status(500).json({
      message: 'Error during AI mapping',
      details: process.env.NODE_ENV !== 'production' ? error.message : 'Internal server error',
    });
  }
};

// ── Milestone C · C0: „tekst → otypowana transakcja" ────────────────────────
// Jeden addytywny endpoint dla mobilnego arkusza „szybkiego dodawania": użytkownik
// wpisuje zdanie po polsku („Biedronka 45 zł", „wczoraj paliwo Orlen 200",
// „kupiłem 3 akcje Apple po 200 USD", „przelew 500 na oszczędności"), a AI zwraca
// otypowaną, gotową do zapisu pozycję. Kategorię NADPISUJEMY autorytatywnie z bazy
// (resolveStoreCategory), żeby nie zapisywać halucynacji modelu.
const quickParseSchema = z.object({
  type: z.enum(['expense', 'income', 'investment', 'transfer'])
    .describe('Typ operacji: expense=wydatek, income=wpływ/przychód, investment=zakup instrumentu (akcje/ETF/krypto), transfer=przelew własny (na oszczędności/inwestycje/między kontami)'),
  amount: z.coerce.number().describe('Kwota operacji jako liczba dodatnia (bez waluty i znaku)'),
  name: z.string().describe('Krótka etykieta: dla wydatku nazwa sklepu/odbiorcy (np. "Biedronka"), dla wpływu źródło (np. "Wypłata"), dla inwestycji nazwa instrumentu (np. "Apple"), dla przelewu cel (np. "Oszczędności")'),
  quantity: z.coerce.number().optional().describe('Tylko dla inwestycji: liczba sztuk/jednostek, jeśli podana'),
  currency: z.string().optional().describe('Waluta ISO 4217 (PLN, USD, EUR, GBP...). Pomiń, gdy nie wskazano — domyślnie PLN'),
  date: z.string().optional().describe('Data operacji w formacie YYYY-MM-DD, jeśli podana lub wynika z tekstu (np. "wczoraj"). Pomiń, gdy brak — wtedy dziś'),
  confidence: z.coerce.number().describe('Pewność interpretacji 0..1'),
});

/**
 * POST /api/ai/quick-parse
 * Fundament smart-add (Milestone C, C0). Wejście: { text }. Wyjście: pojedyncza
 * otypowana pozycja + (dla expense/income) kategoria rozwiązana z bazy.
 * Działa na kluczu użytkownika (BYOK) — bez klucza 402 AI_KEY_REQUIRED, bez limitów.
 */
export const quickParse = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Brak tekstu do analizy' });
    }
    const resolution = await resolveAiKey(userId);
    if (!resolution.ok) {
      return res.status(resolution.status).json({
        message: resolution.message,
        code: resolution.code,
      });
    }
    const aiKey = resolution.key;

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Jesteś asystentem finansów osobistych. Zamień jedno zdanie użytkownika (po polsku) na JEDNĄ otypowaną operację finansową.

Dziś jest ${today} (użyj do dat względnych: "wczoraj" = wczorajsza data, "w piątek" = ostatni piątek, itp.).

ZASADY:
- type: wybierz spośród expense / income / investment / transfer.
  - expense = wydatek (zakup, opłata, rachunek). To domyślny typ, gdy nie ma przesłanek za innym.
  - income = wpływ/przychód (wypłata, premia, zwrot, odsetki).
  - investment = zakup instrumentu inwestycyjnego (akcje, ETF, krypto, obligacje) — słowa "akcje", "ETF", "kupiłem X sztuk".
  - transfer = przelew własny między kontami (np. "przelew na oszczędności", "odłóż na inwestycje").
- amount: liczba dodatnia (kwota). "45 zł", "200", "1,5k" → 45 / 200 / 1500.
- name: krótka etykieta (sklep/odbiorca/źródło/instrument/cel).
- quantity: TYLKO dla inwestycji, jeśli podano liczbę sztuk.
- currency: gdy wskazano ("USD", "dolarów", "$", "euro"); inaczej pomiń (domyślnie PLN).
- date: YYYY-MM-DD, tylko gdy wynika z tekstu; inaczej pomiń.
- confidence: 0..1 — jak pewna jest interpretacja.

ZDANIE UŻYTKOWNIKA:
${text.trim()}`;

    const { object } = await generateObject({
      model: getAiModelFor(aiKey),
      schema: quickParseSchema as any, // `any` (nie z.ZodType) — tłumi TS2589 deep-instantiation w ai@6 + TS 5.3
      prompt,
      providerOptions: AI_PROVIDER_OPTIONS,
    });
    const parsed = quickParseSchema.parse(object);

    // Dla wydatku/wpływu rozwiąż kategorię autorytatywnie z bazy (nie z halucynacji modelu).
    const result: Record<string, any> = { ...parsed };
    if (parsed.type === 'expense' || parsed.type === 'income') {
      const resolved = await resolveStoreCategory(userId, parsed.name);
      result.store = resolved.store;
      result.categoryId = resolved.categoryId;
      result.categoryName = resolved.categoryName;
    }
    res.json({ result });
  } catch (error: any) {
    console.error('[AI quickParse] Error:', error?.message);
    const status = error.statusCode || error.status || error.response?.status;
    const isRateLimited = status === 429 || /rate.?limit|too many requests|quota|free tier/i.test(error.message || '');
    if (isRateLimited) {
      return res.status(429).json({ message: 'Limit zapytań darmowego AI chwilowo wyczerpany', details: error.message, rateLimited: true });
    }
    captureServerError(error, req);
    res.status(500).json({ message: 'Błąd analizy tekstu', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};


// Schemat mapowania kolumn wyciągu (indeksy 0-based; null gdy kolumna nie istnieje).
interface ColumnMappingResult {
  dateColumn: number;
  descriptionColumn: number;
  amountColumn: number | null;
  debitColumn: number | null;
  creditColumn: number | null;
  currencyColumn: number | null;
}

const ColumnMappingSchema: z.ZodType<ColumnMappingResult> = z.object({
  dateColumn: z.number().int(),
  descriptionColumn: z.number().int(),
  amountColumn: z.number().int().nullable(),
  debitColumn: z.number().int().nullable(),
  creditColumn: z.number().int().nullable(),
  currencyColumn: z.number().int().nullable(),
});

/**
 * POST /api/ai/detect-columns
 * Fallback dla parsera wyciągów: gdy heurystyka nie rozpozna układu kolumn,
 * AI wskazuje indeksy kolumn (data, opis, kwota/obciążenia/uznania, waluta).
 * Koszt: 1 kredyt AI (gating PRO jak przy kategoryzacji).
 */
export const detectColumns = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { headers, sampleRows } = req.body;
    if (!Array.isArray(headers) || !Array.isArray(sampleRows)) {
      return res.status(400).json({ message: 'Wymagane: headers[] oraz sampleRows[][]' });
    }

    const resolution = await resolveAiKey(userId);
    if (!resolution.ok) {
      return res.status(resolution.status).json({
        message: resolution.message,
        code: resolution.code,
      });
    }
    const aiKey = resolution.key;

    const sample = (sampleRows as any[][]).slice(0, 15);
    const prompt = `Analizujesz wyciąg bankowy. Poniżej nagłówki kolumn i przykładowe wiersze (indeksy 0-based).
Wskaż indeksy kolumn:
- dateColumn: data transakcji,
- descriptionColumn: opis/tytuł/odbiorca,
- amountColumn: pojedyncza kolumna kwoty ZE ZNAKIem (+/-) — lub null jeśli kwoty są w dwóch osobnych kolumnach,
- debitColumn / creditColumn: gdy obciążenia i uznania są w osobnych kolumnach (inaczej null),
- currencyColumn: waluta (null jeśli brak).
Zwróć WYŁĄCZNIE indeksy istniejących kolumn. Jeśli jest jedna kolumna kwoty, ustaw amountColumn i debit/credit = null.

NAGŁÓWKI (index: nazwa):
${(headers as any[]).map((h, i) => `${i}: ${h}`).join('\n')}

PRZYKŁADOWE WIERSZE:
${sample.map(r => JSON.stringify(r)).join('\n')}`;

    // schema rzutowany na `any`, by uniknąć TS2589 (deep type instantiation)
    const result = await generateObject({
      model: getAiModelFor(aiKey),
      schema: ColumnMappingSchema as any, // `any` (nie z.ZodType) — jedyne tłumi TS2589 deep-instantiation w ai@6 + TS 5.3
      prompt,
      providerOptions: AI_PROVIDER_OPTIONS,
    });
    const object = ColumnMappingSchema.parse(result.object);

    res.json({ mapping: object });
  } catch (error: any) {
    console.error('[AI detectColumns] Error:', error?.message);
    captureServerError(error, req);
    res.status(500).json({ message: 'Błąd wykrywania kolumn', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};

// ── Wspólna ekstrakcja inwestycji z tekstu (PDF i CSV/XLSX) ──────────────────
// Realne wyciągi brokerskie (XTB/Revolut) mają zmienne układy, więc zamiast
// sztywnego mapowania kolumn czytamy je AI-em — wspólny schemat + prompt dla
// parsePdf (INVESTMENT) i mapInvestments (CSV/XLSX).
// Pola celowo OPCJONALNE + z.coerce.number(): realne wyciągi bywają niekompletne,
// a przy `generateObject` jedno brakujące/odbiegające pole w JEDNEJ pozycji wywalało
// walidację CAŁEJ tablicy (NoObjectGeneratedError → 500). Lepiej przepuścić pozycję
// (front oznaczy ją jako niekompletną do ręcznej korekty) niż utracić cały import.
const investmentSchema = z.object({
  investments: z.array(z.object({
    date: z.string().optional().describe('Data otwarcia/zakupu pozycji w formacie YYYY-MM-DD'),
    name: z.string().describe('Czytelna nazwa pozycji — ZAWSZE wypełnij. Jeśli rozpoznajesz ticker/symbol, ROZWIŃ go do pełnej nazwy spółki/funduszu (GOOGL.US→Alphabet Inc., NVD.DE→NVIDIA Corporation, AAPL→Apple Inc.). Jeśli nie masz pewności co do nazwy, użyj samego symbolu.'),
    symbol: z.string().optional().describe('Symbol/ticker z pliku jeśli jest (np. GOOGL.US, NVD.DE, ETFNATO.PL)'),
    type: z.string().optional().describe('Zidentyfikowany typ: STOCK, ETF, ETC, BOND, CRYPTO, GOLD (jeśli można ustalić). ETC = surowiec/towar notowany na giełdzie, np. srebro (ISLN.UK), inne metale.'),
    quantity: z.coerce.number().describe('Ilość / wolumen (Volume) jednostek/akcji/gramów — ZAWSZE wypełnij (z kolumny Volume/Ilość).'),
    price: z.coerce.number().describe('Cena ZAKUPU za 1 sztukę (Open price) — ZAWSZE wypełnij (z kolumny Open price/Cena).'),
    currentPrice: z.coerce.number().optional().describe('Cena BIEŻĄCA/rynkowa za 1 sztukę (Market price), jeśli jest w pliku — podaj, gdy dostępna.'),
    currency: z.string().optional().describe('Waluta ceny: z sufiksu symbolu .US=USD, .DE=EUR, .UK=GBP, .NL=EUR, .PL=PLN; inaczej z pliku'),
    bondDuration: z.coerce.number().optional().describe('Jeśli obligacja: czas trwania w latach (np. 4 dla COI, 10 dla EDO)'),
    bondInterestRate: z.coerce.number().optional().describe('Jeśli obligacja: oprocentowanie w procentach')
  }))
});

async function extractInvestmentsFromText(model: ReturnType<typeof getAiModelFor>, text: string, assetType?: string): Promise<{ investments: any[] }> {
  const prompt = `Przeanalizuj poniższy wyciąg brokerski / zestawienie inwestycyjne (może mieć wiele sekcji/arkuszy, np. XTB: CLOSED / OPEN POSITION / PENDING / CASH OPERATION).
Wyciągnij WYŁĄCZNIE AKTUALNE OTWARTE POZYCJE (holdings) — sekcja „OPEN POSITION".
POMIŃ całkowicie: pozycje zamknięte (CLOSED), zlecenia oczekujące (PENDING) oraz operacje gotówkowe
(CASH OPERATION: dywidendy, podatki, wpłaty/wypłaty, prowizje).
Parametr assetType z żądania: ${assetType || 'MIESZANE'}.

Dla KAŻDEJ otwartej pozycji wypełnij KOMPLET pól (nie pomijaj żadnego, dane są w wierszu):
- name = czytelna nazwa pozycji (ZAWSZE wypełnij). Jeśli rozpoznajesz ticker/symbol,
  ROZWIŃ go do pełnej nazwy spółki/funduszu (np. GOOGL.US → "Alphabet Inc.",
  NVD.DE → "NVIDIA Corporation"). Jeśli nie masz pewności co do nazwy, wpisz sam symbol.
- symbol = oryginalny ticker z pliku (jeśli jest, np. GOOGL.US),
- quantity = Volume (ZAWSZE, liczba), price = Open price / cena zakupu (ZAWSZE, liczba),
- currentPrice = Market price / cena bieżąca (podaj, jeśli jest w pliku),
- currency = waluta wg sufiksu symbolu (.US=USD, .DE=EUR, .UK=GBP, .NL=EUR, .PL=PLN),
- type = STOCK/ETF/ETC/BOND/CRYPTO/GOLD (ETC = surowiec/towar, np. srebro).

TEKST:
${text}`;

  // Jeden retry: model sporadycznie zwraca wynik niezgodny ze schematem
  // (NoObjectGeneratedError). Druga próba w praktyce eliminuje tę „loterię".
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { object } = await generateObject({
        model,
        schema: investmentSchema as any, // `any` (nie z.ZodType) — jedyne tłumi TS2589 deep-instantiation w ai@6 + TS 5.3
        prompt,
        providerOptions: AI_PROVIDER_OPTIONS,
      });
      return object as { investments: any[] };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * POST /api/ai/parse-pdf
 * Parser wyciągów PDF korzystający z AI do bezpośredniego czytania zawartości pliku
 */
export const parsePdf = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const file = (req as any).file;
    const { importType, assetType } = req.body;

    if (!file) return res.status(400).json({ message: 'Brak pliku' });
    const resolution = await resolveAiKey(userId);
    if (!resolution.ok) {
      return res.status(resolution.status).json({
        message: resolution.message,
        code: resolution.code,
      });
    }
    const aiKey = resolution.key;

    // unpdf (ESM-only → dynamiczny import z CJS) — serverless-owa ekstrakcja tekstu, bez canvas.
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    const extracted = await extractText(pdf, { mergePages: true });
    const pdfText: string = Array.isArray(extracted.text) ? extracted.text.join('\n') : extracted.text;
    const text = pdfText.slice(0, AI_TEXT_LIMIT);
    
    let prompt: string = '';
    let resultObject: any;

    if (importType === 'EXPENSE') {
      const expenseSchema = z.object({
        transactions: z.array(z.object({
          amount: z.number().describe('Wartość absolutna transakcji (zawsze dodatnia)'),
          date: z.string().describe('Data w formacie YYYY-MM-DD'),
          store: z.string().describe('Tytuł/Opis transakcji lub nazwa odbiorcy/sklepu'),
          type: z.enum(['expense', 'income']).describe('Typ operacji: expense (wydatek) lub income (wpływ/przychód)')
        }))
      });
      
      prompt = `Jesteś ekspertem od finansów. Przeanalizuj poniższy tekst z wyciągu bankowego PDF i wyciągnij z niego listę wszystkich operacji (wydatków i wpływów). 
Pomiń podsumowania, nagłówki i nieistotne dane. Dla każdej transakcji wyciągnij datę (YYYY-MM-DD), opis (store) oraz kwotę (amount - zawsze na plusie) i wskaż czy to wydatek ('expense') czy wpływ ('income').

TEKST WYCIĄGU:
${text}`;

      const { object } = await generateObject({
        model: getAiModelFor(aiKey),
        schema: expenseSchema as any, // `any` (nie z.ZodType) — jedyne tłumi TS2589 deep-instantiation w ai@6 + TS 5.3
        prompt,
        providerOptions: AI_PROVIDER_OPTIONS,
      });
      resultObject = object;

    } else if (importType === 'INVESTMENT') {
      resultObject = await extractInvestmentsFromText(getAiModelFor(aiKey), text, assetType);

    } else {
      return res.status(400).json({ message: 'Nieznany importType' });
    }
    res.json({ data: resultObject });

  } catch (error: any) {
    console.error('[AI parsePdf] Error:', error?.message);
    captureServerError(error, req);
    res.status(500).json({ message: 'Błąd parsowania PDF', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};

/**
 * POST /api/ai/map-investments
 * AI dla CSV/XLSX z brokera: tekst siatki → pozycje inwestycyjne (jak parse-pdf, ale dla tekstu).
 */
export const mapInvestments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { text, assetType } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: 'Brak danych do analizy' });
    }
    const resolution = await resolveAiKey(userId);
    if (!resolution.ok) {
      return res.status(resolution.status).json({
        message: resolution.message,
        code: resolution.code,
      });
    }
    const aiKey = resolution.key;

    const result = await extractInvestmentsFromText(getAiModelFor(aiKey), text.slice(0, AI_TEXT_LIMIT), assetType);
    res.json({ investments: result.investments || [] });
  } catch (error: any) {
    console.error('[AI mapInvestments] Error:', error?.message);
    const status = error.statusCode || error.status || error.response?.status;
    const isRateLimited = status === 429 || /rate.?limit|too many requests|quota|free tier/i.test(error.message || '');
    if (isRateLimited) {
      return res.status(429).json({ message: 'Limit zapytań darmowego AI chwilowo wyczerpany', details: error.message, rateLimited: true });
    }
    captureServerError(error, req);
    res.status(500).json({ message: 'Błąd analizy inwestycji', details: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
};
