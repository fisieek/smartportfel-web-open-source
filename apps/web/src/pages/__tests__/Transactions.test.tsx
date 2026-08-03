import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import Transactions from '../Transactions';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';

// Smoke: lista transakcji z /expenses + filtrowanie klientowe po wyszukiwarce.

const { mockedUseOutletContext } = vi.hoisted(() => ({
    mockedUseOutletContext: vi.fn(() => ({ refreshTrigger: 0 }))
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return { ...actual, useOutletContext: mockedUseOutletContext, useNavigate: () => vi.fn() };
});

const now = new Date();
const txDate = now.toISOString();

const transactions = [
    {
        id: 't1',
        description: 'Biedronka zakupy',
        amount: 120.5,
        plnAmount: 120.5,
        type: 'expense',
        currency: 'PLN',
        transactionDate: txDate,
        category: { name: 'Jedzenie' },
        personalAccount: { name: 'Konto', bank: 'PKO', type: 'BANK' }
    },
    {
        id: 't2',
        description: 'Wypłata',
        amount: 8000,
        plnAmount: 8000,
        type: 'income',
        currency: 'PLN',
        transactionDate: txDate,
        category: { name: 'Wynagrodzenie' },
        personalAccount: { name: 'Konto', bank: 'PKO', type: 'BANK' }
    }
];

// Placeholder wymienia, po czym da się szukać — jeden punkt zmiany, gdy tekst się przesunie.
const searchInput = () => screen.getByPlaceholderText('Opis, kwota, sklep…');

function mockGet() {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
        if (url === '/expenses') return Promise.resolve({ data: transactions });
        if (url === '/expenses/available-months') return Promise.resolve({ data: [{ year: now.getFullYear(), month: now.getMonth() + 1 }] });
        if (url === '/household') return Promise.resolve({ data: { household: null } });
        if (url.includes('/planning/monthly-plan')) return Promise.resolve({ data: { items: [] } });
        return Promise.resolve({ data: [] });
    });
}

describe('Transactions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseOutletContext.mockReturnValue({ refreshTrigger: 0 });
        mockGet();
    });

    it('renderuje listę transakcji z /expenses', async () => {
        renderWithProviders(<Transactions />);

        // Opisy pojawiają się (mobile + desktop → getAllBy)
        expect((await screen.findAllByText('Biedronka zakupy')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wypłata').length).toBeGreaterThan(0);
    });

    it('wyszukiwarka filtruje listę po opisie', async () => {
        renderWithProviders(<Transactions />);
        await screen.findAllByText('Biedronka zakupy');

        fireEvent.change(searchInput(), { target: { value: 'wypłata' } });

        await waitFor(() => {
            expect(screen.queryByText('Biedronka zakupy')).not.toBeInTheDocument();
        });
        expect(screen.getAllByText('Wypłata').length).toBeGreaterThan(0);
    });

    // To samo pole musi szukać po kwocie — użytkownicy zgłaszali, że brakuje takiej możliwości,
    // a osobnej wyszukiwarki kwot świadomie nie dodajemy.
    it('wyszukiwarka filtruje listę po kwocie', async () => {
        mockGet();
        renderWithProviders(<Transactions />);
        await screen.findAllByText('Biedronka zakupy');

        fireEvent.change(searchInput(), { target: { value: '8000' } });

        await waitFor(() => {
            expect(screen.queryByText('Biedronka zakupy')).not.toBeInTheDocument();
        });
        expect(screen.getAllByText('Wypłata').length).toBeGreaterThan(0);
    });

    it('kwotę z groszami znajduje po przecinku, tak jak ją widać na liście', async () => {
        mockGet();
        renderWithProviders(<Transactions />);
        await screen.findAllByText('Biedronka zakupy');

        fireEvent.change(searchInput(), { target: { value: '120,5' } });

        await waitFor(() => {
            expect(screen.queryByText('Wypłata')).not.toBeInTheDocument();
        });
        expect(screen.getAllByText('Biedronka zakupy').length).toBeGreaterThan(0);
    });
});
