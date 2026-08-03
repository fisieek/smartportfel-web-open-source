import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

// Strażnik regresji dla najpoważniejszego objawu wydajnościowego landingu.
//
// Historia: treść hero była gaszona przez CSS (`opacity-0` w markupie + reguła
// w landing.css), a odsłaniał ją dopiero timeline GSAP. Każda sytuacja, w której
// GSAP nie dojechał (wolne łącze, adblock, CSP, karta w tle głodząca rAF),
// zostawiała użytkownika z pustą, ciemną stroną — dokładnie „strona nie działa".
//
// Obecny kontrakt, którego pilnuje ten plik:
//   1. animacja wejścia hero jest w czystym CSS — komponent NIE dotyka GSAP,
//   2. treść jest w DOM i widoczna niezależnie od tego, czy GSAP się kiedykolwiek
//      załaduje (tu: promise, który nigdy się nie rozwiązuje),
//   3. markup nie zawiera `opacity-0` ani klasy-bramki `.lp-anim`,
//   4. stagger jedzie przez `--lp-delay`, a nie przez JS.

const { getGsapMock, peekGsapMock, reducedMotionMock } = vi.hoisted(() => ({
    // Promise, który NIGDY się nie rozwiązuje — symuluje „GSAP nie dojechał".
    getGsapMock: vi.fn(() => new Promise(() => { })),
    peekGsapMock: vi.fn(() => null),
    reducedMotionMock: vi.fn(() => false),
}));

vi.mock('../useLandingGsap', () => ({
    getGsap: getGsapMock,
    peekGsap: peekGsapMock,
    prefersReducedMotion: reducedMotionMock,
    // Jedna bramka na „nie animujemy": reduced-motion ALBO wąski ekran. Hero pyta
    // już tylko o nią, więc `reducedMotionMock` steruje tu obiema sytuacjami naraz.
    animationsDisabled: reducedMotionMock,
    useSectionReveal: () => ({ current: null }),
    trackCardGlow: vi.fn(),
    useIsLoggedIn: () => false,
}));

vi.mock('../HeroShowcase', () => ({
    default: () => <div data-testid="showcase-mock" />,
}));

import Hero from '../Hero';

describe('Hero — treść nie jest zakładnikiem GSAP', () => {
    beforeEach(() => {
        reducedMotionMock.mockReturnValue(false);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renderuje pełną treść nawet gdy GSAP nigdy się nie ładuje', () => {
        const { container } = render(<Hero />);

        expect(container.textContent).toContain('Twoje pieniądze.');
        expect(container.textContent).toContain('pełną kontrolą');
        expect(container.textContent).toContain('Zacznij za darmo');

        // 9 elementów animowanych wejściowo, wszystkie obecne w DOM
        expect(container.querySelectorAll('[data-hero]')).toHaveLength(9);
    });

    it('nie gasi treści: brak `opacity-0` w markupie i brak klasy-bramki `.lp-anim`', () => {
        const { container } = render(<Hero />);

        expect(container.querySelectorAll('[class*="opacity-0"]')).toHaveLength(0);
        expect(container.querySelectorAll('.lp-anim')).toHaveLength(0);

        // Żaden element nie ma też inline'owego opacity: 0 wstawionego przez JS
        const inlineHidden = [...container.querySelectorAll<HTMLElement>('[data-hero]')].filter(
            (el) => el.style.opacity === '0'
        );
        expect(inlineHidden).toHaveLength(0);
    });

    it('stagger jest deklaratywny — każdy element niesie własne --lp-delay', () => {
        const { container } = render(<Hero />);

        const delays = [...container.querySelectorAll<HTMLElement>('[data-hero]')].map((el) =>
            el.style.getPropertyValue('--lp-delay')
        );

        expect(delays).toHaveLength(9);
        expect(delays.every((d) => d !== '')).toBe(true);
        // kolejność z dawnego timeline'u GSAP: badge -> linie -> sub -> CTA -> ekran -> marquee
        expect(delays[0]).toBe('.1s');
        expect(delays[1]).toBe('.25s');
        expect(delays[2]).toBe('.39s');
    });

    it('gdy nie animujemy (reduced-motion albo telefon) nie sięga po GSAP w ogóle', () => {
        reducedMotionMock.mockReturnValue(true);

        const { container } = render(<Hero />);

        expect(getGsapMock).not.toHaveBeenCalled();
        expect(container.textContent).toContain('Twoje pieniądze.');
    });

    it('parallax jest jedynym powodem sięgania po GSAP i nie blokuje renderu', () => {
        render(<Hero />);

        // GSAP jest wołany leniwie (efekt), ale render już się odbył i treść jest gotowa
        expect(getGsapMock).toHaveBeenCalledTimes(1);
    });
});
