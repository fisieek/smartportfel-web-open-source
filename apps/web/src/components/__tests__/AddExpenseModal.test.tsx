import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddExpenseModal from '../AddExpenseModal';
import { renderWithProviders } from '../../test/utils';
import * as useQueries from '../../hooks/useQueries';
import api from '../../lib/api';

// Mocks
vi.mock('../../hooks/useQueries', () => ({
    useTransactionFormData: vi.fn(),
    useMonthlyPlan: vi.fn(),
    useCategories: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
    default: {
        post: vi.fn(),
        put: vi.fn(),
        get: vi.fn(),
    }
}));

const mockOnSuccess = vi.fn();
const mockOnClose = vi.fn();

const mockFormData = {
    personalAccounts: [{ id: 'acc1', name: 'Main Account', balance: 1000, isMain: true, currency: 'PLN' }],
    savingsAccounts: [],
    investmentAccounts: [],
    categories: [{ id: 'cat1', name: 'Food' }, { id: 'cat2', name: 'Transport' }, { id: 'cat3', name: 'Inne' }],
    savingsGoals: [],
    investments: [],
    stores: [],
};

describe('AddExpenseModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (useQueries.useTransactionFormData as any).mockReturnValue(mockFormData);
        (useQueries.useMonthlyPlan as any).mockReturnValue({ data: { items: [] } });
        (useQueries.useCategories as any).mockReturnValue({ data: mockFormData.categories });
        (api.post as any).mockResolvedValue({ data: { id: 'txn123' } });
    });

    it('should render form fields correctly', () => {
        renderWithProviders(<AddExpenseModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);

        // Check tabs are rendered
        expect(screen.getByText('Wydatek')).toBeInTheDocument();
        expect(screen.getByText('Przelew wewnętrzny')).toBeInTheDocument();

        // Check amount input
        expect(screen.getByPlaceholderText(/0.00/)).toBeInTheDocument();
    });

    // Gdy na liście transakcji odfiltrowany jest inny miesiąc niż bieżący, nowa pozycja ma
    // wpaść w TEN miesiąc — inaczej wpis znika z widoku i wygląda, jakby się nie zapisał.
    it('bierze datę początkową z propa defaultDate', () => {
        renderWithProviders(
            <AddExpenseModal onSuccess={mockOnSuccess} onClose={mockOnClose} defaultDate="2026-03-01" />
        );

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        expect(dateInput.value).toBe('2026-03-01');
    });

    it('bez defaultDate zostaje dzisiejsza data', () => {
        renderWithProviders(<AddExpenseModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        expect(dateInput.value).toBe(new Date().toISOString().split('T')[0]);
    });

    it('przy EDYCJI data z rekordu wygrywa nad defaultDate', () => {
        renderWithProviders(
            <AddExpenseModal
                onSuccess={mockOnSuccess}
                onClose={mockOnClose}
                defaultDate="2026-03-01"
                transaction={{ id: 'x1', amount: 50, type: 'expense', transactionDate: '2025-11-17T00:00:00.000Z' }}
            />
        );

        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        expect(dateInput.value).toBe('2025-11-17');
    });

    it('should submit form with correct data', async () => {
        renderWithProviders(<AddExpenseModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);

        const user = userEvent.setup();

        // Amount
        const amountInput = screen.getByPlaceholderText(/0.00/);
        await user.type(amountInput, '123.45');

        // Store (pierwsze pole "Wpisz..." to Sklep, drugie to Notatka)
        const storeInput = screen.getAllByPlaceholderText(/Wpisz/)[0];
        await user.type(storeInput, 'Testowy sklep');

        const submitBtn = screen.getByRole('button', { name: /Dodaj transakcję/i });
        await user.click(submitBtn);

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledTimes(1);
            expect(mockOnSuccess).toHaveBeenCalled();
            expect(mockOnClose).toHaveBeenCalled();
        });
    });

    it('should show error if submission fails', async () => {
        (api.post as any).mockRejectedValue(new Error('Network error'));

        renderWithProviders(<AddExpenseModal onSuccess={mockOnSuccess} onClose={mockOnClose} />);
        const user = userEvent.setup();

        await user.type(screen.getByPlaceholderText(/0.00/), '10');
        await user.type(screen.getAllByPlaceholderText(/Wpisz/)[0], 'Testowy sklep');

        await user.click(screen.getByRole('button', { name: /Dodaj transakcję/i }));

        await waitFor(() => {
            expect(api.post).toHaveBeenCalled();
            expect(mockOnSuccess).not.toHaveBeenCalled();
        });
    });
});
