import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { decodeBuffer } from './statementParser';

/**
 * Deterministyczne parsery znanych eksportów inwestycyjnych (bez AI):
 *  - Goldsaver (CSV): zakupy złota fizycznego ułamkowego,
 *  - obligacjeskarbowe.pl / PKO „Historia dyspozycji" (XLS): WYŁĄCZNIE zakupy obligacji.
 *
 * Te pliki mają stały, ustrukturyzowany układ, więc czytamy je lokalnie — dokładnie,
 * za darmo i bez bramki PRO. Pliki nierozpoznane (np. XTB/Revolut) → `null` i wywołujący
 * spada do ścieżki AI.
 */

export type AssetImportType = 'STOCK_ETF' | 'BOND' | 'GOLD';

export interface DetectedItem {
    isoDate: string;
    date: string;              // format do wyświetlenia (pl-PL)
    type: 'GOLD' | 'BOND';
    name: string;
    quantity: number;
    price: number;             // cena za 1 sztukę/gram
    currency?: string;
    bondDuration?: number;
    status?: string;
}

export interface DetectedImport {
    source: 'goldsaver' | 'obligacje';
    assetType: AssetImportType;        // 'GOLD' | 'BOND'
    providerHint: 'GOLDSAVER' | 'PKO';
    items: DetectedItem[];
}

// ── Helpery ──────────────────────────────────────────────────────────────────

const norm = (s: unknown): string =>
    (s ?? '').toString().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l')
        .trim();

function toNum(v: unknown): number {
    if (typeof v === 'number') return v;
    const s = (v ?? '').toString().trim().replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? NaN : n;
}

/** Elastyczny parser daty: Date | 'YYYY-MM-DD[ HH:MM:SS]' | 'DD.MM.YYYY' | 'DD/MM/YYYY'. */
function toDate(v: unknown): Date | null {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = (v ?? '').toString().trim();
    if (!s) return null;
    const token = s.split(/[ T]/)[0];
    let m = token.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = token.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/** Plik → surowe wiersze (bez heurystyk bankowych). XLS: daty jako Date, liczby jako number. */
async function fileToRows(file: File): Promise<unknown[][]> {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
        return (aoa || []).map(r => (Array.isArray(r) ? r : []));
    }
    const text = decodeBuffer(await file.arrayBuffer());
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true }); // auto-detekcja separatora
    return (parsed.data as string[][]).map(r => (Array.isArray(r) ? r : []));
}

/** Znajdź wiersz nagłówka zawierający WSZYSTKIE wymagane (znormalizowane) frazy. */
function findHeader(rows: unknown[][], required: string[]): { idx: number; cols: string[] } | null {
    for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const cells = rows[i].map(norm);
        if (required.every(req => cells.some(c => c.includes(req)))) {
            return { idx: i, cols: rows[i].map(c => (c ?? '').toString()) };
        }
    }
    return null;
}

/** Indeks pierwszej kolumny, której nagłówek zawiera którąś z fraz. */
function colIndex(cols: string[], ...needles: string[]): number {
    return cols.findIndex(c => needles.some(n => norm(c).includes(n)));
}

const toDisplay = (d: Date) => d.toLocaleDateString('pl-PL');

// ── Goldsaver (CSV): każdy wiersz to zakup złota ─────────────────────────────

function parseGoldsaver(rows: unknown[][], header: { idx: number; cols: string[] }): DetectedItem[] {
    const cols = header.cols;
    const iDate = colIndex(cols, 'data');
    const iAmount = colIndex(cols, 'kwota');
    const iQty = colIndex(cols, 'zmiana ilosci zlota', 'zmiana ilosci', 'ilosc zlota');
    if (iDate < 0 || iAmount < 0 || iQty < 0) return [];

    const items: DetectedItem[] = [];
    for (let r = header.idx + 1; r < rows.length; r++) {
        const row = rows[r];
        const qty = toNum(row[iQty]);
        const amount = toNum(row[iAmount]);
        const date = toDate(row[iDate]);
        if (!date || !(qty > 0) || !(amount > 0)) continue; // pomiń nie-zakupy / śmieci
        items.push({
            isoDate: date.toISOString(),
            date: toDisplay(date),
            type: 'GOLD',
            name: 'Złoto',
            quantity: qty,
            price: amount / qty, // cena za gram
            currency: 'PLN',
        });
    }
    return items;
}

// ── Obligacje skarbowe (XLS „Historia dyspozycji"): WYŁĄCZNIE zakupy ─────────

const BOND_PREFIX: Record<string, { years: number; label: string }> = {
    ROR: { years: 1, label: 'roczne' },
    DOR: { years: 2, label: '2-letnie' },
    TOS: { years: 3, label: '3-letnie' },
    TOZ: { years: 3, label: '3-letnie' },
    COI: { years: 4, label: '4-letnie' },
    ROS: { years: 6, label: '6-letnie' },
    EDO: { years: 10, label: '10-letnie' },
    ROD: { years: 12, label: '12-letnie' },
};

function parseObligacje(rows: unknown[][], header: { idx: number; cols: string[] }): DetectedItem[] {
    const cols = header.cols;
    const iDate = colIndex(cols, 'data dyspozycji', 'data');
    const iRodzaj = colIndex(cols, 'rodzaj dyspozycji', 'rodzaj');
    const iKod = colIndex(cols, 'kod obligacji', 'kod');
    const iLiczba = colIndex(cols, 'liczba obligacji', 'liczba');
    const iStatus = colIndex(cols, 'status');
    if (iDate < 0 || iRodzaj < 0 || iKod < 0 || iLiczba < 0) return [];

    const items: DetectedItem[] = [];
    for (let r = header.idx + 1; r < rows.length; r++) {
        const row = rows[r];
        const rodzaj = norm(row[iRodzaj]);
        const status = iStatus >= 0 ? norm(row[iStatus]) : 'zrealizowana';
        // Tylko rozliczone zakupy — pomija „dyspozycja zakupu" (duplikat + anulowane),
        // odsetki, podatek i wypłaty przelewem.
        if (rodzaj !== 'zakup papierow' || status !== 'zrealizowana') continue;

        const qty = toNum(row[iLiczba]);
        const date = toDate(row[iDate]);
        if (!date || !(qty > 0)) continue;

        const code = (row[iKod] ?? '').toString().trim().toUpperCase();
        const info = BOND_PREFIX[code.slice(0, 3)];
        items.push({
            isoDate: date.toISOString(),
            date: toDisplay(date),
            type: 'BOND',
            name: info ? `Obligacje ${info.label} ${code}` : `Obligacje ${code}`,
            quantity: qty,
            price: 100, // nominał obligacji skarbowej
            bondDuration: info?.years,
            status: 'zrealizowana',
        });
    }
    return items;
}

// ── Detekcja + dispatch ──────────────────────────────────────────────────────

export async function detectInvestmentFile(file: File): Promise<DetectedImport | null> {
    const name = file.name.toLowerCase();
    if (!/\.(csv|xlsx|xls|txt)$/.test(name)) return null;

    let rows: unknown[][];
    try {
        rows = await fileToRows(file);
    } catch {
        return null; // niech zdecyduje ścieżka AI
    }
    if (!rows.length) return null;

    const obligHeader = findHeader(rows, ['rodzaj dyspozycji', 'kod obligacji']);
    if (obligHeader) {
        const items = parseObligacje(rows, obligHeader);
        if (items.length) return { source: 'obligacje', assetType: 'BOND', providerHint: 'PKO', items };
    }

    const goldHeader = findHeader(rows, ['zmiana ilosci zlota']);
    if (goldHeader) {
        const items = parseGoldsaver(rows, goldHeader);
        if (items.length) return { source: 'goldsaver', assetType: 'GOLD', providerHint: 'GOLDSAVER', items };
    }

    return null;
}
