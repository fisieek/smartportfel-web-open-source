export interface LoanParams {
    currentBalance: number;
    termMonths: number | null | undefined;
    marginRate: number | null | undefined;
    referenceRate: number | null | undefined;
    installmentType: 'EQUAL' | 'DECREASING' | null | undefined;
    paymentsMade: number;
}

export interface InstallmentSuggestion {
    totalAmount: number;
    principalAmount: number;
    interestAmount: number;
    remainingMonths: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Wylicza sugerowaną ratę z parametrów kredytu (saldo, oprocentowanie, pozostały okres).
 * Zwraca null, gdy brakuje parametrów do wyliczenia.
 */
export function suggestInstallment(p: LoanParams): InstallmentSuggestion | null {
    const { currentBalance, termMonths, installmentType, paymentsMade } = p;
    const marginRate = p.marginRate ?? null;
    const referenceRate = p.referenceRate ?? null;

    if (!installmentType) return null;
    if (!termMonths || termMonths <= 0) return null;
    if (marginRate === null && referenceRate === null) return null;
    if (!currentBalance || currentBalance <= 0) return null;

    const annualRate = (Number(marginRate ?? 0) + Number(referenceRate ?? 0)) / 100;
    const r = annualRate / 12;
    const n = Math.max(1, termMonths - paymentsMade);
    const B = Number(currentBalance);

    let totalAmount: number;
    let interestAmount: number;
    let principalAmount: number;

    if (installmentType === 'DECREASING') {
        principalAmount = B / n;
        interestAmount = B * r;
        totalAmount = principalAmount + interestAmount;
    } else {
        // EQUAL — annuitet
        if (r === 0) {
            totalAmount = B / n;
            interestAmount = 0;
        } else {
            totalAmount = (B * r) / (1 - Math.pow(1 + r, -n));
            interestAmount = B * r;
        }
        principalAmount = totalAmount - interestAmount;
    }

    return {
        totalAmount: round2(totalAmount),
        principalAmount: round2(principalAmount),
        interestAmount: round2(interestAmount),
        remainingMonths: n,
    };
}

// ─── Kalkulator kredytu: pełny harmonogram i symulacje ───

export type OverpaymentStrategy = 'SHORTEN_TERM' | 'LOWER_INSTALLMENT';

export interface ScheduleParams {
    /** Kwota kredytu (kapitał do spłaty) */
    principal: number;
    /** Okres w miesiącach */
    termMonths: number;
    /** Oprocentowanie roczne w % (marża + stawka referencyjna) */
    annualRatePercent: number;
    installmentType: 'EQUAL' | 'DECREASING';
    /** Stała miesięczna nadpłata ponad ratę */
    monthlyOverpayment?: number;
    /** Co robi nadpłata: skraca okres (domyślnie) czy obniża ratę */
    overpaymentStrategy?: OverpaymentStrategy;
}

export interface ScheduleRow {
    month: number;
    payment: number;
    principal: number;
    interest: number;
    overpayment: number;
    balance: number;
}

export interface ScheduleResult {
    rows: ScheduleRow[];
    months: number;
    totalPaid: number;
    totalInterest: number;
    firstInstallment: number;
    lastInstallment: number;
}

/**
 * Pełny harmonogram spłaty (raty równe lub malejące) z opcjonalną stałą nadpłatą.
 * Zwraca null przy nieprawidłowych parametrach.
 */
export function generateSchedule(p: ScheduleParams): ScheduleResult | null {
    const { principal, termMonths, annualRatePercent, installmentType } = p;
    const overpayment = Math.max(0, p.monthlyOverpayment ?? 0);
    const strategy: OverpaymentStrategy = p.overpaymentStrategy ?? 'SHORTEN_TERM';

    if (!principal || principal <= 0) return null;
    if (!termMonths || termMonths <= 0 || !Number.isFinite(termMonths)) return null;
    if (annualRatePercent < 0 || !Number.isFinite(annualRatePercent)) return null;

    const r = annualRatePercent / 100 / 12;
    const rows: ScheduleRow[] = [];

    let balance = principal;
    let totalPaid = 0;
    let totalInterest = 0;

    // Część stała raty wyliczana na starcie; przy strategii LOWER_INSTALLMENT
    // przeliczana co miesiąc dla pozostałego salda i okresu.
    let equalInstallment = installmentType === 'EQUAL'
        ? (r === 0 ? principal / termMonths : (principal * r) / (1 - Math.pow(1 + r, -termMonths)))
        : 0;
    let decreasingPrincipal = installmentType === 'DECREASING' ? principal / termMonths : 0;

    // Limit twardy: maks. 50 lat — chroni przed nieskończoną pętlą przy złych danych
    const maxMonths = Math.min(termMonths + 1, 601);

    for (let month = 1; balance > 0.005 && month <= maxMonths; month++) {
        const remainingMonths = Math.max(1, termMonths - month + 1);

        if (overpayment > 0 && strategy === 'LOWER_INSTALLMENT') {
            if (installmentType === 'EQUAL') {
                equalInstallment = r === 0
                    ? balance / remainingMonths
                    : (balance * r) / (1 - Math.pow(1 + r, -remainingMonths));
            } else {
                decreasingPrincipal = balance / remainingMonths;
            }
        }

        const interest = balance * r;
        let principalPart = installmentType === 'EQUAL'
            ? equalInstallment - interest
            : decreasingPrincipal;

        let over = overpayment;

        // Ostatnia rata: spłacamy dokładnie tyle, ile zostało
        if (principalPart + over >= balance) {
            if (principalPart >= balance) {
                principalPart = balance;
                over = 0;
            } else {
                over = balance - principalPart;
            }
        }

        const payment = principalPart + interest + over;
        balance -= principalPart + over;
        totalPaid += payment;
        totalInterest += interest;

        rows.push({
            month,
            payment: round2(payment),
            principal: round2(principalPart),
            interest: round2(interest),
            overpayment: round2(over),
            balance: round2(Math.max(0, balance)),
        });
    }

    if (rows.length === 0) return null;

    return {
        rows,
        months: rows.length,
        totalPaid: round2(totalPaid),
        totalInterest: round2(totalInterest),
        firstInstallment: rows[0].payment,
        lastInstallment: rows[rows.length - 1].payment,
    };
}

export interface OverpaymentComparison {
    base: ScheduleResult;
    withOverpayment: ScheduleResult;
    interestSaved: number;
    monthsSaved: number;
}

/** Porównanie harmonogramu bez nadpłaty i z nadpłatą (oszczędność odsetek, skrócenie okresu). */
export function compareOverpayment(
    params: Omit<ScheduleParams, 'monthlyOverpayment' | 'overpaymentStrategy'>,
    monthlyOverpayment: number,
    strategy: OverpaymentStrategy
): OverpaymentComparison | null {
    const base = generateSchedule(params);
    const withOverpayment = generateSchedule({ ...params, monthlyOverpayment, overpaymentStrategy: strategy });
    if (!base || !withOverpayment) return null;

    return {
        base,
        withOverpayment,
        interestSaved: round2(base.totalInterest - withOverpayment.totalInterest),
        monthsSaved: base.months - withOverpayment.months,
    };
}
