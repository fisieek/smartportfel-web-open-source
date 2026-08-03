/**
 * Filtr miesiąca na liście transakcji — czysta logika, bez Reacta.
 *
 * Format filtra: `"YYYY-M"` — miesiąc **bez wiodącego zera** (tak buduje go `<Select>`
 * na stronie Transakcji), albo `"-"` = „dowolny czas".
 */

export const ANY_TIME = '-';

export function currentMonthFilter(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
}

/**
 * Data początkowa dla NOWEJ transakcji: pierwszy dzień odfiltrowanego miesiąca.
 *
 * `undefined` znaczy „zostaw dzisiejszą datę" i wypada w trzech przypadkach: filtr wskazuje
 * miesiąc bieżący, filtr to „dowolny czas", albo wartość jest nieparsowalna. Dzięki temu
 * wołający nie musi znać formatu — pyta o datę i dostaje albo konkret, albo nic.
 *
 * Miesiące przyszłe też dostają pierwszy dzień: selektor okresu oferuje 3 miesiące w przód,
 * a intencja jest ta sama co przy przeszłych — wpis ma wpaść w przeglądany miesiąc.
 */
export function firstDayOfFilteredMonth(monthFilter: string): string | undefined {
    if (!monthFilter || monthFilter === ANY_TIME) return undefined;

    const [yearRaw, monthRaw] = monthFilter.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return undefined;

    const now = new Date();
    if (year === now.getFullYear() && month === now.getMonth() + 1) return undefined;

    return `${year}-${String(month).padStart(2, '0')}-01`;
}
