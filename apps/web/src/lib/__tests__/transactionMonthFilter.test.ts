import { describe, it, expect, vi, afterEach } from 'vitest';
import { ANY_TIME, currentMonthFilter, firstDayOfFilteredMonth } from '../transactionMonthFilter';

/**
 * Reguła: data początkowa nowej transakcji = 1. dzień odfiltrowanego miesiąca, ale TYLKO gdy
 * to nie miesiąc bieżący. `undefined` oznacza „zostaw dzisiejszą datę".
 */

afterEach(() => {
    vi.useRealTimers();
});

function freezeAt(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
}

describe('firstDayOfFilteredMonth', () => {
    it('miesiąc bieżący → undefined (zostaje dzisiejsza data)', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth('2026-7')).toBeUndefined();
        expect(firstDayOfFilteredMonth(currentMonthFilter())).toBeUndefined();
    });

    it('miesiąc przeszły → pierwszy dzień tego miesiąca', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth('2026-6')).toBe('2026-06-01');
        expect(firstDayOfFilteredMonth('2025-12')).toBe('2025-12-01');
    });

    it('miesiąc przyszły też dostaje pierwszy dzień (filtr oferuje 3 miesiące w przód)', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth('2026-9')).toBe('2026-09-01');
    });

    it('miesiąc uzupełniany zerem — filtr trzyma "2026-6", nie "2026-06"', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth('2026-1')).toBe('2026-01-01');
    });

    it('„dowolny czas" i wartości bez sensu → undefined', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth(ANY_TIME)).toBeUndefined();
        expect(firstDayOfFilteredMonth('')).toBeUndefined();
        expect(firstDayOfFilteredMonth('2026-13')).toBeUndefined();
        expect(firstDayOfFilteredMonth('2026-0')).toBeUndefined();
        expect(firstDayOfFilteredMonth('bzdura')).toBeUndefined();
    });

    it('ten sam numer miesiąca w innym roku to NIE miesiąc bieżący', () => {
        freezeAt('2026-07-30T10:00:00Z');
        expect(firstDayOfFilteredMonth('2025-7')).toBe('2025-07-01');
    });

    it('działa na przełomie roku', () => {
        freezeAt('2027-01-05T10:00:00Z');
        expect(firstDayOfFilteredMonth('2027-1')).toBeUndefined();
        expect(firstDayOfFilteredMonth('2026-12')).toBe('2026-12-01');
    });
});
