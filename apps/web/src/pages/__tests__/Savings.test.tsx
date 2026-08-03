import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import Savings from '../Savings';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';

// Testy CHARAKTERYZACYJNE (etap 3a refactoru) — opisują obecne zachowanie strony
// PRZED migracją na TanStack Query. Asercje celują w wywołania `api` (URL + payload),
// nie w wewnętrzny stan, żeby przetrwały refaktor 3b bez osłabiania.

// Ciężkie modale/widgety nieużywane w tych przepływach — stub jak OnboardingWidget w Budget.test
vi.mock('../../components/savings/MonthlyProfitModal', () => ({
    default: () => null
}));
vi.mock('../../components/savings/SettleDepositModal', () => ({
    default: () => null
}));
vi.mock('../../components/savings/RealGainsWidget', () => ({
    default: () => <div data-testid="real-gains-mock" />
}));

const savingsAccount = {
    id: 'acc1',
    name: 'Konto Oszczędnościowe Millennium',
    type: 'savings',
    balance: 10000.5,
    currency: 'PLN',
    bank: 'Bank Millennium',
    updatedAt: '2026-07-01T00:00:00.000Z',
    interestRate: 6.5,
    status: 'ACTIVE',
    closedAt: null
};

const depositAccount = {
    id: 'dep1',
    name: 'Lokata Pekao',
    type: 'deposit',
    balance: 5000,
    currency: 'PLN',
    bank: 'Bank Pekao',
    updatedAt: '2026-07-01T00:00:00.000Z',
    interestRate: 5,
    capitalizationType: 'at_end',
    depositStartDate: '2026-06-01T00:00:00.000Z',
    depositDurationMonths: 3,
    status: 'ACTIVE',
    closedAt: null
};

const archivedAccount = {
    id: 'arch1',
    name: 'Stare konto',
    type: 'savings',
    balance: 0,
    currency: 'PLN',
    bank: 'mBank',
    updatedAt: '2026-05-01T00:00:00.000Z',
    status: 'ACTIVE',
    closedAt: '2026-05-01T00:00:00.000Z'
};

const mockGoals = [
    { id: 'g1', name: 'Poduszka finansowa', targetAmount: 10000, currentAmount: 2500, isMain: true },
    { id: 'g2', name: 'Wakacje', targetAmount: 5000, currentAmount: 1000, isMain: false }
];

/** Ustawia mocki GET pod fetchData strony: /savings, /savings/summary, /savings-goals?t=... */
function mockGetData({
    accounts = [savingsAccount, depositAccount, archivedAccount],
    goals = mockGoals,
    summaryTotal = 12345.67
}: { accounts?: any[]; goals?: any[]; summaryTotal?: number } = {}) {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
        // Kolejność ma znaczenie: /savings-goals i /savings/summary przed samym /savings
        if (url.startsWith('/savings-goals')) return Promise.resolve({ data: goals });
        if (url === '/savings/summary') return Promise.resolve({ data: { total: summaryTotal } });
        if (url === '/savings') return Promise.resolve({ data: accounts });
        return Promise.resolve({ data: {} });
    });
}

/** Matcher odporny na formatowanie pl-PL (NBSP w separatorze tysięcy) */
const textIncludes = (needle: string) => (content: string) =>
    content.replace(/\s/g, '').includes(needle.replace(/\s/g, ''));

describe('Savings Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetData();
        vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
        vi.spyOn(api, 'put').mockResolvedValue({ data: {} });
        vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
        vi.spyOn(api, 'delete').mockResolvedValue({ data: {} });
    });

    it('renderuje konta, lokaty, sumę z /savings/summary i cele', async () => {
        renderWithProviders(<Savings />);

        // Suma oszczędności z summary (nie suma sald!)
        expect(await screen.findByText(textIncludes('12345,67'))).toBeInTheDocument();

        // Konto oszczędnościowe i lokata w swoich kolumnach
        expect(screen.getByText('Konto Oszczędnościowe Millennium')).toBeInTheDocument();
        expect(screen.getByText('Lokata Pekao')).toBeInTheDocument();

        // Zamknięte konta zwinięte, ale sekcja z licznikiem widoczna
        expect(screen.getByText(textIncludes('Zamknięte konta · 1'))).toBeInTheDocument();

        // Cele (GoalsSection ładuje je osobnym query → findBy)
        expect(await screen.findByText('Poduszka finansowa')).toBeInTheDocument();
        expect(screen.getByText('Wakacje')).toBeInTheDocument();
    });

    it('dodaje konto oszczędnościowe — POST /savings z poprawnym payloadem', async () => {
        renderWithProviders(<Savings />);
        await screen.findByText('Konto Oszczędnościowe Millennium');

        // Otwórz modal dodawania (przycisk "Dodaj" w nagłówku)
        fireEvent.click(screen.getByRole('button', { name: /^dodaj$/i }));

        fireEvent.change(screen.getByPlaceholderText('np. Konto Oszczędnościowe'), {
            target: { value: 'Nowe konto' }
        });

        // Select banku = ten z opcją "Wybierz bank"
        const bankSelect = screen
            .getAllByRole('combobox')
            .find(s => s.innerHTML.includes('Wybierz bank'))!;
        fireEvent.change(bankSelect, { target: { value: 'mBank' } });

        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5000' } });
        fireEvent.change(screen.getByPlaceholderText('np. 7.00'), { target: { value: '7.5' } });

        fireEvent.click(screen.getByRole('button', { name: /^zapisz$/i }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/savings', expect.objectContaining({
                name: 'Nowe konto',
                type: 'savings',
                bank: 'mBank',
                balance: 5000,
                currency: 'PLN',
                interestRate: 7.5,
                capitalizationType: 'monthly',
                promoEndsAt: null,
                postPromoInterestRate: null,
                depositStartDate: null,
                depositDurationMonths: null
            }));
        });
    });

    it('edytuje konto — PUT /savings/:id z przeliczonym saldem', async () => {
        // Jedno konto, żeby przycisk "Edytuj" był jednoznaczny
        mockGetData({ accounts: [savingsAccount] });
        renderWithProviders(<Savings />);
        await screen.findByText('Konto Oszczędnościowe Millennium');

        fireEvent.click(screen.getByTitle('Edytuj'));

        // Formularz prefillowany danymi konta
        const nameInput = screen.getByPlaceholderText('np. Konto Oszczędnościowe') as HTMLInputElement;
        expect(nameInput.value).toBe('Konto Oszczędnościowe Millennium');

        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '6000' } });
        fireEvent.click(screen.getByRole('button', { name: /zapisz zmiany/i }));

        await waitFor(() => {
            expect(api.put).toHaveBeenCalledWith('/savings/acc1', expect.objectContaining({
                name: 'Konto Oszczędnościowe Millennium',
                balance: 6000,
                interestRate: 6.5
            }));
        });
    });

    it('usuwa konto przez ConfirmModal — DELETE /savings/:id', async () => {
        mockGetData({ accounts: [savingsAccount] });
        renderWithProviders(<Savings />);
        await screen.findByText('Konto Oszczędnościowe Millennium');

        fireEvent.click(screen.getByTitle('Usuń'));

        // ConfirmModal z ostrzeżeniem — DELETE dopiero po potwierdzeniu
        expect(await screen.findByText(/Czy na pewno chcesz usunąć konto/)).toBeInTheDocument();
        expect(api.delete).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: /potwierdź/i }));

        await waitFor(() => {
            expect(api.delete).toHaveBeenCalledWith('/savings/acc1');
        });
        expect(await screen.findByText('Konto zostało usunięte')).toBeInTheDocument();
    });

    it('tworzy cel — POST /savings-goals z nazwą i kwotą docelową', async () => {
        renderWithProviders(<Savings />);
        await screen.findByText('Poduszka finansowa');

        fireEvent.click(screen.getByRole('button', { name: /dodaj cel/i }));
        expect(await screen.findByText('Nowy cel oszczędnościowy')).toBeInTheDocument();

        fireEvent.change(screen.getByPlaceholderText('np. Wakacje 2024'), {
            target: { value: 'Nowy samochód' }
        });
        fireEvent.change(screen.getByPlaceholderText('5000'), { target: { value: '80000' } });

        // Submit w modalu (portal renderuje się na końcu body)
        const submitButtons = screen.getAllByRole('button', { name: /dodaj cel/i });
        fireEvent.click(submitButtons[submitButtons.length - 1]);

        await waitFor(() => {
            // Charakteryzacja: payload idzie surowy — targetAmount jako string
            expect(api.post).toHaveBeenCalledWith('/savings-goals', {
                name: 'Nowy samochód',
                targetAmount: '80000',
                isMain: false
            });
        });
    });

    it('transferuje środki między celami — POST /savings-goals/transfer z kwotą i kierunkiem', async () => {
        renderWithProviders(<Savings />);
        await screen.findByText('Poduszka finansowa');

        fireEvent.click(screen.getByRole('button', { name: /przenieś środki/i }));

        // W otwartym modalu transferu są dokładnie 2 selecty (z celu / do celu)
        const selects = screen.getAllByRole('combobox');
        expect(selects).toHaveLength(2);
        fireEvent.change(selects[0], { target: { value: 'g1' } });
        fireEvent.change(selects[1], { target: { value: 'g2' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '250' } });

        fireEvent.click(screen.getByRole('button', { name: /wykonaj transfer/i }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/savings-goals/transfer', {
                fromGoalId: 'g1',
                toGoalId: 'g2',
                amount: 250
            });
        });
        expect(await screen.findByText('Środki zostały przelane!')).toBeInTheDocument();
    });

    it('waliduje transfer po stronie UI — brak pól = toast, zero wywołań API', async () => {
        renderWithProviders(<Savings />);
        await screen.findByText('Poduszka finansowa');

        fireEvent.click(screen.getByRole('button', { name: /przenieś środki/i }));
        fireEvent.click(screen.getByRole('button', { name: /wykonaj transfer/i }));

        expect(await screen.findByText('Wypełnij wszystkie pola')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('błąd API przy zapisie konta — toast z komunikatem serwera, brak crasha', async () => {
        vi.spyOn(api, 'post').mockRejectedValue({
            response: { data: { error: 'Limit kont osiągnięty' } }
        });
        renderWithProviders(<Savings />);
        await screen.findByText('Konto Oszczędnościowe Millennium');

        fireEvent.click(screen.getByRole('button', { name: /^dodaj$/i }));
        fireEvent.change(screen.getByPlaceholderText('np. Konto Oszczędnościowe'), {
            target: { value: 'Nowe konto' }
        });
        const bankSelect = screen
            .getAllByRole('combobox')
            .find(s => s.innerHTML.includes('Wybierz bank'))!;
        fireEvent.change(bankSelect, { target: { value: 'mBank' } });
        fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '100' } });
        fireEvent.click(screen.getByRole('button', { name: /^zapisz$/i }));

        expect(await screen.findByText(/Nie udało się zapisać konta: Limit kont osiągnięty/)).toBeInTheDocument();
    });

    it('błędy pobierania danych — strona renderuje puste stany bez crasha', async () => {
        vi.spyOn(api, 'get').mockRejectedValue(new Error('Network error'));
        renderWithProviders(<Savings />);

        expect(await screen.findByText('Brak aktywnych kont')).toBeInTheDocument();
        expect(screen.getByText('Brak aktywnych lokat')).toBeInTheDocument();
        expect(screen.getByText('Brak wyznaczonych celów')).toBeInTheDocument();
        // Suma spada do 0,00 zamiast wywalać stronę
        expect(screen.getByText(textIncludes('0,00'))).toBeInTheDocument();
    });
});
