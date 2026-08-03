import { Decimal } from '@prisma/client/runtime/library';

export interface DepositInterestResult {
    grossInterest: Decimal;
    netInterest: Decimal;
    taxAmount: Decimal;
    totalWithInterest: Decimal;
}

/**
 * Oblicza odsetki dla lokaty terminowej z kapitalizacją na koniec okresu.
 * Uwzględnia polski podatek od zysków kapitałowych (podatek Belki) - 19%.
 * 
 * @param balance Kwota lokaty
 * @param annualRate Roczna stopa procentowa (np. 0.05 dla 5%)
 * @param durationMonths Czas trwania w miesiącach
 * @returns Wynik obliczeń (brutto, netto, podatek, suma)
 */
export const calculateDepositInterest = (
    balance: number | Decimal,
    annualRate: number | Decimal,
    durationMonths: number
): DepositInterestResult => {
    const b = new Decimal(balance);
    const r = new Decimal(annualRate);

    // Wzór na odsetki proste: K * r * (t / 365)
    // Przyjmujemy uproszczenie: t = durationMonths * 30 dni (lub dokładniej r * months / 12)
    // Dla lokat bankowych najczęściej: Odsetki = Kapitał * oprocentowanie * (liczba dni / 365)
    // Tutaj użyjemy (months / 12) jako przybliżenie roku.

    const grossInterest = b.mul(r).mul(new Decimal(durationMonths).div(12));

    // Podatek Belki (19%) - w Polsce zaokrąglany do pełnych groszy w górę lub matematycznie?
    // Zgodnie z ustawą: podstawę opodatkowania i kwotę podatku zaokrągla się do pełnych groszy (w górę).
    const BELKA_RATE = new Decimal(0.19);
    const taxAmount = grossInterest.mul(BELKA_RATE).toDecimalPlaces(2, Decimal.ROUND_UP);

    const netInterest = grossInterest.sub(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const totalWithInterest = b.add(netInterest);

    return {
        grossInterest: grossInterest.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
        netInterest,
        taxAmount,
        totalWithInterest
    };
};
