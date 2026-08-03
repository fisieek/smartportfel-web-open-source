/**
 * Matematyka kredytowa mieszka w `@smartportfel/shared` (jedno źródło prawdy dla weba i serwera).
 * Ten plik to re-eksport zachowujący dotychczasowe ścieżki importu na webie.
 */
export {
    suggestInstallment,
    generateSchedule,
    compareOverpayment,
    type LoanParams,
    type InstallmentSuggestion,
    type OverpaymentStrategy,
    type ScheduleParams,
    type ScheduleRow,
    type ScheduleResult,
    type OverpaymentComparison,
} from '@smartportfel/shared';
