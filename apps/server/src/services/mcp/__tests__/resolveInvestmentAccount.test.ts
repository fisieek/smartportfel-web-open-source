import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resolveInvestmentAccount } from '../resolveInvestmentAccount';
import prisma from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
    default: { investmentAccount: { findMany: vi.fn() } },
}));

describe('resolveInvestmentAccount', () => {
    beforeEach(() => vi.clearAllMocks());

    it('brak kont → null', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([]);
        expect(await resolveInvestmentAccount('u1')).toBeNull();
    });

    it('dopasowanie po nazwie (case-insensitive)', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a1', name: 'XTB', provider: 'XTB', balance: 1000, currency: 'PLN', accountType: 'STANDARD' },
            { id: 'a2', name: 'IKE mBank', provider: 'mBank', balance: 500, currency: 'PLN', accountType: 'IKE' },
        ]);
        const r = await resolveInvestmentAccount('u1', 'ike mbank');
        expect(r).toMatchObject({ id: 'a2', name: 'IKE mBank', accountType: 'IKE' });
    });

    it('brak dopasowania nazwy → pierwsze (najstarsze) konto', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a1', name: 'XTB', provider: 'XTB', balance: 1000, currency: 'PLN', accountType: 'STANDARD' },
            { id: 'a2', name: 'IKE', provider: 'mBank', balance: 500, currency: 'PLN', accountType: 'IKE' },
        ]);
        const r = await resolveInvestmentAccount('u1', 'Nieistniejące');
        expect(r?.id).toBe('a1');
    });

    it('balance konwertowany na number', async () => {
        (prisma.investmentAccount.findMany as any).mockResolvedValue([
            { id: 'a1', name: 'XTB', provider: 'XTB', balance: '1234.56', currency: 'EUR', accountType: 'STANDARD' },
        ]);
        const r = await resolveInvestmentAccount('u1');
        expect(r).toMatchObject({ balance: 1234.56, currency: 'EUR' });
    });
});
