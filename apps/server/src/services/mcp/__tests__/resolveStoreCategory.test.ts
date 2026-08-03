import { vi, describe, it, expect, beforeEach } from 'vitest';
import { resolveStoreCategory } from '../resolveStoreCategory';
import prisma from '../../../lib/prisma';

vi.mock('../../../lib/prisma', () => ({
    default: {
        category: { findFirst: vi.fn() },
        store: { findFirst: vi.fn() },
    },
}));

// Izolacja modułów importowanych pośrednio przez expenseMutationService
vi.mock('../../../utils/financialTransaction', () => ({ runFinancialTransaction: async (fn: any) => fn({}) }));
vi.mock('../../expense/balanceService', () => ({ checkBalanceWithTx: vi.fn().mockResolvedValue({ valid: true }) }));

const catByName = (impl: Record<string, any>) =>
    (prisma.category.findFirst as any).mockImplementation(async ({ where }: any) => impl[where.name] ?? null);

describe('resolveStoreCategory', () => {
    beforeEach(() => vi.clearAllMocks());

    it('istniejący sklep po nazwie → jego kategoria', async () => {
        catByName({ Inne: { id: 1, name: 'Inne' } });
        (prisma.store.findFirst as any).mockResolvedValue({ id: 's9', name: 'Biedronka', categoryId: 5, category: { name: 'Sklepy spożywcze' } });

        const r = await resolveStoreCategory('u1', 'biedronka');
        expect(r).toMatchObject({ store: 'Biedronka', storeId: 's9', categoryId: 5, categoryName: 'Sklepy spożywcze' });
    });

    it('brak sklepu, ale wzorzec (orlen) → kategoria Stacje Paliw, bez storeId', async () => {
        catByName({ Inne: { id: 1, name: 'Inne' }, 'Stacje Paliw': { id: 7, name: 'Stacje Paliw' } });
        (prisma.store.findFirst as any).mockResolvedValue(null); // brak istniejącego sklepu

        const r = await resolveStoreCategory('u1', 'Orlen autostrada');
        expect(r).toMatchObject({ store: 'Orlen autostrada', storeId: null, categoryId: 7, categoryName: 'Stacje Paliw' });
    });

    it('brak sklepu i brak wzorca → fallback Inne, nazwa zachowana', async () => {
        catByName({ Inne: { id: 1, name: 'Inne' } });
        (prisma.store.findFirst as any).mockResolvedValue(null);

        const r = await resolveStoreCategory('u1', 'Zzz Qwerty 123');
        expect(r).toMatchObject({ store: 'Zzz Qwerty 123', storeId: null, categoryId: 1, categoryName: 'Inne' });
    });

    it('brak nazwy → fallback Inne (store="Inne")', async () => {
        catByName({ Inne: { id: 1, name: 'Inne' } });
        const r = await resolveStoreCategory('u1', undefined);
        expect(r).toMatchObject({ store: 'Inne', storeId: null, categoryId: 1, categoryName: 'Inne' });
    });
});
