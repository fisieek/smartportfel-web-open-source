import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { currentMonthFilter, firstDayOfFilteredMonth } from '../lib/transactionMonthFilter';

/**
 * Filtr miesiąca z listy transakcji — trzymany PONAD stroną.
 *
 * Powód: przyciski „Dodaj transakcję" / „Dodaj wpływ" siedzą w `Layout`, a filtr okresu
 * na stronie Transakcji. Bez wspólnego miejsca modal dodawania nie ma jak się dowiedzieć,
 * że użytkownik przegląda inny miesiąc niż bieżący.
 *
 * Świadomie NIE przez `Outlet context`: `useOutletContext<T>()` to asercja, a nie inferencja
 * (TypeScript nie złapie brakującego pola — ta pułapka kosztowała już czas przy wycinaniu
 * gatingu PRO), a poza tym potrzebny jest przepływ strona → Layout, nie odwrotnie.
 *
 * Sama reguła daty siedzi w `lib/transactionMonthFilter.ts` — bez Reacta, z własnymi testami.
 */

interface TransactionFiltersValue {
    /** `"YYYY-M"` (bez wiodącego zera) albo `"-"` = dowolny czas. */
    monthFilter: string;
    setMonthFilter: (value: string) => void;
    /**
     * Data początkowa dla NOWEJ transakcji: pierwszy dzień odfiltrowanego miesiąca, gdy to nie
     * miesiąc bieżący. `undefined` = zostaw dzisiejszą datę.
     */
    defaultTransactionDate?: string;
}

const TransactionFiltersContext = createContext<TransactionFiltersValue | null>(null);

export function TransactionFiltersProvider({ children }: { children: ReactNode }) {
    const [monthFilter, setMonthFilter] = useState<string>(currentMonthFilter);

    const value = useMemo<TransactionFiltersValue>(() => ({
        monthFilter,
        setMonthFilter,
        defaultTransactionDate: firstDayOfFilteredMonth(monthFilter),
    }), [monthFilter]);

    return (
        <TransactionFiltersContext.Provider value={value}>
            {children}
        </TransactionFiltersContext.Provider>
    );
}

/**
 * Bez providera zwraca stan zastępczy z bieżącym miesiącem i pustym setterem — komponent
 * renderowany w izolacji (np. w teście) nie wybucha, tylko zachowuje się jak przy filtrze
 * na miesiącu bieżącym.
 */
export function useTransactionFilters(): TransactionFiltersValue {
    const ctx = useContext(TransactionFiltersContext);
    if (ctx) return ctx;
    return { monthFilter: currentMonthFilter(), setMonthFilter: () => { }, defaultTransactionDate: undefined };
}
