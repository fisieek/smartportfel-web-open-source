/**
 * Kalkulator PPK (Pracownicze Plany Kapitałowe) — publiczny, klientowy.
 *
 * Stałe ustawowe (dopłaty państwa, progi) są KOPIĄ z apps/server/src/utils/ppkCalculator.ts
 * — logika serwerowa (dashboard PPK, dopłaty) pozostaje źródłem prawdy dla stanu konta,
 * a ten moduł liczy publiczny kalkulator marketingowy po stronie przeglądarki.
 * Przy zmianie stawek ustawowych aktualizuj OBA miejsca.
 *
 * Świadome uproszczenia (v1, sygnalizowane w `warnings`):
 *  - stałe wynagrodzenie brutto przez cały okres (bez podwyżek),
 *  - stała stopa zwrotu rocznie (projekcja, nie gwarancja),
 *  - wpłata pracodawcy opodatkowana Twoją krańcową stawką PIT w tym samym okresie,
 *  - zakładamy spełnienie warunku dopłaty rocznej państwa (typowe przy wpłacie 2%),
 *  - dopłata powitalna liczona jednorazowo w 1. roku.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

// ── Stałe ustawowe (KOPIA z serwera — trzymaj w zgodzie) ──
export const PPK_WELCOME_BONUS = 250; // dopłata powitalna (jednorazowo)
export const PPK_ANNUAL_BONUS = 240; // dopłata roczna państwa
const BASIC_CONTRIBUTION_RATE = 0.035; // wpłaty podstawowe: 2% pracownik + 1,5% pracodawca
const PIT_THRESHOLD = 120_000; // próg drugiej stawki PIT (rocznie)
const PIT_RATE_1 = 0.12;
const PIT_RATE_2 = 0.32;

// Minimalne wynagrodzenie brutto/mc per rok (do progu dopłaty rocznej).
export const MIN_WAGE_BY_YEAR: Record<number, number> = {
    2024: 4300,
    2025: 4666,
    2026: 4806, // source: Dz.U. 2025 poz. 1242, sprawdzono 2026-07-13
};

export const PPK_DEFAULT_YEAR = 2026;

const minWageForYear = (year: number): number => {
    const known = MIN_WAGE_BY_YEAR[year];
    if (known !== undefined) return known;
    const years = Object.keys(MIN_WAGE_BY_YEAR).map(Number);
    return MIN_WAGE_BY_YEAR[Math.max(...years)];
};

/**
 * Minimalna suma wpłat podstawowych (pracownik + pracodawca) w roku uprawniająca
 * do dopłaty rocznej 240 zł = wpłaty podstawowe od 6-krotności minimalnego wynagrodzenia.
 */
export const annualTopUpThreshold = (year: number): number =>
    round2(BASIC_CONTRIBUTION_RATE * 6 * minWageForYear(year));

// ── Wpłata miesięczna ──

export interface PpkMonthly {
    /** Wpłata pracownika (pomniejsza wypłatę) */
    employee: number;
    /** Wpłata pracodawcy (trafia na konto PPK) */
    employer: number;
    /** PIT od wpłaty pracodawcy (doliczana do Twojego przychodu) */
    employerTax: number;
    /** Łącznie wpływa na konto PPK w miesiącu (pracownik + pracodawca) */
    toAccount: number;
    /** Realny koszt netto pracownika (wpłata + podatek od części pracodawcy) */
    netCost: number;
}

/** Krańcowa stawka PIT wg rocznego brutto (uproszczenie: bez kwoty wolnej). */
const marginalPitRate = (grossMonthly: number): number =>
    grossMonthly * 12 > PIT_THRESHOLD ? PIT_RATE_2 : PIT_RATE_1;

/** Miesięczne wpłaty i realny koszt netto uczestnika PPK. */
export function ppkMonthly(grossMonthly: number, employeeRatePct: number, employerRatePct: number): PpkMonthly {
    const gross = Math.max(0, grossMonthly);
    const employee = round2((gross * employeeRatePct) / 100);
    const employer = round2((gross * employerRatePct) / 100);
    const employerTax = round2(employer * marginalPitRate(gross));
    return {
        employee,
        employer,
        employerTax,
        toAccount: round2(employee + employer),
        netCost: round2(employee + employerTax),
    };
}

/**
 * „100 zł na koncie PPK kosztuje Cię X zł" — kluczowy insight, bo pracodawca
 * i państwo dokładają ponad połowę. Liczone z miesięcznych wpłat (bez dopłat państwa,
 * które są roczne — realny stosunek jest jeszcze korzystniejszy).
 */
export function costPer100(m: PpkMonthly): number {
    if (m.toAccount <= 0) return 0;
    return round2((m.netCost / m.toAccount) * 100);
}

// ── Projekcja kapitału do 60. roku życia ──

export interface PpkProjectionOptions {
    grossMonthly: number;
    employeeRatePct: number;
    employerRatePct: number;
    /** Obecny wiek */
    currentAge: number;
    /** Wiek docelowy (domyślnie 60) */
    retireAge?: number;
    /** Zakładana roczna stopa zwrotu (%) */
    annualReturnPct: number;
    year?: number;
}

export interface PpkProjectionPoint {
    year: number; // rok od startu (1..N)
    age: number;
    /** Suma wpłat pracownika narastająco */
    employee: number;
    /** Suma wpłat pracodawcy narastająco */
    employer: number;
    /** Suma dopłat państwa narastająco */
    state: number;
    /** Zysk z inwestowania narastająco */
    gains: number;
    /** Wartość rachunku (suma powyższych) */
    total: number;
}

export interface PpkProjection {
    years: number;
    series: PpkProjectionPoint[];
    finalCapital: number;
    totalEmployee: number;
    totalEmployer: number;
    totalState: number;
    totalGains: number;
    /** Realny łączny koszt netto uczestnika przez cały okres */
    totalNetCost: number;
    /** Czy przy tej wpłacie spełniony jest warunek dopłaty rocznej */
    qualifiesAnnualBonus: boolean;
    warnings: string[];
}

/**
 * Projekcja wartości rachunku PPK. Model: wpłaty roczne kapitalizowane raz na koniec
 * roku zadaną stopą zwrotu; wynagrodzenie i stopa stałe (uproszczenie udokumentowane).
 */
export function ppkProjection(opts: PpkProjectionOptions): PpkProjection {
    const year = opts.year ?? PPK_DEFAULT_YEAR;
    const retireAge = opts.retireAge ?? 60;
    const years = Math.max(0, Math.floor(retireAge - opts.currentAge));
    const m = ppkMonthly(opts.grossMonthly, opts.employeeRatePct, opts.employerRatePct);
    const r = Math.max(0, opts.annualReturnPct) / 100;

    const employeeYear = round2(m.employee * 12);
    const employerYear = round2(m.employer * 12);
    const qualifiesAnnualBonus = employeeYear + employerYear >= annualTopUpThreshold(year);

    const warnings: string[] = [
        'Projekcja przy stałym wynagrodzeniu i założonej stopie zwrotu — to symulacja, nie gwarancja wyniku.',
    ];
    if (!qualifiesAnnualBonus) {
        warnings.push('Przy tak niskiej wpłacie możesz nie spełnić warunku dopłaty rocznej państwa (240 zł) — pominęliśmy ją w projekcji.');
    }

    const series: PpkProjectionPoint[] = [];
    let employeeTotal = 0;
    let employerTotal = 0;
    let stateTotal = 0;
    let balance = 0;

    for (let y = 1; y <= years; y++) {
        let stateYear = qualifiesAnnualBonus ? PPK_ANNUAL_BONUS : 0;
        if (y === 1) stateYear += PPK_WELCOME_BONUS;

        balance += employeeYear + employerYear + stateYear;
        balance *= 1 + r; // kapitalizacja na koniec roku

        employeeTotal = round2(employeeTotal + employeeYear);
        employerTotal = round2(employerTotal + employerYear);
        stateTotal = round2(stateTotal + stateYear);
        const contributions = employeeTotal + employerTotal + stateTotal;
        const gains = round2(balance - contributions);

        series.push({
            year: y,
            age: opts.currentAge + y,
            employee: employeeTotal,
            employer: employerTotal,
            state: stateTotal,
            gains,
            total: round2(balance),
        });
    }

    const finalCapital = round2(balance);
    return {
        years,
        series,
        finalCapital,
        totalEmployee: employeeTotal,
        totalEmployer: employerTotal,
        totalState: stateTotal,
        totalGains: round2(finalCapital - (employeeTotal + employerTotal + stateTotal)),
        totalNetCost: round2(m.netCost * 12 * years),
        qualifiesAnnualBonus,
        warnings,
    };
}
