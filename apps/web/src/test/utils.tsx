import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../context/ToastContext';
import { CurrencyProvider } from '../context/CurrencyContext';
import { TransactionFiltersProvider } from '../context/TransactionFiltersContext';

const createTestQueryClient = () => new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
});

export function renderWithProviders(ui: ReactNode) {
    const queryClient = createTestQueryClient();
    return render(
        <QueryClientProvider client={queryClient}>
            <CurrencyProvider>
                <ToastProvider>
                    <TransactionFiltersProvider>
                        <BrowserRouter>
                            {ui}
                        </BrowserRouter>
                    </TransactionFiltersProvider>
                </ToastProvider>
            </CurrencyProvider>
        </QueryClientProvider>
    );
}

export * from '@testing-library/react';
