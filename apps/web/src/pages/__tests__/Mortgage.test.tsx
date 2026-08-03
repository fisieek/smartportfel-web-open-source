import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import MortgagePage from '../Mortgage';
import { renderWithProviders } from '../../test/utils';
import api from '../../lib/api';

// Test walidacji handleAddPayment — jedyny frontendowy strażnik reguł serwera B7
// (kwoty dodatnie, część kapitałowa ≤ rata, data nie z przyszłości, komunikat o clamp).

const mortgage = {
    id: 'm1',
    name: 'Kredyt PKO',
    totalAmount: 500000,
    currentBalance: 400000,
    startDate: '2020-01-01T00:00:00.000Z',
    loanType: 'MORTGAGE',
    installmentType: null,
    termMonths: null,
    marginRate: null,
    referenceRate: null,
    personalAccountId: 'pa1',
    payments: [],
    totalPaid: 0,
    totalInterest: 0,
    percentPaid: 20
};

const personalAccount = { id: 'pa1', name: 'Konto główne', bank: 'PKO', balance: 10000, isMain: true };

function mockGet() {
    vi.spyOn(api, 'get').mockImplementation((url: string) => {
        if (url === '/mortgages') return Promise.resolve({ data: [mortgage] });
        if (url === '/personal-accounts') return Promise.resolve({ data: [personalAccount] });
        return Promise.resolve({ data: [] });
    });
}

/** Otwiera modal „Dodaj ratę" z karty kredytu i zwraca funkcję submitu. */
async function openPaymentModal() {
    // Przyciski na karcie otwierają modal (mobile+desktop duplikat) → pierwszy
    const openButtons = await screen.findAllByRole('button', { name: /dodaj ratę/i });
    fireEvent.click(openButtons[0]);
    // Po otwarciu modal ma własny submit „Dodaj ratę" (ostatni w DOM/portalu)
    await screen.findByPlaceholderText('np. 2 133,00');
}

function fillAmounts(total: string, principal: string) {
    fireEvent.change(screen.getByPlaceholderText('np. 2 133,00'), { target: { value: total } });
    fireEvent.change(screen.getByPlaceholderText('np. 1 500,00'), { target: { value: principal } });
}

function submitPayment() {
    const submitButtons = screen.getAllByRole('button', { name: /dodaj ratę/i });
    fireEvent.click(submitButtons[submitButtons.length - 1]);
}

describe('Mortgage — handleAddPayment (walidacja B7)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet();
        vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    });

    it('poprawna rata → POST /mortgages/:id/payments z kwotami i datą', async () => {
        renderWithProviders(<MortgagePage />);
        await openPaymentModal();

        fillAmounts('2000', '1500');
        submitPayment();

        await waitFor(() => {
            expect(api.post).toHaveBeenCalledWith('/mortgages/m1/payments', expect.objectContaining({
                totalAmount: 2000,
                principalAmount: 1500
            }));
        });
    });

    it('część kapitałowa > rata → toast, brak POST', async () => {
        renderWithProviders(<MortgagePage />);
        await openPaymentModal();

        fillAmounts('1000', '2000');
        submitPayment();

        expect(await screen.findByText('Część kapitałowa nie może przekraczać kwoty raty')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('kwoty niedodatnie → toast, brak POST', async () => {
        renderWithProviders(<MortgagePage />);
        await openPaymentModal();

        fillAmounts('0', '0');
        submitPayment();

        expect(await screen.findByText('Kwoty muszą być dodatnie')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('data z przyszłości → toast, brak POST', async () => {
        renderWithProviders(<MortgagePage />);
        await openPaymentModal();

        fillAmounts('2000', '1500');
        const future = new Date();
        future.setFullYear(future.getFullYear() + 1);
        // Modal renderuje się w portalu (document.body), nie w container renderu
        const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
        fireEvent.change(dateInput, { target: { value: future.toISOString().split('T')[0] } });
        submitPayment();

        expect(await screen.findByText('Data płatności nie może być z przyszłości')).toBeInTheDocument();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('odpowiedź clamped → komunikat o przycięciu kapitału', async () => {
        vi.spyOn(api, 'post').mockResolvedValue({ data: { clamped: true } });
        renderWithProviders(<MortgagePage />);
        await openPaymentModal();

        fillAmounts('500000', '450000');
        submitPayment();

        expect(await screen.findByText(/Kapitał przycięto do pozostałego salda/)).toBeInTheDocument();
    });
});
