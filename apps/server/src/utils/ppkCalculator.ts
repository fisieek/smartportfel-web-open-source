export interface PPKContribution {
    employeeContribution: number;
    employerContribution: number;
    employerTax: number;
}

export const calculatePPK = (
    grossSalary: number,
    employeeRate: number = 2.0,
    employerRate: number = 1.5,
    cumulativeAnnualGross: number = 0
): PPKContribution => {
    const employeeContribution = (grossSalary * employeeRate) / 100;
    const employerContribution = (grossSalary * employerRate) / 100;

    // Tax threshold: 120,000 PLN
    // 12% below, 32% above
    const taxRate = cumulativeAnnualGross > 120000 ? 0.32 : 0.12;
    const employerTax = employerContribution * taxRate;

    return {
        employeeContribution: Number(employeeContribution.toFixed(2)),
        employerContribution: Number(employerContribution.toFixed(2)),
        employerTax: Number(employerTax.toFixed(2))
    };
};

// Dotacje państwowe PPK (kwoty ustawowe, stałe).
export const WELCOME_BONUS = 250;
export const ANNUAL_BONUS = 240;

// Wpłaty podstawowe: pracownik 2% + pracodawca 1,5% = 3,5% wynagrodzenia.
const BASIC_CONTRIBUTION_RATE = 0.035;

// Minimalne wynagrodzenie brutto/mc per rok (reprezentatywna wartość roczna).
// Używane wyłącznie do progu dopłaty rocznej. Uzupełniać przy publikacji nowego roku.
const MIN_WAGE_BY_YEAR: Record<number, number> = {
    2019: 2250,
    2020: 2600,
    2021: 2800,
    2022: 3010,
    2023: 3600,
    2024: 4300,
    2025: 4666,
    2026: 4806, // potwierdzone: Dz.U. 2025 poz. 1242 (rozporządzenie RM z 11.09.2025)
};

const minWageForYear = (year: number): number => {
    const known = MIN_WAGE_BY_YEAR[year];
    if (known !== undefined) return known;

    // Fallback do ostatniej znanej wartości (lata spoza tabeli).
    const years = Object.keys(MIN_WAGE_BY_YEAR).map(Number);
    const latest = Math.max(...years);
    console.warn(
        `[PPK] Brak minimalnego wynagrodzenia dla roku ${year} — fallback do ${latest} (${MIN_WAGE_BY_YEAR[latest]} zł). Uzupełnij MIN_WAGE_BY_YEAR.`
    );
    return MIN_WAGE_BY_YEAR[latest];
};

/**
 * Minimalna suma wpłat podstawowych (pracownik + pracodawca) w danym roku
 * kalendarzowym uprawniająca do dopłaty rocznej 240 zł.
 * Ustawowo = wpłaty podstawowe należne od 6-krotności minimalnego wynagrodzenia.
 */
export const annualTopUpThreshold = (year: number): number => {
    return BASIC_CONTRIBUTION_RATE * 6 * minWageForYear(year);
};
