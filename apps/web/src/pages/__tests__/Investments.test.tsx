import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import Investments from '../Investments';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';
import * as hooks from '../../hooks/useQueries';

// Standardize mocking before all
vi.mock('../../hooks/useQueries', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        usePersonalAccounts: vi.fn(),
        useInvestmentAccounts: vi.fn(),
        useTransactionFormData: vi.fn(),
        useInvalidateQueries: vi.fn(),
        useCategories: vi.fn(),
        useSavingsAccounts: vi.fn(),
        useSavingsGoals: vi.fn(),
        useInvestments: vi.fn(),
        useStores: vi.fn(),
        useMarketDataCapabilities: vi.fn(),
    };
});

// Mock InvestmentChart to avoid dealing with Recharts in unit tests
vi.mock('../../components/InvestmentChart', () => ({
    default: () => <div data-testid="investment-chart">Wykres</div>
}));

const mockInvestments = [
    {
        id: 'inv1',
        name: 'NVIDIA Corp. (NVDA)',
        type: 'STOCK',
        purchasePrice: 100,
        currentValue: 150,
        quantity: 10,
        purchaseDate: '2025-01-01',
        accountId: 'acc1',
        currency: 'USD'
    }
];

const mockAccounts = [
    { id: 'acc1', name: 'XTB Broker', provider: 'XTB', balance: 5000 }
];

describe('Investments Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock API responses
        vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
            if (url === '/investment-accounts') return { data: mockAccounts };
            if (url === '/investments/history') return { data: [] };
            if (url === '/investments') return { data: mockInvestments };
            if (url === '/investments/sold') return { data: { positions: [], totalRealizedPLN: 0 } };
            return { data: [] };
        });

        // Mock Hooks
        const queryRes = (data: any = []) => ({ data, isLoading: false, isError: false, refetch: vi.fn() } as any);

        vi.mocked(hooks.usePersonalAccounts).mockReturnValue(queryRes([]));
        vi.mocked(hooks.useInvestmentAccounts).mockReturnValue(queryRes(mockAccounts));
        vi.mocked(hooks.useCategories).mockReturnValue(queryRes([]));
        vi.mocked(hooks.useSavingsAccounts).mockReturnValue(queryRes([]));
        vi.mocked(hooks.useSavingsGoals).mockReturnValue(queryRes([]));
        vi.mocked(hooks.useInvestments).mockReturnValue(queryRes(mockInvestments));
        vi.mocked(hooks.useStores).mockReturnValue(queryRes([]));
        // Domyślnie instancja Z dostawcą notowań; wariant „bez" ustawia to jawnie.
        vi.mocked(hooks.useMarketDataCapabilities).mockReturnValue(
            queryRes({ liveQuotes: true, provider: 'wlasny-dostawca', goldPrice: true })
        );

        vi.mocked(hooks.useTransactionFormData).mockReturnValue({
            personalAccounts: [],
            savingsAccounts: [],
            investmentAccounts: mockAccounts,
            categories: [],
            savingsGoals: [],
            investments: mockInvestments,
            stores: [],
            isLoading: false,
            isError: false
        });

        vi.mocked(hooks.useInvalidateQueries).mockReturnValue({
            invalidatePersonalAccounts: vi.fn(),
            invalidateInvestmentAccounts: vi.fn(),
            invalidateExpenses: vi.fn(),
            invalidateAll: vi.fn(),
            invalidateAccounts: vi.fn(),
        } as any);
    });

    it('should render equity summary and accounts', async () => {
        renderWithProviders(<Investments />);

        // Use findBy to wait for initial load
        // Total = 1500 + 5000 = 6500
        expect(await screen.findByText(/6.*500/)).toBeInTheDocument();

        // Check for "Gotówka" label and value
        expect(screen.getByText(/Gotówka:/)).toBeInTheDocument();
        expect(screen.getAllByText(/5.*000/).length).toBeGreaterThan(0);
    });

    it('should show investment account details', async () => {
        renderWithProviders(<Investments />);

        // Wait for account name to appear somewhere in the grid
        // Using findAllByText logic because it might be in different places
        await waitFor(async () => {
            const matches = await screen.findAllByText(/XTB Broker/i);
            expect(matches.length).toBeGreaterThan(0);
        }, { timeout: 4000 });
    });

    it('should show profit display', async () => {
        renderWithProviders(<Investments />);

        // 1500 - 1000 = 500
        await waitFor(async () => {
            const matches = await screen.findAllByText(/500,00/);
            expect(matches.length).toBeGreaterThan(0);
        });
    });

    // Instancja bez MARKET_DATA_PROVIDER nie ma czego odświeżać — przycisk musi zniknąć,
    // a nie stać martwy. Ręczne wpisanie ceny („Wpisz ceny") zostaje jedyną drogą.
    describe('bez dostawcy notowań', () => {
        beforeEach(() => {
            vi.mocked(hooks.useMarketDataCapabilities).mockReturnValue(
                { data: { liveQuotes: false, provider: 'none', goldPrice: true }, isLoading: false, isError: false, refetch: vi.fn() } as any
            );
        });

        it('chowa przycisk „Odśwież ceny", zostawia „Wpisz ceny"', async () => {
            renderWithProviders(<Investments />);

            expect(await screen.findByText(/Wpisz ceny/)).toBeInTheDocument();
            expect(screen.queryByText(/Odśwież ceny/)).not.toBeInTheDocument();
        });
    });

    it('z dostawcą notowań pokazuje przycisk „Odśwież ceny"', async () => {
        renderWithProviders(<Investments />);

        expect(await screen.findByText(/Odśwież ceny/)).toBeInTheDocument();
    });
});
