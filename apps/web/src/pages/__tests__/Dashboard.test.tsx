import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import Dashboard from '../Dashboard';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';

// Smoke render Dashboardu + banner nieaktualnego kursu NBP (I2 staleRate).

const { mockedUseOutletContext } = vi.hoisted(() => ({
    mockedUseOutletContext: vi.fn(() => ({ refreshTrigger: 0 }))
}));

vi.mock('react-router-dom', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return { ...actual, useOutletContext: mockedUseOutletContext, useNavigate: () => vi.fn() };
});

// Widgety z własnymi fetch'ami — stub jak OnboardingWidget w Budget.test
vi.mock('../../components/OnboardingWidget', () => ({
    default: () => <div data-testid="onboarding-mock" />
}));
vi.mock('../../components/MonthlyPlanningWidget', () => ({
    default: () => <div data-testid="planning-mock" />
}));

const baseSummary = {
    totalIncomes: 8000,
    totalExpenses: 3200.5,
    totalPersonalAccounts: 15000,
    totalSavings: 5000,
    totalInvestments: 2000,
    totalNonMonetaryFunds: 0,
    recentTransactions: []
};

function mockSummary(extra: Record<string, unknown> = {}) {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
        if (url.includes('/expenses/summary')) return Promise.resolve({ data: { ...baseSummary, ...extra } });
        return Promise.resolve({ data: {} });
    });
}

describe('Dashboard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedUseOutletContext.mockReturnValue({ refreshTrigger: 0 });
        mockSummary();
    });

    it('renderuje nagłówek i kwoty z /expenses/summary', async () => {
        renderWithProviders(<Dashboard />);

        expect(await screen.findByText('Przegląd')).toBeInTheDocument();
        // Wydatki miesiąca (3200,50) — matcher odporny na formatowanie i walutę
        expect(screen.getByText((c) => c.replace(/\s/g, '').includes('3200,50'))).toBeInTheDocument();
    });

    it('bez staleRate — brak bannera o kursie NBP', async () => {
        renderWithProviders(<Dashboard />);
        await screen.findByText('Przegląd');

        expect(screen.queryByText(/Kurs NBP niedostępny/)).not.toBeInTheDocument();
    });

    it('staleRate=true — pokazuje banner z datą kursu (I2)', async () => {
        mockSummary({ staleRate: true, rateAsOf: '2026-07-10' });
        renderWithProviders(<Dashboard />);

        expect(await screen.findByText(/Kurs NBP niedostępny/)).toBeInTheDocument();
        expect(screen.getByText(/2026-07-10/)).toBeInTheDocument();
    });
});
