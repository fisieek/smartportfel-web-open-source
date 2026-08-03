import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Parser wyciągów bankowych (CSV/Excel) → znormalizowane transakcje.
 * Krok 1: plik → siatka (nagłówki + wiersze). Krok 2: heurystyczne wykrycie kolumn
 * (z możliwym fallbackiem do AI). Krok 3: mapowanie wierszy na transakcje.
 */

export interface Grid {
    headers: string[];
    rows: string[][];
}

export interface ColumnMapping {
    date: number;
    description: number;
    amount?: number;   // pojedyncza kolumna ze znakiem (+/-)
    debit?: number;    // obciążenia (wydatek)
    credit?: number;   // uznania (wpływ)
    currency?: number;
}

export interface DetectResult {
    mapping: ColumnMapping | null;
    confidence: number; // 0..1
}

export interface NormalizedTxn {
    date: string;        // ISO (lub surowy tekst gdy nieparsowalny)
    isoDate?: string;    // ISO gdy poprawna data
    amount: number;      // zawsze dodatnia
    type: 'expense' | 'income';
    rawDescription: string;
    currency?: string;
    valid: boolean;
    error?: string;
}

const norm = (s: unknown): string =>
    (s ?? '').toString().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // usuń znaki diakrytyczne łączone (ą,ć,ę,ó,ś,ź,ż...)
        .replace(/ł/g, 'l')                      // 'ł' nie jest rozkładane przez NFD
        .trim();

// ── Wczytanie pliku do siatki ───────────────────────────────────────────────

/**
 * Dekoduje bufor pliku jako tekst. Wyciągi PL banków (mBank itd.) bywają w
 * Windows-1250 — taki bajt jest nielegalny w UTF-8, więc TextDecoder wstawia znak
 * zastępczy U+FFFD. Gdy go wykryjemy, ponawiamy dekodowanie jako Windows-1250.
 */
export function decodeBuffer(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    const utf8 = new TextDecoder('utf-8').decode(bytes);
    if (utf8.includes('�')) {
        try {
            return new TextDecoder('windows-1250').decode(bytes);
        } catch {
            return utf8;
        }
    }
    return utf8;
}

export async function parseFileToGrid(file: File): Promise<Grid> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
        return gridFromAoa(aoa);
    }
    // domyślnie CSV (również .txt) — z detekcją kodowania (UTF-8 / Windows-1250)
    return gridFromText(decodeBuffer(await file.arrayBuffer()));
}

/**
 * Plik brokera → jeden blob tekstu dla AI. Eksporty brokerów (np. XTB) mają WIELE
 * arkuszy (CLOSED/OPEN/PENDING/CASH); `parseFileToGrid` czyta tylko pierwszy, więc tu
 * składamy WSZYSTKIE arkusze z etykietami, dając arkuszom „open position" priorytet
 * (na początku), by aktualne pozycje zmieściły się w limicie znaków po stronie AI.
 */
export async function parseWorkbookToText(file: File): Promise<string> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        // „open position" najpierw; potem reszta w oryginalnej kolejności.
        const isOpen = (s: string) => /open\s*position/i.test(s);
        const ordered = [...wb.SheetNames].sort((a, b) => (isOpen(b) ? 1 : 0) - (isOpen(a) ? 1 : 0));
        return ordered.map(sn => {
            const aoa = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
            const rows = (aoa || []).filter(r => Array.isArray(r) && r.some(c => (c ?? '').toString().trim() !== ''));
            return `=== ARKUSZ: ${sn} ===\n` + rows.map(r => r.map(c => (c ?? '').toString()).join('\t')).join('\n');
        }).join('\n\n');
    }
    // CSV/TXT — jeden „arkusz": siatka (z detekcją kodowania/separatora).
    const grid = await parseFileToGrid(file);
    return [grid.headers.join('\t'), ...grid.rows.map(r => r.join('\t'))].join('\n');
}

/** Niepuste wiersze, każda komórka jako string. */
function compactRows(aoa: any[][]): string[][] {
    return (aoa || [])
        .map(r => (Array.isArray(r) ? r.map(c => (c ?? '').toString()) : []))
        .filter(r => r.some(c => c.trim() !== ''));
}

/** Liczba ODRĘBNYCH kolumn rozpoznanych w nagłówku — miara jakości podziału na kolumny. */
function mappingScore(m: ColumnMapping): number {
    return new Set([m.date, m.description, m.amount, m.debit, m.credit].filter(v => v !== undefined)).size;
}

/** Z wierszy + wykrytego nagłówka buduje siatkę: nagłówek + dane, z odciętą stopką. */
function sliceFromHeader(rowsAll: string[][], detected: { headerIndex: number; mapping: ColumnMapping }): Grid {
    const { headerIndex, mapping } = detected;
    const headers = rowsAll[headerIndex];
    const rows = rowsAll.slice(headerIndex + 1);
    // Odetnij stopkę: końcowy blok wierszy bez parsowalnej daty (podsumowania, salda).
    let end = rows.length;
    while (end > 0 && !parseStatementDate((rows[end - 1][mapping.date] ?? '').toString())) end--;
    return { headers, rows: rows.slice(0, end) };
}

/**
 * CSV → siatka. Auto-zgadywanie separatora przez PapaParse gubi się przez preambułę
 * banku (np. mBank `#Wpływy/#Wydatki`), więc próbujemy każdy separator i wybieramy ten,
 * który daje nagłówek z największą liczbą ODRĘBNYCH rozpoznanych kolumn.
 */
function gridFromText(text: string): Grid {
    const candidates = [';', '\t', ',', '|'];
    let best: { grid: Grid; score: number } | null = null;
    let fallback: Grid | null = null;

    for (const delimiter of candidates) {
        const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true });
        const rowsAll = compactRows(parsed.data as string[][]);
        if (rowsAll.length === 0) continue;
        if (!fallback) fallback = { headers: rowsAll[0], rows: rowsAll.slice(1) };

        const detected = detectHeaderRow(rowsAll);
        if (detected) {
            const score = mappingScore(detected.mapping);
            if (!best || score > best.score) best = { grid: sliceFromHeader(rowsAll, detected), score };
        }
    }

    return best?.grid ?? fallback ?? { headers: [], rows: [] };
}

function gridFromAoa(aoa: any[][]): Grid {
    const rowsAll = compactRows(aoa);
    if (rowsAll.length === 0) return { headers: [], rows: [] };

    // Pomiń preambułę (dane klienta/okres/salda) i znajdź właściwy wiersz nagłówka tabeli.
    const detected = detectHeaderRow(rowsAll);
    if (detected) return sliceFromHeader(rowsAll, detected);

    // Fallback: pierwszy wiersz jako nagłówek (proste pliki bez preambuły).
    return { headers: rowsAll[0], rows: rowsAll.slice(1) };
}

// ── Heurystyczne wykrycie kolumn ─────────────────────────────────────────────

const SYNONYMS: Record<keyof Omit<ColumnMapping, never>, string[]> = {
    date: ['data operacji', 'data transakcji', 'data ksiegowania', 'data waluty', 'data', 'date'],
    amount: ['kwota operacji', 'kwota transakcji', 'kwota', 'amount', 'wartosc', 'value'],
    debit: ['obciazenia', 'obciazenie', 'rozchod', 'winien', 'wyplata', 'debit'],
    credit: ['uznania', 'uznanie', 'przychod', 'wplyw', 'wplaty', 'ma', 'credit'],
    description: ['tytul operacji', 'tytul', 'opis operacji', 'opis', 'odbiorca', 'nadawca', 'kontrahent', 'dane kontrahenta', 'szczegoly', 'description', 'details', 'nazwa'],
    currency: ['waluta', 'currency'],
};

function findCol(headers: string[], keys: string[]): number {
    const normed = headers.map(norm);
    // dopasowanie po najdłuższym pasującym synonimie (precyzyjniej)
    for (const key of keys) {
        const idx = normed.findIndex(h => h === key);
        if (idx >= 0) return idx;
    }
    for (const key of keys) {
        const idx = normed.findIndex(h => h.includes(key));
        if (idx >= 0) return idx;
    }
    return -1;
}

/** Rdzeń heurystyki: dopasowanie kolumn na pojedynczym wierszu-kandydacie nagłówka. */
export function detectColumnsInCells(cells: string[]): DetectResult {
    if (!cells || cells.length === 0) return { mapping: null, confidence: 0 };

    const date = findCol(cells, SYNONYMS.date);
    const description = findCol(cells, SYNONYMS.description);
    const amount = findCol(cells, SYNONYMS.amount);
    const debit = findCol(cells, SYNONYMS.debit);
    const credit = findCol(cells, SYNONYMS.credit);
    const currency = findCol(cells, SYNONYMS.currency);

    const hasAmount = amount >= 0 || (debit >= 0 || credit >= 0);
    if (date < 0 || description < 0 || !hasAmount) {
        // policz ile pól znaleziono — przyda się do decyzji o fallbacku AI
        const found = [date >= 0, description >= 0, hasAmount].filter(Boolean).length;
        return { mapping: null, confidence: found / 3 };
    }

    const mapping: ColumnMapping = { date, description };
    if (amount >= 0) mapping.amount = amount;
    if (debit >= 0) mapping.debit = debit;
    if (credit >= 0) mapping.credit = credit;
    if (currency >= 0) mapping.currency = currency;

    return { mapping, confidence: 1 };
}

/** Zachowane dla zgodności: heurystyka na nagłówkach gotowej siatki. */
export function detectColumnsHeuristic(grid: Grid): DetectResult {
    return detectColumnsInCells(grid.headers);
}

/**
 * Wyciągi PL banków mają wielowierszową preambułę (dane klienta, okres, salda)
 * przed właściwym nagłówkiem tabeli. Skanuje pierwsze `scan` wierszy i zwraca
 * pierwszy, który wygląda na nagłówek transakcji (data + opis + kwota/obciążenia/uznania).
 */
export function detectHeaderRow(
    rows: string[][],
    scan = 40,
): { headerIndex: number; mapping: ColumnMapping } | null {
    const limit = Math.min(rows.length, scan);
    for (let i = 0; i < limit; i++) {
        const { mapping, confidence } = detectColumnsInCells(rows[i]);
        if (mapping && confidence === 1) return { headerIndex: i, mapping };
    }
    return null;
}

// ── Parsowanie wartości ──────────────────────────────────────────────────────

export function parseStatementDate(raw: string): Date | null {
    const t = (raw || '').trim();
    if (!t) return null;
    let m = t.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return safeDate(+m[1], +m[2] - 1, +m[3]);
    m = t.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
    if (m) return safeDate(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
}

function safeDate(y: number, mo: number, d: number): Date | null {
    const dt = new Date(y, mo, d);
    return isNaN(dt.getTime()) ? null : dt;
}

export function parseAmount(raw: string): number {
    if (raw == null) return NaN;
    // \u00A0 to twarda spacja — bankowe eksporty rozdzielają nią tysiące. Zapisana jawnie,
    // bo dosłowny znak w źródle jest nie do odróżnienia od zwykłej spacji.
    let s = raw.toString().replace(/\s|\u00A0/g, '');
    s = s.replace(/(pln|eur|usd|gbp|chf|zł|zl)/gi, '');
    s = s.replace(/[^0-9,.-]/g, '');
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.'); // przecinek dziesiętny
        else s = s.replace(/,/g, '');                                        // kropka dziesiętna
    } else if (lastComma > -1) {
        s = s.replace(',', '.'); // tylko przecinek → dziesiętny
    }
    return parseFloat(s);
}

// ── Mapowanie siatki na transakcje ───────────────────────────────────────────

export function mapGridToTransactions(grid: Grid, mapping: ColumnMapping): NormalizedTxn[] {
    const out: NormalizedTxn[] = [];
    for (const row of grid.rows) {
        const dateRaw = (row[mapping.date] ?? '').toString().trim();
        const descRaw = (row[mapping.description] ?? '').toString().trim();
        if (!dateRaw && !descRaw) continue; // pusty wiersz

        const date = parseStatementDate(dateRaw);

        let amount = NaN;
        let type: 'expense' | 'income' = 'expense';

        if (mapping.debit !== undefined || mapping.credit !== undefined) {
            const debit = mapping.debit !== undefined ? parseAmount(row[mapping.debit]) : NaN;
            const credit = mapping.credit !== undefined ? parseAmount(row[mapping.credit]) : NaN;
            if (!isNaN(credit) && Math.abs(credit) > 0) { amount = Math.abs(credit); type = 'income'; }
            else if (!isNaN(debit) && Math.abs(debit) > 0) { amount = Math.abs(debit); type = 'expense'; }
        } else if (mapping.amount !== undefined) {
            const v = parseAmount(row[mapping.amount]);
            if (!isNaN(v)) { type = v >= 0 ? 'income' : 'expense'; amount = Math.abs(v); }
        }

        const currency = mapping.currency !== undefined ? (row[mapping.currency] ?? '').toString().trim().toUpperCase() || undefined : undefined;

        const valid = !!date && !isNaN(amount);
        out.push({
            date: date ? date.toISOString() : dateRaw,
            isoDate: date ? date.toISOString() : undefined,
            amount: isNaN(amount) ? 0 : amount,
            type,
            rawDescription: descRaw,
            currency,
            valid,
            error: !date ? 'Błędna data' : isNaN(amount) ? 'Błędna kwota' : undefined,
        });
    }
    return out;
}

/** Próbka (nagłówki + N wierszy) do wysłania do AI przy nieznanym layoucie. */
export function sampleForAI(grid: Grid, n = 15): { headers: string[]; sampleRows: string[][] } {
    return { headers: grid.headers, sampleRows: grid.rows.slice(0, n) };
}
