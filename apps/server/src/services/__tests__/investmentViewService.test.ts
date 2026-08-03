import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getRetirementContributionStatus, createInvestmentBusinessLogic } from '../investmentViewService';
import prisma from '../../lib/prisma';
import { CurrencyService } from '../currencyService';
import { validateInvestmentAccountOwnership } from '../../utils/ownershipValidator';

const txMock = {
    investmentAccount: { findUnique: vi.fn(), update: vi.fn() },
    investment: { create: vi.fn() },
};

vi.mock('../../lib/prisma', () => ({
    default: {
        investmentAccount: { findMany: vi.fn(), findUnique: vi.fn() },
        investmentHistory: { create: vi.fn() },
        expense: { findMany: vi.fn() },
        $transaction: vi.fn((cb: any) => cb(txMock)),
    },
}));
// Izolacja modułów importowanych pośrednio przez investmentViewService
vi.mock('../currencyService', () => ({ CurrencyService: { convert: vi.fn() } }));
vi.mock('../../utils/ownershipValidator', () => ({ validateInvestmentAccountOwnership: vi.fn() }));

describe('getRetirementContributionStatus', () => {
    beforeEach(() => vi.clearAllMocks());

    it('brak kont IKE/IKZE → pusta lista', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([]);
        expect(await getRetirementContributionStatus('u1', 2026)).toEqual([]);
    });

    it('IKE: zostało = limit − wpłaty (limit 2026 = 28260)', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a1', name: 'IKE mBank', accountType: 'IKE', ikzeBusiness: false, currency: 'PLN' },
        ]);
        (prisma.expense.findMany as any).mockResolvedValue([
            { amount: 10000, plnAmount: 10000 },
            { amount: 5000, plnAmount: 5000 },
        ]);
        const [r] = await getRetirementContributionStatus('u1', 2026);
        expect(r).toMatchObject({
            accountName: 'IKE mBank', type: 'IKE',
            contributed: 15000, limit: 28260, remaining: 13260, year: 2026,
        });
    });

    it('IKZE działalność: wyższy limit (16956 w 2026); nadpłata → remaining=0', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a2', name: 'IKZE', accountType: 'IKZE', ikzeBusiness: true, currency: 'PLN' },
        ]);
        (prisma.expense.findMany as any).mockResolvedValue([{ amount: 20000, plnAmount: 20000 }]);
        const [r] = await getRetirementContributionStatus('u1', 2026);
        expect(r.limit).toBe(16956);
        expect(r.contributed).toBe(20000);
        expect(r.remaining).toBe(0);
    });

    it('plnAmount null → liczy z amount', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a3', name: 'IKE', accountType: 'IKE', ikzeBusiness: false, currency: 'PLN' },
        ]);
        (prisma.expense.findMany as any).mockResolvedValue([{ amount: 1000, plnAmount: null }]);
        const [r] = await getRetirementContributionStatus('u1', 2026);
        expect(r.contributed).toBe(1000);
    });
});

describe('createInvestmentBusinessLogic (B6 — konwersja waluty przy księgowaniu gotówki)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (validateInvestmentAccountOwnership as any).mockResolvedValue(true);
        // konto docelowe PLN z saldem 3000
        (prisma.investmentAccount.findUnique as any).mockResolvedValue({ id: 'acc', name: 'XTB', provider: 'XTB', balance: 3000, currency: 'PLN' });
        txMock.investmentAccount.findUnique.mockResolvedValue({ id: 'acc', name: 'XTB', provider: 'XTB', balance: 3000, currency: 'PLN' });
        txMock.investmentAccount.update.mockResolvedValue({});
        txMock.investment.create.mockResolvedValue({
            id: 'inv1', quantity: 10, purchasePrice: 50, currentValue: 50, purchaseDate: new Date('2025-01-02'),
        });
        // kurs USD->PLN = 4 (from===to → bez konwersji)
        (CurrencyService.convert as any).mockImplementation(async (amount: number, from: string, to: string) => from === to ? amount : Number(amount) * 4);
    });

    const input = (over: any = {}) => ({
        name: 'Starbucks', purchasePrice: 50, quantity: 10, accountId: 'acc',
        currency: 'USD', purchaseDate: '2025-01-02', ...over,
    });

    it('kupno 10×50 USD z konta PLN → saldo zdejmuje ~2000 PLN (kurs 4), nie 500', async () => {
        await createInvestmentBusinessLogic('u1', input());

        expect(CurrencyService.convert).toHaveBeenCalledWith(500, 'USD', 'PLN', expect.any(Date));
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'acc' },
            data: { balance: { decrement: 2000 } },
        }));
    });

    it('walidacja debetu liczona w walucie konta — brak pokrycia po konwersji → rzut', async () => {
        // saldo tylko 1000 PLN, koszt po konwersji 2000 PLN
        (prisma.investmentAccount.findUnique as any).mockResolvedValue({ id: 'acc', name: 'XTB', provider: 'mBank', balance: 1000, currency: 'PLN' });
        txMock.investmentAccount.findUnique.mockResolvedValue({ id: 'acc', name: 'XTB', provider: 'mBank', balance: 1000, currency: 'PLN' });

        await expect(createInvestmentBusinessLogic('u1', input())).rejects.toThrow(/brakuje środków/i);
        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });

    it('brak kursu NBP → rzut (nie księguje 1:1)', async () => {
        (CurrencyService.convert as any).mockRejectedValue(new Error('Nie można pobrać kursu waluty USD.'));
        await expect(createInvestmentBusinessLogic('u1', input())).rejects.toThrow(/kursu waluty/i);
        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });

    it('wpis historyczny → brak ruchu salda i brak konwersji', async () => {
        await createInvestmentBusinessLogic('u1', input({ isHistorical: true }));
        expect(CurrencyService.convert).not.toHaveBeenCalled();
        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });

    it('instrument w walucie konta (PLN) → brak konwersji, decrement natywny', async () => {
        await createInvestmentBusinessLogic('u1', input({ currency: 'PLN' }));
        expect(CurrencyService.convert).not.toHaveBeenCalled();
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { balance: { decrement: 500 } },
        }));
    });
});
