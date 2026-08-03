import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonthlyPlanningWidget from '../MonthlyPlanningWidget';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';
import * as hooks from '../../hooks/useQueries';

// Mocks
vi.mock('../../lib/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    }
}));

vi.mock('../../hooks/useQueries', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        usePersonalAccounts: vi.fn(),
        useInvalidateQueries: vi.fn(),
        useTransactionFormData: vi.fn(),
        useSavingsAccounts: vi.fn(),
        useInvestmentAccounts: vi.fn(),
        useCategories: vi.fn(),
        useSavingsGoals: vi.fn(),
        useInvestments: vi.fn(),
        useStores: vi.fn(),
        useMonthlyPlan: vi.fn(),
    };
});

const mockPlan = {
    id: 'plan1',
    month: 2,
    year: 2026,
    items: [
        {
            id: 'item1',
            name: 'Czynsz',
            amount: 2500,
            currency: 'PLN',
            isDone: false,
            category: { name: 'Mieszkanie', color: '#ff0000' },
            recurringExpense: { type: 'expense' }
        }
    ]
};

describe('MonthlyPlanningWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (api.get as any).mockImplementation((url: string) => {
            if (url.includes('/planning/monthly-plan')) return Promise.resolve({ data: mockPlan });
            return Promise.resolve({ data: [] });
        });

        const queryRes = (data: any = []) => ({ data, isLoading: false, isError: false, refetch: vi.fn() } as any);

        vi.mocked(hooks.usePersonalAccounts).mockReturnValue(queryRes([]));
        vi.mocked(hooks.useInvalidateQueries).mockReturnValue({
            invalidatePersonalAccounts: vi.fn(),
            invalidateExpenses: vi.fn(),
            invalidateMonthlyPlan: vi.fn(),
            invalidateAll: vi.fn(),
        } as any);
        vi.mocked(hooks.useTransactionFormData).mockReturnValue({
            personalAccounts: [],
            savingsAccounts: [],
            investmentAccounts: [],
            categories: [],
            savingsGoals: [],
            investments: [],
            stores: [],
            isLoading: false,
            isError: false
        });
        vi.mocked(hooks.useMonthlyPlan).mockReturnValue(queryRes(mockPlan));
    });

    it('should render planned items', async () => {
        renderWithProviders(<MonthlyPlanningWidget />);

        // Wait for plan initialization message to disappear or plan to load
        await waitFor(() => {
            expect(screen.getByText('Czynsz')).toBeInTheDocument();
        });
    });

    it('should open execution modal', async () => {
        const user = userEvent.setup();
        renderWithProviders(<MonthlyPlanningWidget />);

        await waitFor(() => screen.getByText('Czynsz'));

        // Use a more specific selector for the "Checkbox"
        const checkboxContainer = screen.getByText('Czynsz').closest('div')?.parentElement;
        const checkbox = checkboxContainer?.querySelector('.w-\\[18px\\]');
        if (checkbox) await user.click(checkbox);

        expect(await screen.findByText(/Potwierdź realizację/i)).toBeInTheDocument();
    });
});
