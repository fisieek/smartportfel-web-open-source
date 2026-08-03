import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest';
import { reconcilePPKBonuses } from '../ppkBonusService';
import prisma from '../../lib/prisma';

// $transaction odpala callback z klientem transakcyjnym — podajemy mock tx.
vi.mock('../../lib/prisma', () => {
    const tx = {
        pPKTransaction: {
            findMany: vi.fn(),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({})
        }
    };
    return {
        default: {
            pPKConfig: { findUnique: vi.fn() },
            $transaction: vi.fn(async (fn: any) => fn(tx)),
            __tx: tx
        }
    };
});

const userId = 'user-1';
const tx = () => (prisma as any).__tx;

// Fixtury transakcji PPK
let seq = 0;
const trans = (type: string, date: Date, opts: { amount?: number; note?: string | null } = {}) => ({
    id: `t-${seq++}`,
    userId,
    date,
    type,
    amount: opts.amount ?? 0,
    note: opts.note ?? null
});
const d = (y: number, m: number, day = 1) => new Date(y, m - 1, day);

const setTransactions = (rows: any[]) => {
    tx().pPKTransaction.findMany.mockResolvedValue(rows);
};

const createdOfType = (type: string) =>
    tx().pPKTransaction.create.mock.calls.map((c: any[]) => c[0].data).filter((data: any) => data.type === type);

describe('reconcilePPKBonuses (I1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        seq = 0;
        vi.setSystemTime(new Date(2026, 6, 9)); // 2026-07-09 — deterministyczny „rok bieżący"
        (prisma as any).pPKConfig.findUnique.mockResolvedValue({ userId, startDate: d(2026, 5) });
        tx().pPKTransaction.deleteMany.mockResolvedValue({ count: 0 });
        tx().pPKTransaction.create.mockResolvedValue({});
    });
    afterAll(() => vi.useRealTimers());

    it('brak configu → nic nie robi', async () => {
        (prisma as any).pPKConfig.findUnique.mockResolvedValue(null);
        await reconcilePPKBonuses(userId);
        expect((prisma as any).$transaction).not.toHaveBeenCalled();
    });

    it('premia powitalna naliczona przy 3. wpłacie EMPLOYEE (nawet gdy config założono w 1. miesiącu)', async () => {
        setTransactions([
            trans('EMPLOYEE', d(2026, 5), { amount: 100 }),
            trans('EMPLOYEE', d(2026, 6), { amount: 100 }),
            trans('EMPLOYEE', d(2026, 7), { amount: 100 })
        ]);
        await reconcilePPKBonuses(userId);
        const welcome = createdOfType('STATE_WELCOME');
        expect(welcome).toHaveLength(1);
        expect(welcome[0].amount).toBe(250);
        expect(welcome[0].note).toBe('welcome');
        // datowana na miesiąc 3. wpłaty (lipiec 2026)
        expect(welcome[0].date).toEqual(d(2026, 7));
    });

    it('premia NIE naliczona przy <3 wpłatach EMPLOYEE', async () => {
        setTransactions([
            trans('EMPLOYEE', d(2026, 5), { amount: 100 }),
            trans('EMPLOYEE', d(2026, 6), { amount: 100 })
        ]);
        await reconcilePPKBonuses(userId);
        expect(createdOfType('STATE_WELCOME')).toHaveLength(0);
    });

    it('premia niedublowana gdy STATE_WELCOME już istnieje (idempotencja)', async () => {
        setTransactions([
            trans('EMPLOYEE', d(2026, 5), { amount: 100 }),
            trans('EMPLOYEE', d(2026, 6), { amount: 100 }),
            trans('EMPLOYEE', d(2026, 7), { amount: 100 }),
            trans('STATE_WELCOME', d(2026, 7), { amount: 250, note: 'welcome' })
        ]);
        await reconcilePPKBonuses(userId);
        expect(createdOfType('STATE_WELCOME')).toHaveLength(0);
    });

    it('dopłata roczna za zakończony rok spełniający próg, datowana 15.04 roku następnego', async () => {
        // 2023: EMPLOYEE+EMPLOYER = 500+300 = 800 ≥ próg 756
        setTransactions([
            trans('EMPLOYEE', d(2023, 6), { amount: 500 }),
            trans('EMPLOYER', d(2023, 6), { amount: 300 })
        ]);
        await reconcilePPKBonuses(userId);
        const annual = createdOfType('STATE_ANNUAL');
        expect(annual).toHaveLength(1);
        expect(annual[0].amount).toBe(240);
        expect(annual[0].note).toBe('annual:2023');
        expect(annual[0].date).toEqual(new Date(2024, 3, 15));
    });

    it('dopłata NIE za rok bieżący (niezakończony)', async () => {
        setTransactions([
            trans('EMPLOYEE', d(2026, 1), { amount: 5000 }),
            trans('EMPLOYER', d(2026, 1), { amount: 5000 })
        ]);
        await reconcilePPKBonuses(userId);
        expect(createdOfType('STATE_ANNUAL')).toHaveLength(0);
    });

    it('dopłata NIE za rok poniżej progu', async () => {
        // 2023: 400+300 = 700 < próg 756
        setTransactions([
            trans('EMPLOYEE', d(2023, 6), { amount: 400 }),
            trans('EMPLOYER', d(2023, 6), { amount: 300 })
        ]);
        await reconcilePPKBonuses(userId);
        expect(createdOfType('STATE_ANNUAL')).toHaveLength(0);
    });

    it('legacy STATE_ANNUAL bez note usunięty i zastąpiony kanonicznym (samo-korekta, brak dublowania)', async () => {
        const legacy = trans('STATE_ANNUAL', d(2023, 6), { amount: 240, note: null });
        setTransactions([
            trans('EMPLOYEE', d(2023, 6), { amount: 500 }),
            trans('EMPLOYER', d(2023, 6), { amount: 300 }),
            legacy
        ]);
        await reconcilePPKBonuses(userId);
        // legacy usunięty
        expect(tx().pPKTransaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [legacy.id] } } });
        // wstawiony kanoniczny — dokładnie jeden
        const annual = createdOfType('STATE_ANNUAL');
        expect(annual).toHaveLength(1);
        expect(annual[0].note).toBe('annual:2023');
    });

    it('idempotencja dopłaty rocznej: istniejący annual:2023 → brak nowego wpisu', async () => {
        setTransactions([
            trans('EMPLOYEE', d(2023, 6), { amount: 500 }),
            trans('EMPLOYER', d(2023, 6), { amount: 300 }),
            trans('STATE_ANNUAL', new Date(2024, 3, 15), { amount: 240, note: 'annual:2023' })
        ]);
        await reconcilePPKBonuses(userId);
        expect(createdOfType('STATE_ANNUAL')).toHaveLength(0);
        expect(tx().pPKTransaction.deleteMany).not.toHaveBeenCalled();
    });
});
