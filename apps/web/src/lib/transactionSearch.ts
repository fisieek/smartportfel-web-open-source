/**
 * Dopasowanie kwoty w wyszukiwarce transakcji.
 *
 * Jedno pole wyszukiwania obsługuje opis, kategorię, sklep ORAZ kwotę — użytkownik nie ma
 * osobnej wyszukiwarki kwot i nie musi wiedzieć, w które pole trafił.
 *
 * Zasady, wyprowadzone z tego, jak ludzie faktycznie szukają („pamiętam, że było ~250 zł"):
 *  - przecinek i kropka są wymienne: `250,5` znajduje 250.50,
 *  - dopasowanie jest po PODCIĄGU, tak samo jak w tekście: `250` znajduje 250,00 i 250,99
 *    (ale też 1250 — świadomie, bo to filtr z widocznym wynikiem, nie zapytanie o równość),
 *  - liczymy zarówno kwotę oryginalną, jak i przewalutowaną na PLN (`plnAmount`), żeby
 *    transakcja w EUR dała się znaleźć po obu wartościach,
 *  - znak minus i separatory tysięcy w zapytaniu są ignorowane.
 */

interface AmountBearing {
    amount?: number | string | null;
    plnAmount?: number | string | null;
}

/** Czy zapytanie ma sens jako kwota (zawiera cyfrę). Litery same z siebie kwoty nie opisują. */
function looksNumeric(query: string): boolean {
    return /\d/.test(query);
}

/**
 * `"1 250,50 zl"` → `"1250.50"`. Zostawia tylko cyfry i JEDEN separator dziesiętny.
 *
 * Twarda spacja jest w klasie znaków escapem ` `, nie dosłownie: `no-irregular-whitespace`
 * jest w tym repo BŁĘDEM lintu (ta sama pułapka co w `statementParser`), a `Intl.NumberFormat('pl')`
 * używa jej jako separatora tysięcy — czyli użytkownik skopiuje ją razem z kwotą z listy.
 */
function normalizeQuery(query: string): string {
    const cleaned = query.replace(/[\s\u00a0]/g, '').replace(',', '.');
    const match = cleaned.match(/\d+(?:\.\d*)?/);
    return match ? match[0] : '';
}

function amountVariants(value: number | string | null | undefined): string[] {
    if (value === null || value === undefined || value === '') return [];
    const n = Math.abs(Number(value));
    if (!Number.isFinite(n)) return [];
    // `String(n)` daje "250.5", `toFixed(2)` daje "250.50" — użytkownik może wpisać jedno albo drugie.
    return [String(n), n.toFixed(2)];
}

export function matchesAmount(tx: AmountBearing, query: string): boolean {
    if (!looksNumeric(query)) return false;

    const needle = normalizeQuery(query);
    if (!needle) return false;

    const haystack = [...amountVariants(tx.amount), ...amountVariants(tx.plnAmount)];
    return haystack.some(value => value.includes(needle));
}
