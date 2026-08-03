import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import * as controller from '../investmentController';
import prisma from '../../lib/prisma';
import { validateInvestmentOwnership } from '../../utils/ownershipValidator';
import { investmentAmountToAccountCurrency } from '../../services/investmentViewService';

const txMock = {
    investmentAccount: { update: vi.fn() },
    investment: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    investmentHistory: { deleteMany: vi.fn() },
};

vi.mock('../../lib/prisma', () => ({
    default: {
        investment: { findUnique: vi.fn(), findMany: vi.fn() },
        investmentAccount: { findUnique: vi.fn() },
        $transaction: vi.fn((cb: any) => cb(txMock)),
    },
}));

vi.mock('../../utils/ownershipValidator', () => ({
    validateInvestmentOwnership: vi.fn(),
}));

vi.mock('../../services/currencyService', () => ({
    CurrencyService: {
        getExchangeRate: vi.fn().mockResolvedValue(1),
        rateToPlnWithMeta: vi.fn().mockResolvedValue({ rate: 1, stale: false, rateDate: '2026-07-09' }),
    },
}));

// Pozostałe importy modułu (niewykorzystane w tych testach) — zaślepki, by import się rozwiązał.
vi.mock('../../services/marketData', () => ({ getQuote: vi.fn(), hasLiveQuotes: vi.fn(() => false) }));
vi.mock('../../services/marketData/nbpGoldClient', () => ({ getGoldPrice: vi.fn() }));
vi.mock('../../services/priceRefreshService', () => ({ refreshPrices: vi.fn() }));
// Domyślnie helper konwersji zachowuje się jak kurs 1:1 (identity) — istniejące testy zakładają
// waluty konta = instrumentu. Testy konwersji nadpisują implementację per-case.
vi.mock('../../services/investmentViewService', () => ({
    getPositionsLogic: vi.fn(),
    createInvestmentBusinessLogic: vi.fn(),
    investmentAmountToAccountCurrency: vi.fn(async (n: number) => n),
}));

let jsonMock: any;
let statusMock: any;
let res: Response;

const makeRes = () => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    return { json: jsonMock, status: statusMock } as any;
};

beforeEach(() => {
    vi.clearAllMocks();
    res = makeRes();
    (validateInvestmentOwnership as any).mockResolvedValue(true);
    (prisma.investmentAccount.findUnique as any).mockResolvedValue({ currency: 'PLN' });
    (investmentAmountToAccountCurrency as any).mockImplementation(async (n: number) => n);
    txMock.investment.update.mockResolvedValue({ id: 'inv1' });
    txMock.investment.create.mockResolvedValue({ id: 'inv1-sold' });
    txMock.investmentAccount.update.mockResolvedValue({});
    // Wewnętrzny re-read w transakcji odzwierciedla ten sam findUnique co odczyt zewnętrzny
    txMock.investment.findUnique = (prisma.investment.findUnique as any);
    txMock.investment.delete.mockResolvedValue({});
    txMock.investmentHistory.deleteMany.mockResolvedValue({});
});

const lot = (over: any = {}) => ({
    id: 'inv1', userId: 'u1', name: 'Starbucks', type: 'STOCK', country: 'US',
    currency: 'USD', accountId: 'acc1', instrumentId: null, bondDuration: null,
    bondInterestRate: null, isHistorical: false, soldAt: null,
    quantity: 10, purchasePrice: 100, purchaseDate: new Date('2024-01-01'),
    ...over,
});

describe('sellInvestment', () => {
    it('sprzedaż całości: ustawia soldAt/salePrice i dolicza przychód na konto', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot());
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150, saleDate: '2025-02-01' } } as any;

        await controller.sellInvestment(req, res);

        expect(txMock.investment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'inv1' },
            data: expect.objectContaining({ salePrice: 150, currentValue: 150, soldAt: expect.any(Date) }),
        }));
        // przychód = 10 * 150 = 1500
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'acc1' },
            data: { balance: { increment: 1500 } },
        }));
        expect(txMock.investment.create).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalled();
    });

    it('sprzedaż częściowa: zmniejsza oryginał i tworzy sprzedany lot', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot());
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { quantity: 4, salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        // oryginał: 10 - 4 = 6
        expect(txMock.investment.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'inv1' }, data: { quantity: 6 },
        }));
        // nowy lot sprzedany: 4 szt., soldAt + salePrice
        expect(txMock.investment.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ quantity: 4, salePrice: 150, soldAt: expect.any(Date) }),
        }));
        // przychód = 4 * 150 = 600
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            data: { balance: { increment: 600 } },
        }));
    });

    it('B6: sprzedaż USD z konta PLN — przychód przewalutowany na walutę konta', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot({ currency: 'USD' }));
        (prisma.investmentAccount.findUnique as any).mockResolvedValue({ currency: 'PLN' });
        // kurs USD->PLN = 4
        (investmentAmountToAccountCurrency as any).mockImplementation(async (n: number, from: string, to: string) => from === to ? n : n * 4);
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150, saleDate: '2025-02-01' } } as any;

        await controller.sellInvestment(req, res);

        // proceeds natywne = 10*150 = 1500 USD → 6000 PLN na saldo konta
        expect(investmentAmountToAccountCurrency).toHaveBeenCalledWith(1500, 'USD', 'PLN', expect.any(Date));
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'acc1' },
            data: { balance: { increment: 6000 } },
        }));
    });

    it('B6: brak kursu NBP przy sprzedaży → 400, bez mutacji salda', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot({ currency: 'USD' }));
        (investmentAmountToAccountCurrency as any).mockRejectedValue(new Error('Nie można pobrać kursu waluty USD.'));
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });

    it('pozycja historyczna: bez ruchu gotówki', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot({ isHistorical: true }));
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });

    it('odrzuca ilość większą niż posiadana (400)', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot());
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { quantity: 99, salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('odrzuca datę sprzedaży z przyszłości (400)', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot());
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150, saleDate: future } } as any;

        await controller.sellInvestment(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('odrzuca sprzedaż już sprzedanej pozycji (400)', async () => {
        (prisma.investment.findUnique as any).mockResolvedValue(lot({ soldAt: new Date('2025-01-01') }));
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('wyścig: re-read w transakcji widzi już sprzedaną pozycję → 409, brak mutacji', async () => {
        // Odczyt PRZED transakcją: jeszcze nie sprzedana (przechodzi guard wejściowy → wchodzimy w tx)
        (prisma.investment.findUnique as any).mockResolvedValue(lot({ soldAt: null }));
        // Re-read W transakcji: równoległa sprzedaż wygrała wyścig — pozycja już ma soldAt
        txMock.investment.findUnique = vi.fn().mockResolvedValue(lot({ soldAt: new Date('2025-01-01') }));
        const req = { user: { userId: 'u1' }, params: { id: 'inv1' }, body: { salePrice: 150 } } as any;

        await controller.sellInvestment(req, res);

        expect(statusMock).toHaveBeenCalledWith(409);
        // Sentinel rzucony przed jakąkolwiek mutacją — saldo i rekord nietknięte
        expect(txMock.investment.update).not.toHaveBeenCalled();
        expect(txMock.investment.create).not.toHaveBeenCalled();
        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
    });
});

describe('bulkDeleteInvestments', () => {
    it('atomowo zwraca środki na właściwe konta i usuwa wiele pozycji', async () => {
        const inv1 = lot({ id: 'b1', accountId: 'accA', purchasePrice: 100, quantity: 10 }); // zwrot 1000
        const inv2 = lot({ id: 'b2', accountId: 'accB', purchasePrice: 50, quantity: 4 });   // zwrot 200
        (prisma.investment.findMany as any).mockResolvedValue([inv1, inv2]);
        const req = { user: { userId: 'u1' }, body: { ids: ['b1', 'b2'] } } as any;

        await controller.bulkDeleteInvestments(req, res);

        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'accA' }, data: { balance: { increment: 1000 } },
        }));
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'accB' }, data: { balance: { increment: 200 } },
        }));
        expect(txMock.investmentHistory.deleteMany).toHaveBeenCalledTimes(2);
        expect(txMock.investment.delete).toHaveBeenCalledTimes(2);
        expect(jsonMock.mock.calls[0][0]).toEqual(expect.objectContaining({ deleted: 2 }));
    });

    it('B6: refund USD z konta PLN przewalutowany po kursie z daty zakupu', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            lot({ id: 'b1', accountId: 'accA', currency: 'USD', purchasePrice: 100, quantity: 10 }), // 1000 USD
        ]);
        (prisma.investmentAccount.findUnique as any).mockResolvedValue({ currency: 'PLN' });
        (investmentAmountToAccountCurrency as any).mockImplementation(async (n: number, from: string, to: string) => from === to ? n : n * 4);
        const req = { user: { userId: 'u1' }, body: { ids: ['b1'] } } as any;

        await controller.bulkDeleteInvestments(req, res);

        // koszt natywny 1000 USD → 4000 PLN zwrócone na saldo (lustro kupna, kurs z purchaseDate)
        expect(investmentAmountToAccountCurrency).toHaveBeenCalledWith(1000, 'USD', 'PLN', expect.any(Date));
        expect(txMock.investmentAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'accA' }, data: { balance: { increment: 4000 } },
        }));
    });

    it('pozycja historyczna w paczce: usuwana bez zwrotu gotówki', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            lot({ id: 'b1', accountId: 'accA', purchasePrice: 100, quantity: 10, isHistorical: true }),
        ]);
        const req = { user: { userId: 'u1' }, body: { ids: ['b1'] } } as any;

        await controller.bulkDeleteInvestments(req, res);

        expect(txMock.investmentAccount.update).not.toHaveBeenCalled();
        expect(txMock.investment.delete).toHaveBeenCalledTimes(1);
    });

    it('odrzuca gdy część id nie należy do użytkownika (403), bez transakcji', async () => {
        // 2 żądane id, ale tylko 1 należy do userId → niespójność wykryta przed transakcją
        (prisma.investment.findMany as any).mockResolvedValue([lot({ id: 'b1' })]);
        const req = { user: { userId: 'u1' }, body: { ids: ['b1', 'b2'] } } as any;

        await controller.bulkDeleteInvestments(req, res);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(txMock.investment.delete).not.toHaveBeenCalled();
    });

    it('odrzuca pustą listę id (400)', async () => {
        const req = { user: { userId: 'u1' }, body: { ids: [] } } as any;

        await controller.bulkDeleteInvestments(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(prisma.investment.findMany).not.toHaveBeenCalled();
    });
});

describe('getSoldInvestments', () => {
    it('liczy zrealizowany zysk dodatni i ujemny (PLN, kurs 1)', async () => {
        (prisma.investment.findMany as any).mockResolvedValue([
            { id: 's1', name: 'Zysk', type: 'STOCK', currency: 'PLN', quantity: 10, purchasePrice: 100, salePrice: 150, purchaseDate: new Date('2024-01-01'), soldAt: new Date('2025-01-01'), account: { name: 'XTB' }, instrument: null },
            { id: 's2', name: 'Strata', type: 'STOCK', currency: 'PLN', quantity: 5, purchasePrice: 200, salePrice: 150, purchaseDate: new Date('2024-01-01'), soldAt: new Date('2025-01-01'), account: { name: 'XTB' }, instrument: null },
        ]);
        const req = { user: { userId: 'u1' } } as any;

        await controller.getSoldInvestments(req, res);

        const payload = jsonMock.mock.calls[0][0];
        // s1: (150-100)*10 = +500 ; s2: (150-200)*5 = -250 ; suma = +250
        expect(payload.positions[0].realizedPLN).toBe(500);
        expect(payload.positions[1].realizedPLN).toBe(-250);
        expect(payload.totalRealizedPLN).toBe(250);
    });
});
