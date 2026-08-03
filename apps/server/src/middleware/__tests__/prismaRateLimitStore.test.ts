import { vi, describe, it, expect, beforeEach } from 'vitest';
import prisma from '../../lib/prisma';
import { captureServerError } from '../../lib/reportError';
import { PrismaRateLimitStore } from '../prismaRateLimitStore';

vi.mock('../../lib/prisma', () => ({
    default: {
        $queryRaw: vi.fn(),
        rateLimitEntry: {
            updateMany: vi.fn(),
            deleteMany: vi.fn(),
        },
    },
}));

vi.mock('../../lib/reportError', () => ({
    captureServerError: vi.fn(),
}));

describe('PrismaRateLimitStore', () => {
    let store: PrismaRateLimitStore;

    beforeEach(() => {
        vi.clearAllMocks();
        store = new PrismaRateLimitStore('auth');
        store.init({ windowMs: 15 * 60 * 1000 } as any);
    });

    it('zwraca hits i resetAt z atomowego upsertu', async () => {
        const resetAt = new Date(Date.now() + 60_000);
        (prisma.$queryRaw as any).mockResolvedValue([{ hits: 3, resetAt }]);

        const result = await store.increment('1.2.3.4');

        expect(result).toEqual({ totalHits: 3, resetTime: resetAt });
    });

    it('kluczuje kubełek prefiksem limitera (auth:<ip>)', async () => {
        (prisma.$queryRaw as any).mockResolvedValue([{ hits: 1, resetAt: new Date() }]);

        await store.increment('1.2.3.4');

        // $queryRaw to tagged template — wartości interpolowane lądują w kolejnych argumentach
        const values = (prisma.$queryRaw as any).mock.calls[0].slice(1);
        expect(values).toContain('auth:1.2.3.4');
        expect(values).toContain(900); // windowMs 15 min → 900 s w make_interval
    });

    it('fail-open: błąd bazy przepuszcza żądanie i zapisuje błąd', async () => {
        (prisma.$queryRaw as any).mockRejectedValue(new Error('DB down'));

        const result = await store.increment('1.2.3.4');

        expect(result.totalHits).toBe(1); // poniżej każdego limitu → żądanie przechodzi
        expect(captureServerError).toHaveBeenCalled();
    });

    it('decrement obniża licznik tylko dodatnich kubełków', async () => {
        await store.decrement('1.2.3.4');

        expect(prisma.rateLimitEntry.updateMany).toHaveBeenCalledWith({
            where: { key: 'auth:1.2.3.4', hits: { gt: 0 } },
            data: { hits: { decrement: 1 } },
        });
    });

    it('resetKey usuwa kubełek', async () => {
        await store.resetKey('1.2.3.4');

        expect(prisma.rateLimitEntry.deleteMany).toHaveBeenCalledWith({
            where: { key: 'auth:1.2.3.4' },
        });
    });

    it('decrement/resetKey nie propagują błędów bazy', async () => {
        (prisma.rateLimitEntry.updateMany as any).mockRejectedValue(new Error('DB down'));
        (prisma.rateLimitEntry.deleteMany as any).mockRejectedValue(new Error('DB down'));

        await expect(store.decrement('1.2.3.4')).resolves.toBeUndefined();
        await expect(store.resetKey('1.2.3.4')).resolves.toBeUndefined();
        expect(captureServerError).toHaveBeenCalledTimes(2);
    });
});
