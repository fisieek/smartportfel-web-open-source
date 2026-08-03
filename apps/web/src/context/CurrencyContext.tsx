import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../lib/api';

interface CurrencyContextType {
    displayCurrency: string;
    setDisplayCurrency: (currency: string) => void;
    availableCurrencies: string[];
    /** Kurs NBP: ile PLN za 1 jednostkę displayCurrency (1 dla PLN) */
    rate: number;
    rateLoading: boolean;
    /** Kurs pochodzi z cache (NBP niedostępne) — do badge „kurs nieaktualny" (bug I2). */
    rateStale: boolean;
    /** Data kursu użytego z cache ('YYYY-MM-DD'). */
    rateAsOf?: string;
    /** Przelicza kwotę z PLN na walutę wyświetlania */
    convertFromPLN: (amountPLN: number) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const DEFAULT_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];

export function CurrencyProvider({ children }: { children: ReactNode }) {
    const [displayCurrency, setDisplayCurrencyState] = useState<string>(() => {
        return localStorage.getItem('preferredCurrency') || 'PLN';
    });
    const [rate, setRate] = useState<number>(1);
    const [rateLoading, setRateLoading] = useState(false);
    const [rateStale, setRateStale] = useState(false);
    const [rateAsOf, setRateAsOf] = useState<string | undefined>(undefined);

    // Zmiana waluty displayowej
    const setDisplayCurrency = useCallback((currency: string) => {
        setDisplayCurrencyState(currency);
        localStorage.setItem('preferredCurrency', currency);
    }, []);

    // Kurs NBP dla wybranej waluty wyświetlania
    useEffect(() => {
        if (displayCurrency === 'PLN') {
            // Gałąź synchroniczna tego samego efektu, który dla innych walut pobiera kurs
            // z API. Rozdzielenie jej na stan wyprowadzony dałoby dwa źródła prawdy dla
            // `rate` — a od tej wartości zależy każda kwota w aplikacji.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setRate(1);
            setRateStale(false);
            setRateAsOf(undefined);
            return;
        }
        let cancelled = false;
        setRateLoading(true);
        api.get(`/expenses/exchange-rate?currency=${displayCurrency}`)
            .then(res => {
                if (!cancelled && res.data?.rate) {
                    setRate(Number(res.data.rate));
                    setRateStale(Boolean(res.data.stale));
                    setRateAsOf(res.data.rateAsOf ?? undefined);
                }
            })
            .catch(err => {
                console.warn(`Nie udało się pobrać kursu ${displayCurrency}, wracam do PLN`, err);
                if (!cancelled) {
                    setDisplayCurrencyState('PLN');
                    localStorage.setItem('preferredCurrency', 'PLN');
                    setRate(1);
                    setRateStale(false);
                    setRateAsOf(undefined);
                }
            })
            .finally(() => {
                if (!cancelled) setRateLoading(false);
            });
        return () => { cancelled = true; };
    }, [displayCurrency]);

    const convertFromPLN = useCallback((amountPLN: number) => {
        if (displayCurrency === 'PLN' || !rate) return amountPLN;
        return amountPLN / rate;
    }, [displayCurrency, rate]);

    const value = {
        displayCurrency,
        setDisplayCurrency,
        availableCurrencies: DEFAULT_CURRENCIES,
        rate,
        rateLoading,
        rateStale,
        rateAsOf,
        convertFromPLN,
    };

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
}

export function useCurrency() {
    const context = useContext(CurrencyContext);
    if (!context) {
        throw new Error('useCurrency must be used within CurrencyProvider');
    }
    return context;
}
