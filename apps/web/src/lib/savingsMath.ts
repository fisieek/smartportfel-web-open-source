/**
 * Kalkulator oszczędności (konto oszczędnościowe / lokata) — symulacja miesięczna.
 *
 * Świadome uproszczenia (v1, sygnalizowane w `warnings`):
 *  - stałe oprocentowanie przez cały okres (brak zmian stóp),
 *  - dopłata miesięczna wpłacana na początku miesiąca (od razu procentuje),
 *  - podatek Belki 19% liczony od CAŁOŚCI odsetek na koniec okresu — realnie bank
 *    pobiera go przy każdej kapitalizacji, więc rzeczywiste netto bywa minimalnie niższe
 *    (efekt jest pomijalny przy krótkich okresach, rośnie przy długich),
 *  - brak uwzględnienia inflacji (wynik w wartościach nominalnych).
 *
 * Konwencja: kwoty zaokrąglane do grosza w wynikach; symulacja liczona na pełnej precyzji.
 */

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Stawka podatku od zysków kapitałowych („podatek Belki"). */
export const BELKA_RATE = 0.19;

export type Compounding = 'monthly' | 'annual';

export interface SavingsOptions {
    /** Kwota startowa (zł) */
    initial: number;
    /** Dopłata miesięczna (zł) */
    monthly: number;
    /** Oprocentowanie nominalne w skali roku (%) */
    annualRatePct: number;
    /** Okres oszczędzania w latach (liczba całkowita ≥ 1) */
    years: number;
    /** Częstotliwość kapitalizacji odsetek */
    compounding: Compounding;
    /** Odliczać podatek Belki 19% */
    taxBelka: boolean;
}

export interface SavingsPoint {
    /** Rok od startu (0 = wpłata początkowa) */
    year: number;
    /** Suma wpłaconego kapitału narastająco */
    contributions: number;
    /** Saldo brutto (przed podatkiem Belki) */
    balanceGross: number;
    /** Saldo netto (po podatku Belki od naliczonych odsetek) */
    balanceNet: number;
}

export interface SavingsResult {
    /** Saldo końcowe brutto */
    finalGross: number;
    /** Saldo końcowe po podatku Belki */
    finalNet: number;
    /** Suma wpłat (kapitał startowy + dopłaty) */
    totalContributions: number;
    /** Zarobione odsetki brutto */
    totalInterestGross: number;
    /** Zarobione odsetki po podatku Belki */
    totalInterestNet: number;
    /** Zapłacony podatek Belki */
    taxPaid: number;
    /** Seria narastania po latach (długość = years + 1) — do wykresu */
    series: SavingsPoint[];
    warnings: string[];
}

/** Saldo netto = wpłaty + (saldo_brutto − wpłaty) × (1 − Belka). */
const netFromGross = (balanceGross: number, contributions: number, taxBelka: boolean): number => {
    const interest = Math.max(0, balanceGross - contributions);
    const netInterest = taxBelka ? interest * (1 - BELKA_RATE) : interest;
    return contributions + netInterest;
};

/**
 * Symuluje oszczędzanie miesiąc po miesiącu. Kapitalizacja miesięczna dopisuje
 * odsetki co miesiąc; roczna — akumuluje je i dopisuje na koniec każdego roku
 * (odsetki liczone od bieżącego salda co miesiąc, ale procent składany dopiero rocznie).
 */
export function calculateSavings(opts: SavingsOptions): SavingsResult {
    const initial = Math.max(0, opts.initial);
    const monthly = Math.max(0, opts.monthly);
    const years = Math.max(0, Math.floor(opts.years));
    const rMonthly = Math.max(0, opts.annualRatePct) / 100 / 12;
    const months = years * 12;

    const warnings: string[] = [];
    if (opts.taxBelka) {
        warnings.push(
            'Podatek Belki (19%) liczymy od całości odsetek na koniec okresu — bank pobiera go zwykle przy każdej kapitalizacji, więc realne netto bywa nieznacznie niższe.'
        );
    }
    warnings.push('Zakładamy stałe oprocentowanie przez cały okres. Wynik jest nominalny — nie uwzględnia inflacji.');

    const series: SavingsPoint[] = [
        { year: 0, contributions: round2(initial), balanceGross: round2(initial), balanceNet: round2(initial) },
    ];

    if (years === 0 || opts.annualRatePct < 0) {
        return {
            finalGross: round2(initial),
            finalNet: round2(initial),
            totalContributions: round2(initial),
            totalInterestGross: 0,
            totalInterestNet: 0,
            taxPaid: 0,
            series,
            warnings,
        };
    }

    let balance = initial;
    let contributions = initial;
    let accrued = 0; // odsetki naliczone, jeszcze niedopisane (tryb roczny)

    for (let month = 1; month <= months; month++) {
        balance += monthly; // dopłata na początku miesiąca
        contributions += monthly;

        const interest = balance * rMonthly;
        if (opts.compounding === 'monthly') {
            balance += interest;
        } else {
            accrued += interest;
            if (month % 12 === 0) {
                balance += accrued;
                accrued = 0;
            }
        }

        if (month % 12 === 0) {
            series.push({
                year: month / 12,
                contributions: round2(contributions),
                balanceGross: round2(balance),
                balanceNet: round2(netFromGross(balance, contributions, opts.taxBelka)),
            });
        }
    }

    const finalGross = round2(balance);
    const totalContributions = round2(contributions);
    const totalInterestGross = round2(finalGross - totalContributions);
    const taxPaid = opts.taxBelka ? round2(Math.max(0, totalInterestGross) * BELKA_RATE) : 0;
    const finalNet = round2(finalGross - taxPaid);
    const totalInterestNet = round2(totalInterestGross - taxPaid);

    return {
        finalGross,
        finalNet,
        totalContributions,
        totalInterestGross,
        totalInterestNet,
        taxPaid,
        series,
        warnings,
    };
}
