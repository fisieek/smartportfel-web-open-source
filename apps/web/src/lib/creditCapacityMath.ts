/**
 * Kalkulator zdolności kredytowej (hipoteka) — model szacunkowy, transparentny.
 *
 * Metoda: wskaźnik DStI (Debt Service to Income) + bufor stopy KNF.
 *  1. Maksymalna rata na nowy kredyt = dochód netto × maxDStI − obecne zobowiązania.
 *  2. Zdolność (kwota kredytu) = odwrócony annuitet tej raty przy oprocentowaniu
 *     powiększonym o bufor +2,5 p.p. (Rekomendacja S KNF — test na wzrost stóp;
 *     nie dotyczy kredytów na stałą stopę przez cały okres).
 *  3. Realna rata liczona jest przy bieżącym oprocentowaniu (jest niższa niż maks.
 *     — to margines, który daje bufor).
 *
 * Świadome uproszczenia (sygnalizowane w `warnings`):
 *  - koszty utrzymania są ujęte pośrednio przez DStI (część 1−DStI dochodu),
 *    a nie jako osobna, bankowo-specyficzna kwota,
 *  - banki różnią się metodyką (scoring, koszty życia per osoba, źródło dochodu),
 *    więc wynik jest orientacyjny, nie stanowi decyzji kredytowej.
 *
 * source: KNF Rekomendacja S (nowelizacja 2023) — bufor min. 2,5 p.p.; sprawdzono 2026-07-13.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Minimalny bufor stopy procentowej wg Rekomendacji S KNF (p.p.). */
export const STRESS_BUFFER_PP = 2.5;

/** Predefiniowane poziomy DStI (udział raty w dochodzie). */
export const DSTI_LEVELS = [
    { value: 0.4, label: 'Ostrożnie (40%)' },
    { value: 0.5, label: 'Standard (50%)' },
    { value: 0.6, label: 'Agresywnie (60%)' },
] as const;

export interface CapacityOptions {
    /** Dochód netto gospodarstwa domowego (zł/mies.) */
    netIncome: number;
    /** Obecne miesięczne zobowiązania (raty kredytów + limity kart/kont) */
    monthlyObligations: number;
    /** Oprocentowanie kredytu w skali roku (%) */
    annualRatePct: number;
    /** Okres kredytowania w latach */
    termYears: number;
    /** Maksymalny wskaźnik DStI (np. 0.5) */
    maxDStI: number;
    /** Kredyt na stałą stopę przez cały okres → bez bufora KNF */
    fixedRate?: boolean;
}

export interface CapacityResult {
    /** Maksymalna rata, jaką „udźwignie" dochód po odjęciu zobowiązań */
    maxPayment: number;
    /** Szacowana zdolność kredytowa (maksymalna kwota kredytu) */
    maxLoanAmount: number;
    /** Realna rata przy bieżącym oprocentowaniu dla maksymalnej kwoty */
    realInstallment: number;
    /** Oprocentowanie użyte do liczenia zdolności (z buforem lub bez) */
    stressedRatePct: number;
    /** Całkowity koszt kredytu (suma rat) przy bieżącym oprocentowaniu */
    totalCost: number;
    /** Suma odsetek */
    totalInterest: number;
    warnings: string[];
}

/** Rata annuitetowa dla kapitału, miesięcznej stopy i liczby rat. */
const annuity = (principal: number, rMonthly: number, n: number): number =>
    rMonthly === 0 ? principal / n : (principal * rMonthly) / (1 - Math.pow(1 + rMonthly, -n));

/** Odwrócony annuitet: maksymalny kapitał dla danej raty. */
const capacityFromPayment = (payment: number, rMonthly: number, n: number): number =>
    rMonthly === 0 ? payment * n : (payment * (1 - Math.pow(1 + rMonthly, -n))) / rMonthly;

export function creditCapacity(opts: CapacityOptions): CapacityResult {
    const netIncome = Math.max(0, opts.netIncome);
    const obligations = Math.max(0, opts.monthlyObligations);
    const n = Math.max(1, Math.round(opts.termYears * 12));
    const dsti = Math.min(1, Math.max(0, opts.maxDStI));

    const warnings: string[] = [
        'Wynik jest szacunkowy i nie stanowi decyzji ani promesy kredytowej — banki różnią się metodyką (scoring, koszty utrzymania, źródło dochodu).',
    ];

    const maxPayment = round2(Math.max(0, netIncome * dsti - obligations));

    if (maxPayment <= 0) {
        warnings.push('Obecne zobowiązania pochłaniają cały dostępny limit raty — przy tych danych zdolność wychodzi zerowa.');
        return {
            maxPayment: 0,
            maxLoanAmount: 0,
            realInstallment: 0,
            stressedRatePct: opts.annualRatePct,
            totalCost: 0,
            totalInterest: 0,
            warnings,
        };
    }

    const stressedRatePct = opts.fixedRate ? opts.annualRatePct : opts.annualRatePct + STRESS_BUFFER_PP;
    const maxLoanAmount = round2(capacityFromPayment(maxPayment, stressedRatePct / 1200, n));
    const realInstallment = round2(annuity(maxLoanAmount, opts.annualRatePct / 1200, n));
    const totalCost = round2(realInstallment * n);
    const totalInterest = round2(totalCost - maxLoanAmount);

    if (!opts.fixedRate) {
        warnings.push(
            `Zdolność liczymy z buforem +${STRESS_BUFFER_PP.toLocaleString('pl-PL')} p.p. na wzrost stóp (Rekomendacja S KNF). Realna rata przy obecnym oprocentowaniu (${formatPct(opts.annualRatePct)}) jest niższa od maksymalnej.`
        );
    }

    return { maxPayment, maxLoanAmount, realInstallment, stressedRatePct, totalCost, totalInterest, warnings };
}

const formatPct = (v: number) => `${v.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%`;
