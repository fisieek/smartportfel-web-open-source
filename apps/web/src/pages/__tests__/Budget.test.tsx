import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import Budget from '../Budget';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';

// Use vi.hoisted to ensure mock is set up correctly before everything
const { mockedUseOutletContext } = vi.hoisted(() => ({
    mockedUseOutletContext: vi.fn(() => ({ refreshTrigger: 0 }))
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useOutletContext: mockedUseOutletContext,
        useNavigate: () => vi.fn(),
    };
});

// Mock OnboardingWidget to avoid interference
vi.mock('../components/OnboardingWidget', () => ({
    default: () => <div data-testid="onboarding-mock">Onboarding</div>
}));

describe('Budget Page', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default context
        mockedUseOutletContext.mockReturnValue({ refreshTrigger: 0 });

        // Mock API responses according to Budget.tsx actual usage
        vi.spyOn(api, 'get').mockImplementation((url: string) => {
            if (url.includes('/expenses/summary')) {
                return Promise.resolve({
                    data: {
                        totalPersonalAccounts: 5000.50,
                        totalExpenses: 1200.75,
                        totalSavings: 1000,
                        totalInvestments: 0,
                        totalPPK: 0,
                        recentTransactions: []
                    }
                });
            }
            return Promise.resolve({ data: {} });
        });
    });

    it('should render summary cards with data', async () => {
        renderWithProviders(<Budget />);

        // Use a more flexible matcher that handles nested elements
        const accountValue = await screen.findByText((content, element) => {
            return element?.tagName.toLowerCase() === 'h3' && content.replace(/\s/g, '').includes('5000,50');
        });
        expect(accountValue).toBeInTheDocument();

        const expenseValue = screen.getByText((content, element) => {
            return element?.tagName.toLowerCase() === 'h3' && content.replace(/\s/g, '').includes('1200,75');
        });
        expect(expenseValue).toBeInTheDocument();
    });

});
