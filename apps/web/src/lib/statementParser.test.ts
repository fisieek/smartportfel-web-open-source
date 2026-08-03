import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
    detectColumnsHeuristic,
    detectHeaderRow,
    decodeBuffer,
    parseFileToGrid,
    parseWorkbookToText,
    mapGridToTransactions,
    parseAmount,
    parseStatementDate,
    type Grid,
} from './statementParser';

describe('parseAmount', () => {
    it('obsługuje polski format z przecinkiem i spacją tysięcy', () => {
        expect(parseAmount('1 234,56')).toBeCloseTo(1234.56);
        expect(parseAmount('1 234,56')).toBeCloseTo(1234.56); // nbsp
        expect(parseAmount('-89,99 PLN')).toBeCloseTo(-89.99);
    });
    it('obsługuje format z kropką dziesiętną i przecinkiem tysięcy', () => {
        expect(parseAmount('1,234.56')).toBeCloseTo(1234.56);
        expect(parseAmount('150.50')).toBeCloseTo(150.5);
    });
    it('zwraca NaN dla śmieci', () => {
        expect(Number.isNaN(parseAmount('abc'))).toBe(true);
    });
});

describe('parseStatementDate', () => {
    it('parsuje YYYY-MM-DD i DD.MM.YYYY', () => {
        expect(parseStatementDate('2024-01-15')?.getFullYear()).toBe(2024);
        const d = parseStatementDate('15.01.2024');
        expect(d?.getDate()).toBe(15);
        expect(d?.getMonth()).toBe(0);
    });
    it('zwraca null dla pustej/niepoprawnej', () => {
        expect(parseStatementDate('')).toBeNull();
        expect(parseStatementDate('nie-data')).toBeNull();
    });
});

describe('detectColumnsHeuristic', () => {
    it('rozpoznaje pojedynczą kolumnę kwoty (mBank-like)', () => {
        const grid: Grid = {
            headers: ['#Data operacji', '#Opis operacji', '#Kwota', '#Waluta'],
            rows: [],
        };
        const { mapping, confidence } = detectColumnsHeuristic(grid);
        expect(confidence).toBe(1);
        expect(mapping).toMatchObject({ date: 0, description: 1, amount: 2, currency: 3 });
    });

    it('rozpoznaje rozdzielone kolumny obciążenia/uznania', () => {
        const grid: Grid = {
            headers: ['Data', 'Tytuł', 'Obciążenia', 'Uznania'],
            rows: [],
        };
        const { mapping } = detectColumnsHeuristic(grid);
        expect(mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    });

    it('niska pewność, gdy brak rozpoznawalnych nagłówków', () => {
        const grid: Grid = { headers: ['col1', 'col2', 'col3'], rows: [] };
        const { mapping, confidence } = detectColumnsHeuristic(grid);
        expect(mapping).toBeNull();
        expect(confidence).toBeLessThan(1);
    });
});

describe('mapGridToTransactions', () => {
    it('mapuje znak kwoty na typ expense/income', () => {
        const grid: Grid = {
            headers: ['Data', 'Opis', 'Kwota'],
            rows: [
                ['2024-01-15', 'Biedronka', '-150,50'],
                ['2024-01-20', 'Wypłata', '5000,00'],
            ],
        };
        const txns = mapGridToTransactions(grid, { date: 0, description: 1, amount: 2 });
        expect(txns).toHaveLength(2);
        expect(txns[0]).toMatchObject({ type: 'expense', amount: 150.5, rawDescription: 'Biedronka', valid: true });
        expect(txns[1]).toMatchObject({ type: 'income', amount: 5000, valid: true });
        expect(txns[0].isoDate).toBeTruthy();
    });

    it('obsługuje rozdzielone kolumny obciążenia/uznania', () => {
        const grid: Grid = {
            headers: ['Data', 'Tytuł', 'Obciążenia', 'Uznania'],
            rows: [
                ['15.01.2024', 'Lidl', '89,99', ''],
                ['16.01.2024', 'Zwrot', '', '120,00'],
            ],
        };
        const txns = mapGridToTransactions(grid, { date: 0, description: 1, debit: 2, credit: 3 });
        expect(txns[0]).toMatchObject({ type: 'expense', amount: 89.99 });
        expect(txns[1]).toMatchObject({ type: 'income', amount: 120 });
    });

    it('oznacza wiersz z błędną datą jako nieprawidłowy', () => {
        const grid: Grid = { headers: ['Data', 'Opis', 'Kwota'], rows: [['xx', 'Sklep', '10,00']] };
        const txns = mapGridToTransactions(grid, { date: 0, description: 1, amount: 2 });
        expect(txns[0].valid).toBe(false);
        expect(txns[0].error).toBe('Błędna data');
    });
});

describe('detectHeaderRow', () => {
    it('znajduje nagłówek tabeli za preambułą (mBank)', () => {
        const rows: string[][] = [
            ['mBank S.A.'],
            ['#Klient', 'Jan Kowalski'],
            ['#Za okres:', '2024-01-01', '2024-01-31'],
            ['#Waluta', '#Bilans otwarcia', '#Bilans zamknięcia'],
            ['PLN', '1 000,00', '2 000,00'],
            ['#Lista operacji'],
            ['#Data operacji', '#Opis operacji', '#Rachunek', '#Kategoria', '#Kwota', '#Saldo po operacji'],
            ['2024-01-15', 'BIEDRONKA', '...', 'Jedzenie', '-50,00 PLN', '1 950,00 PLN'],
        ];
        const res = detectHeaderRow(rows);
        expect(res?.headerIndex).toBe(6);
        expect(res?.mapping).toMatchObject({ date: 0, description: 1, amount: 4 });
    });

    it('zwraca null, gdy żaden wiersz nie wygląda na nagłówek', () => {
        const rows: string[][] = [['a', 'b'], ['c', 'd']];
        expect(detectHeaderRow(rows)).toBeNull();
    });
});

describe('parseWorkbookToText (XLSX wielo-arkuszowy, broker)', () => {
    it('priorytetyzuje arkusz OPEN POSITION (przed CLOSED)', async () => {
        const wb = XLSX.utils.book_new();
        const closed = XLSX.utils.aoa_to_sheet([['Position', 'Symbol'], ['1', 'SPOT.US']]);
        const open = XLSX.utils.aoa_to_sheet([['Position', 'Symbol', 'Volume'], ['2', 'GOOGL.US', '0.5']]);
        XLSX.utils.book_append_sheet(wb, closed, 'CLOSED POSITION HISTORY');
        XLSX.utils.book_append_sheet(wb, open, 'OPEN POSITION 1606');
        const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
        const file = new File([out as BlobPart], 'xtb.xlsx');

        const text = await parseWorkbookToText(file);
        // OPEN przed CLOSED w wynikowym tekście (= AI dostanie holdings najpierw)
        expect(text.indexOf('OPEN POSITION 1606')).toBeGreaterThanOrEqual(0);
        expect(text.indexOf('OPEN POSITION 1606')).toBeLessThan(text.indexOf('CLOSED POSITION HISTORY'));
        expect(text).toContain('GOOGL.US');
    });
});

describe('decodeBuffer', () => {
    it('dekoduje Windows-1250, gdy UTF-8 daje znak zastępczy', () => {
        // "Żabka" w CP1250: Ż=0xAF
        const cp1250 = new Uint8Array([0xaf, 0x61, 0x62, 0x6b, 0x61]);
        expect(decodeBuffer(cp1250.buffer)).toBe('Żabka');
    });
    it('zostawia poprawny UTF-8 nietknięty', () => {
        const utf8 = new TextEncoder().encode('Żabka');
        expect(decodeBuffer(utf8.buffer)).toBe('Żabka');
    });
});

describe('parseFileToGrid (wyciąg mBank end-to-end)', () => {
    it('pomija preambułę, odcina stopkę i parsuje transakcje', async () => {
        const csv = [
            'mBank;',
            '#Klient;Jan Kowalski;',
            '#Za okres:;2024-01-01;2024-01-31;',
            '#Waluta;#Bilans otwarcia;#Bilans zamknięcia;',
            'PLN;1 000,00;2 000,00;',
            '#Lista operacji;',
            '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;#Saldo po operacji;',
            '2024-01-15;"PŁATNOŚĆ KARTĄ BIEDRONKA";"eKonto";"Jedzenie";-50,00 PLN;1 950,00 PLN;',
            '2024-01-16;"PRZELEW WYNAGRODZENIE";"eKonto";"Wpływ";5 000,00 PLN;6 950,00 PLN;',
            '#Saldo końcowe:;;;;;6 950,00 PLN;',
        ].join('\n');
        const file = new File([csv], 'mbank.csv', { type: 'text/csv' });

        const grid = await parseFileToGrid(file);
        expect(grid.headers[0]).toContain('Data operacji');
        expect(grid.rows).toHaveLength(2); // stopka "#Saldo końcowe" odcięta

        const { mapping } = detectColumnsHeuristic(grid);
        expect(mapping).not.toBeNull();
        const txns = mapGridToTransactions(grid, mapping!);
        expect(txns).toHaveLength(2);
        expect(txns[0]).toMatchObject({ type: 'expense', amount: 50, valid: true });
        expect(txns[1]).toMatchObject({ type: 'income', amount: 5000, valid: true });
    });

    it('wybiera separator ; mimo mylącej preambuły z przecinkami (regresja: wszystko +2026/wpływ)', async () => {
        // Preambuła #Wpływy/#Wydatki z przecinkami w liczbach myliła auto-guess PapaParse,
        // przez co kolumny się sklejały, a parseAmount czytał rok z daty ISO → +2026 i "wpływ".
        const csv = [
            '#Wpływy;#Wydatki;',
            '125 025,80;-123 439,83;',
            '#Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;',
            '2026-06-13;"Żabka ZAKUP PRZY UŻYCIU KARTY W KRAJU";eKonto 0211;Żywność;-12,18 PLN;',
            '2026-06-14;"WPŁATA WE WPŁATOMACIE";eKonto 0211;Wpływy - inne;1 500,00 PLN;',
        ].join('\n');
        const file = new File([csv], 'mbank.csv', { type: 'text/csv' });

        const grid = await parseFileToGrid(file);
        expect(grid.headers[0]).toContain('Data operacji');

        const { mapping } = detectColumnsHeuristic(grid);
        const txns = mapGridToTransactions(grid, mapping!);
        expect(txns).toHaveLength(2);
        expect(txns[0]).toMatchObject({ type: 'expense', amount: 12.18 });
        expect(txns[1]).toMatchObject({ type: 'income', amount: 1500 });
    });
});
