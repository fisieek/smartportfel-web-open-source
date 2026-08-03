import { describe, it, expect } from 'vitest';
import { parseClosedAt } from './closedAt';

describe('parseClosedAt', () => {
    it('domyślnie zwraca bieżącą datę, gdy brak wejścia', () => {
        const before = Date.now();
        const result = parseClosedAt(undefined);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.date.getTime()).toBeGreaterThanOrEqual(before);
            expect(result.date.getTime()).toBeLessThanOrEqual(Date.now());
        }
    });

    it('traktuje pusty string jak brak wejścia (teraz)', () => {
        const result = parseClosedAt('');
        expect(result.ok).toBe(true);
    });

    it('akceptuje poprawną datę z przeszłości (format YYYY-MM-DD)', () => {
        const result = parseClosedAt('2025-01-15');
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.date.toISOString().slice(0, 10)).toBe('2025-01-15');
        }
    });

    it('odrzuca datę z przyszłości', () => {
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
        const result = parseClosedAt(future);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/przysz/i);
    });

    it('odrzuca niepoprawną datę', () => {
        const result = parseClosedAt('to-nie-data');
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/Nieprawidłowa/i);
    });
});
