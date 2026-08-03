import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import Toast from '../Toast';

/**
 * Toast sam się zamyka po `duration` — i to jest cała jego umowa z resztą aplikacji.
 *
 * Test pilnuje konkretnej regresji: `handleClose` jest czytane przez efekt ustawiający
 * timer. Gdyby referencja tej funkcji zmieniała się przy każdym renderze, efekt
 * kasowałby i zakładał timer w kółko, a toast potrafiłby nigdy nie zniknąć.
 * Dlatego sprawdzamy też, że przerenderowanie komponentu NIE przesuwa terminu.
 */
describe('Toast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

    it('woła onClose po upływie `duration` (plus animacja wyjścia)', () => {
        const onClose = vi.fn();
        render(<Toast id="t1" message="Zapisano zmiany" onClose={onClose} duration={5000} />);

        expect(screen.getByText('Zapisano zmiany')).toBeInTheDocument();

        advance(4999);
        expect(onClose).not.toHaveBeenCalled();

        advance(1);          // mija `duration` → start animacji wyjścia
        advance(300);        // mija animacja → dopiero teraz odmontowanie
        expect(onClose).toHaveBeenCalledWith('t1');
    });

    it('przerenderowanie nie przesuwa terminu zamknięcia', () => {
        const onClose = vi.fn();
        const { rerender } = render(
            <Toast id="t2" message="Zapisano" onClose={onClose} duration={5000} />
        );

        advance(3000);
        // Rodzic się przerenderował — timer NIE ma zacząć odliczać od nowa.
        rerender(<Toast id="t2" message="Zapisano" onClose={onClose} duration={5000} />);
        advance(2000);
        advance(300);

        expect(onClose).toHaveBeenCalledWith('t2');
    });

    it('respektuje własny `duration`', () => {
        const onClose = vi.fn();
        render(<Toast id="t3" message="Krótki" onClose={onClose} duration={1000} />);

        advance(1000);
        advance(300);
        expect(onClose).toHaveBeenCalledWith('t3');
    });
});
