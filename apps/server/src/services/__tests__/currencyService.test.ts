import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CurrencyService } from '../currencyService';
import prisma from '../../lib/prisma';
import { captureServerError } from '../../lib/reportError';

vi.mock('../../lib/prisma', () => ({
    default: {
        exchangeRate: { findFirst: vi.fn(), upsert: vi.fn() },
    },
}));
vi.mock('../../lib/reportError', () => ({ captureServerError: vi.fn() }));

const okRate = (mid: number) => ({ ok: true, json: async () => ({ rates: [{ mid }] }) });
const notOk = () => ({ ok: false, json: async () => ({}) });

const DATE = new Date('2026-07-09T12:00:00.000Z');

describe('CurrencyService.getExchangeRateWithMeta', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.exchangeRate.findFirst as any).mockResolvedValue(null);
        (prisma.exchangeRate.upsert as any).mockResolvedValue({});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('PLN → kurs 1, bez sieci', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const meta = await CurrencyService.getExchangeRateWithMeta('PLN', DATE);
        expect(meta).toEqual({ rate: 1, stale: false, rateDate: '2026-07-09' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('NBP zwraca kurs z daty → świeży + zapis do cache', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okRate(4.5));
        vi.stubGlobal('fetch', fetchMock);
        const meta = await CurrencyService.getExchangeRateWithMeta('USD', DATE);
        expect(meta).toEqual({ rate: 4.5, stale: false, rateDate: '2026-07-09' });
        expect(prisma.exchangeRate.upsert).toHaveBeenCalledTimes(1);
    });

    it('brak kursu na dzień (weekend) → fallback last/1 z NBP, wciąż świeży', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(notOk()) // kurs z daty niedostępny
            .mockResolvedValueOnce(okRate(4.2)); // last/1
        vi.stubGlobal('fetch', fetchMock);
        const meta = await CurrencyService.getExchangeRateWithMeta('EUR', DATE);
        expect(meta.rate).toBe(4.2);
        expect(meta.stale).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(prisma.exchangeRate.upsert).toHaveBeenCalledTimes(1);
    });

    it('NBP niedostępne + wpis w cache → kurs z cache oznaczony stale + zapis błędu', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
        (prisma.exchangeRate.findFirst as any).mockResolvedValueOnce({
            rate: '3.90',
            date: new Date('2026-07-08T00:00:00.000Z'),
        });
        const meta = await CurrencyService.getExchangeRateWithMeta('NOK', DATE);
        expect(meta).toEqual({ rate: 3.9, stale: true, rateDate: '2026-07-08' });
        expect(prisma.exchangeRate.upsert).not.toHaveBeenCalled();
        expect(captureServerError).toHaveBeenCalledTimes(1);
    });

    it('NBP niedostępne + pusty cache → 1:1 ale JAWNIE stale (rateDate null)', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
        (prisma.exchangeRate.findFirst as any).mockResolvedValue(null);
        const meta = await CurrencyService.getExchangeRateWithMeta('CHF', DATE);
        expect(meta).toEqual({ rate: 1, stale: true, rateDate: null });
    });
});

describe('CurrencyService.getExchangeRate (twarda ścieżka)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.exchangeRate.findFirst as any).mockResolvedValue(null);
        (prisma.exchangeRate.upsert as any).mockResolvedValue({});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('rzuca gdy brak kursu nigdzie (NBP down + pusty cache) — nigdy 1:1 po cichu', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
        await expect(CurrencyService.getExchangeRate('GBP', DATE)).rejects.toThrow(/niedostępny/);
    });

    it('zwraca kurs z cache (stale) zamiast rzucać, gdy cache ma wpis', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
        (prisma.exchangeRate.findFirst as any).mockResolvedValueOnce({
            rate: '4.10',
            date: new Date('2026-07-07T00:00:00.000Z'),
        });
        await expect(CurrencyService.getExchangeRate('SEK', DATE)).resolves.toBe(4.1);
    });
});

describe('CurrencyService.convertSafe', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (prisma.exchangeRate.findFirst as any).mockResolvedValue(null);
        (prisma.exchangeRate.upsert as any).mockResolvedValue({});
    });
    afterEach(() => vi.unstubAllGlobals());

    it('używa kursu z cache (nie 1:1) przy awarii NBP', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
        (prisma.exchangeRate.findFirst as any).mockResolvedValue({
            rate: '4.00',
            date: new Date('2026-07-08T00:00:00.000Z'),
        });
        const out = await CurrencyService.convertSafe(100, 'USD', 'PLN', DATE);
        expect(Number(out)).toBe(400); // 100 USD * 4.00 = 400 PLN, NIE 100 (1:1)
    });
});
