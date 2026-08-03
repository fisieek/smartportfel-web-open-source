/**
 * Custom hooks for data fetching with TanStack Query
 * 
 * Te hooki zapewniają cachowanie danych i eliminują duplikację requestów.
 * Dane są automatycznie odświeżane przy powrocie do zakładki przeglądarki.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import type { GamificationSummary } from '../lib/gamification';
import { useCategorization } from './useCategorization';
import type {
    PersonalAccount as ApiAccount,
    Category as ApiCategory,
    Transaction as ApiTransaction,
    PlannedTransaction as ApiPlannedTransaction,
    SavingsAccount as ApiSavingsAccount,
    InvestmentAccount as ApiInvestmentAccount,
    SavingsGoal as ApiSavingsGoal,
    Investment as ApiInvestment,
    PositionsResponse,
    SoldPositionsResponse
} from '../types/api';

// ============================================================================
// TYPY
// ============================================================================

export type PersonalAccount = ApiAccount;
export type Category = ApiCategory;
export type Transaction = ApiTransaction;
export type SavingsAccount = ApiSavingsAccount;
export type InvestmentAccount = ApiInvestmentAccount;
export type SavingsGoal = ApiSavingsGoal;
export type Investment = ApiInvestment;

export interface Store {
    id: string;
    name: string;
    categoryId?: number;
    category?: Category;
    userId?: string;
    isSystemCategory?: boolean;
}

export interface PlanItem extends ApiPlannedTransaction {
    linkedRealExpenseId?: string;
}

/**
 * Bogaty kształt inwestycji zwracany przez `/investments` (endpoint listy).
 * Shared `Investment` jest celowo minimalny — strona inwestycji potrzebuje pełnego rekordu.
 */
export interface InvestmentListItem {
    id: string;
    name: string;
    type: string;
    country?: string;
    currency?: string;
    purchaseDate: string;
    purchasePrice: number;
    currentValue: number;
    quantity: number;
    updatedAt: string;
    accountId: string;
    isHistorical?: boolean;
    bondDuration?: number;
    bondInterestRate?: number;
    account?: {
        name: string;
        provider: string;
    };
}

/** Punkt historii wartości portfela (z `/investments/history`). */
export interface InvestmentHistoryPoint {
    date: string;
    totalCost: number;
    totalValue: number;
}

/**
 * Bogaty rekord konta oszczędnościowego/lokaty z `/savings`.
 * Shared `SavingsAccount` jest celowo minimalny (id/name/bank/balance) — strona
 * oszczędności potrzebuje pełnego rekordu (oprocentowanie, promo, lokata, status, zamknięcie).
 */
export interface SavingsAccountItem {
    id: string;
    name: string;
    type: 'savings' | 'personal' | 'deposit';
    balance: number;
    currency?: string;
    bank: string;
    updatedAt: string;
    interestRate?: number;
    capitalizationType?: string;
    promoEndsAt?: string;
    postPromoInterestRate?: number;
    depositStartDate?: string;
    depositDurationMonths?: number;
    status: 'ACTIVE' | 'FINISHED' | 'SETTLED';
    hasUnsettledMonths?: boolean;
    unsettledMonthsCount?: number;
    closedAt?: string | null;
}

/** Odpowiedź `/savings/summary` — suma oszczędności w PLN (backend konwertuje waluty kursem NBP). */
export interface SavingsSummary {
    total: number;
}

/** Wpłata na cel oszczędnościowy (z `/savings-goals/:id/transactions`). */
export interface SavingsGoalTransaction {
    id: string;
    description?: string;
    amount: number;
    currency?: string;
    transactionDate: string;
}

/** Filtry listy/pozycji/historii inwestycji ('ALL' = brak filtra). */
export interface InvestmentFilters {
    type: string;
    accountId: string;
}

function investmentFilterParams({ type, accountId }: InvestmentFilters): Record<string, string> {
    const params: Record<string, string> = {};
    if (type !== 'ALL') params.type = type;
    if (accountId !== 'ALL') params.accountId = accountId;
    return params;
}

// ============================================================================
// QUERY KEYS - centralne miejsce dla kluczy cache
// ============================================================================

export const queryKeys = {
    personalAccounts: ['personal-accounts'] as const,
    savingsAccounts: ['savings-accounts'] as const,
    savingsSummary: ['savings-summary'] as const,
    investmentAccounts: ['investment-accounts'] as const,
    categories: ['categories'] as const,
    savingsGoals: ['savings-goals'] as const,
    // Podklucz celów — invalidacja ['savings-goals'] czyści też historię wpłat.
    savingsGoalTransactions: (goalId: string) => ['savings-goals', goalId, 'transactions'] as const,
    investments: ['investments'] as const,
    // Podklucze inwestycji dzielą prefiks 'investments' → invalidacja ['investments'] czyści wszystkie.
    investmentsList: (type: string, accountId: string) => ['investments', 'list', type, accountId] as const,
    investmentPositions: (type: string, accountId: string) => ['investments', 'positions', type, accountId] as const,
    investmentHistory: (type: string, accountId: string) => ['investments', 'history', type, accountId] as const,
    soldInvestments: ['investments', 'sold'] as const,
    stores: ['stores'] as const,
    gamification: ['gamification'] as const,
    marketDataCapabilities: ['market-data-capabilities'] as const,
    monthlyPlan: (month: string, year: string) => ['monthly-plan', month, year] as const,
};

// ============================================================================
// HOOKI
// ============================================================================

/**
 * Pobiera konta osobiste użytkownika
 */
export function usePersonalAccounts() {
    return useQuery({
        queryKey: queryKeys.personalAccounts,
        queryFn: async () => {
            const res = await api.get<PersonalAccount[]>('/personal-accounts');
            return res.data;
        },
    });
}

/**
 * Pobiera konta oszczędnościowe użytkownika
 */
export function useSavingsAccounts() {
    return useQuery({
        queryKey: queryKeys.savingsAccounts,
        queryFn: async () => {
            // Bogaty rekord (oprocentowanie/promo/lokata/status) — nadzbiór shared SavingsAccount.
            const res = await api.get<SavingsAccountItem[]>('/savings');
            return res.data;
        },
    });
}

/**
 * Pobiera sumę oszczędności w PLN z `/savings/summary` (backend konwertuje waluty kursem NBP).
 */
export function useSavingsSummary() {
    return useQuery({
        queryKey: queryKeys.savingsSummary,
        queryFn: async () => {
            const res = await api.get<SavingsSummary>('/savings/summary');
            return res.data;
        },
    });
}

export interface MarketDataCapabilities {
    /** Czy instancja ma dostawcę notowań (`MARKET_DATA_PROVIDER` na serwerze). */
    liveQuotes: boolean;
    provider: string;
    /** Cena złota z NBP — niezależna od dostawcy, zawsze dostępna. */
    goldPrice: boolean;
}

/**
 * Czy ta instancja umie wyceniać pozycje „na żywo".
 *
 * Konfiguracja serwera nie zmienia się w trakcie sesji, więc pytamy raz i trzymamy bez
 * odświeżania. Przy błędzie zakładamy BRAK notowań — lepiej schować funkcję, niż pokazać
 * wyszukiwarkę, która zawsze zwraca zero.
 */
export function useMarketDataCapabilities() {
    return useQuery({
        queryKey: queryKeys.marketDataCapabilities,
        queryFn: async () => {
            const res = await api.get<MarketDataCapabilities>('/instruments/capabilities');
            return res.data;
        },
        staleTime: Infinity,
        retry: false,
    });
}

/**
 * Pobiera konta inwestycyjne użytkownika
 */
export function useInvestmentAccounts() {
    return useQuery({
        queryKey: queryKeys.investmentAccounts,
        queryFn: async () => {
            const res = await api.get<InvestmentAccount[]>('/investment-accounts');
            return res.data;
        },
    });
}

/**
 * Pobiera kategorie wydatków
 */
export function useCategories() {
    return useQuery({
        queryKey: queryKeys.categories,
        queryFn: async () => {
            const res = await api.get<Category[]>('/categories');
            return res.data;
        },
    });
}

/**
 * Pobiera cele oszczędnościowe
 */
export function useSavingsGoals() {
    return useQuery({
        queryKey: queryKeys.savingsGoals,
        queryFn: async () => {
            const res = await api.get<SavingsGoal[]>('/savings-goals');
            return res.data;
        },
    });
}

/**
 * Pobiera historię wpłat na dany cel oszczędnościowy (`/savings-goals/:id/transactions`).
 * Odpytuje dopiero gdy `goalId` jest ustawione (otwarcie modalu szczegółów celu).
 */
export function useSavingsGoalTransactions(goalId: string | null) {
    return useQuery({
        queryKey: queryKeys.savingsGoalTransactions(goalId ?? ''),
        queryFn: async () => {
            const res = await api.get<SavingsGoalTransaction[]>(`/savings-goals/${goalId}/transactions`);
            return res.data;
        },
        enabled: !!goalId,
    });
}

/**
 * Pobiera inwestycje
 */
export function useInvestments() {
    return useQuery({
        queryKey: queryKeys.investments,
        queryFn: async () => {
            const res = await api.get<Investment[]>('/investments');
            return res.data;
        },
    });
}

/**
 * Pobiera listę inwestycji (z filtrami typu/konta) — pełny rekord dla strony inwestycji.
 * Osobny od `useInvestments()` (minimalny, dla formularzy transakcji), dzieli prefiks 'investments'.
 */
export function useInvestmentsList(filters: InvestmentFilters) {
    return useQuery({
        queryKey: queryKeys.investmentsList(filters.type, filters.accountId),
        queryFn: async () => {
            const res = await api.get<InvestmentListItem[]>('/investments', { params: investmentFilterParams(filters) });
            return res.data;
        },
    });
}

/**
 * Pobiera pozycje portfela (FX-poprawne totale/alokacja/sparkline) z `/investments/positions`.
 */
export function useInvestmentPositions(filters: InvestmentFilters) {
    return useQuery({
        queryKey: queryKeys.investmentPositions(filters.type, filters.accountId),
        queryFn: async () => {
            const res = await api.get<PositionsResponse>('/investments/positions', { params: investmentFilterParams(filters) });
            return res.data;
        },
    });
}

/**
 * Pobiera historię wartości portfela z `/investments/history`.
 */
export function useInvestmentHistory(filters: InvestmentFilters) {
    return useQuery({
        queryKey: queryKeys.investmentHistory(filters.type, filters.accountId),
        queryFn: async () => {
            const res = await api.get<InvestmentHistoryPoint[]>('/investments/history', { params: investmentFilterParams(filters) });
            return res.data;
        },
    });
}

/**
 * Pobiera sprzedane pozycje (zrealizowany zysk/strata) z `/investments/sold`.
 */
export function useSoldInvestments() {
    return useQuery({
        queryKey: queryKeys.soldInvestments,
        queryFn: async () => {
            const res = await api.get<SoldPositionsResponse>('/investments/sold');
            return res.data;
        },
    });
}

/**
 * Pobiera sklepy użytkownika
 */
export function useStores() {
    return useQuery({
        queryKey: queryKeys.stores,
        queryFn: async () => {
            const res = await api.get<Store[]>('/stores');
            return res.data;
        },
    });
}

/**
 * Pobiera stan gamifikacji (seria, odznaki). Endpoint przelicza go read-time.
 */
export function useGamification() {
    return useQuery({
        queryKey: queryKeys.gamification,
        queryFn: async () => {
            const res = await api.get<GamificationSummary>('/gamification');
            return res.data;
        },
        // Świeże dane są kluczowe dla celebracji awansu — refetch przy wejściu na dashboard
        // i focusie łapie też tier-upy z akcji oszczędności/inwestycji (watcher deduplikuje).
        staleTime: 0,
    });
}

/**
 * Pobiera plan miesięczny (zależny od daty, więc osobny hook)
 */
export function useMonthlyPlan(month: string, year: string) {
    return useQuery({
        queryKey: queryKeys.monthlyPlan(month, year),
        queryFn: async () => {
            try {
                const res = await api.get<{ items: PlanItem[] }>('/planning/monthly-plan', { params: { month, year } });
                return res.data;
            } catch {
                // Plan może nie istnieć - to OK
                return null;
            }
        },
        // Plan jest mniej krytyczny, więc nie failujemy na błędzie
        retry: false,
    });
}

// ============================================================================
// INVALIDACJA CACHE - używaj po mutacjach (dodanie/edycja/usunięcie)
// ============================================================================

/**
 * Hook do invalidacji cache po mutacjach
 */
export function useInvalidateQueries() {
    const queryClient = useQueryClient();

    return {
        invalidateAccounts: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.personalAccounts });
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsAccounts });
            queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
        },
        invalidatePersonalAccounts: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.personalAccounts });
        },
        invalidateSavingsAccounts: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsAccounts });
        },
        invalidateInvestmentAccounts: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
        },
        invalidateCategories: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.categories });
        },
        invalidateSavingsGoals: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals });
        },
        /**
         * Odświeża cały zestaw danych oszczędnościowych (konta + suma + cele + historia wpłat).
         * Odpowiednik dawnego imperatywnego `fetchData()` po mutacji.
         * Suma jest liczona serwerowo → MUSI być inwalidowana, inaczej zostaje stale po zmianie sald.
         * Prefiks ['savings-goals'] pokrywa też historię wpłat (podklucz).
         */
        invalidateSavingsData: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsAccounts });
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsSummary });
            queryClient.invalidateQueries({ queryKey: queryKeys.savingsGoals });
        },
        invalidateInvestments: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.investments });
        },
        /**
         * Odświeża cały zestaw danych inwestycyjnych (lista/pozycje/historia/sprzedane + konta).
         * Odpowiednik dawnego imperatywnego `fetchInvestments()` po mutacji.
         * Prefiks ['investments'] pokrywa list/positions/history/sold.
         */
        invalidateInvestmentData: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.investments });
            queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts });
        },
        invalidateStores: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.stores });
        },
        invalidateGamification: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.gamification });
        },
        invalidateAll: () => {
            queryClient.invalidateQueries();
        },
    };
}

/**
 * Agregujący hook dla modali transakcji - pobiera wszystko co potrzebne
 */
export function useTransactionFormData() {
    const personalAccounts = usePersonalAccounts();
    const savingsAccounts = useSavingsAccounts();
    const investmentAccounts = useInvestmentAccounts();
    const categories = useCategories();
    const savingsGoals = useSavingsGoals();
    const investments = useInvestments();
    const stores = useStores();

    const isLoading =
        personalAccounts.isLoading ||
        savingsAccounts.isLoading ||
        investmentAccounts.isLoading ||
        categories.isLoading ||
        savingsGoals.isLoading ||
        investments.isLoading ||
        stores.isLoading;

    const isError =
        personalAccounts.isError ||
        savingsAccounts.isError ||
        investmentAccounts.isError ||
        categories.isError;

    return {
        personalAccounts: personalAccounts.data ?? [],
        savingsAccounts: savingsAccounts.data ?? [],
        investmentAccounts: investmentAccounts.data ?? [],
        categories: categories.data ?? [],
        savingsGoals: savingsGoals.data ?? [],
        investments: investments.data ?? [],
        stores: stores.data ?? [],
        isLoading,
        isError,
    };
}

export { useCategorization };
