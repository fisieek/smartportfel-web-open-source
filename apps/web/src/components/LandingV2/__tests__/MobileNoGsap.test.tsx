import { describe, it, expect, vi, beforeEach } from 'vitest';

// Strażnik kontraktu: na telefonie GSAP nie jest pobierany W OGÓLE.
//
// Powód jest mierzalny: biblioteka to 47 KB pobierania i 113 KB do sparsowania,
// a płaci za to najsłabszy sprzęt, jaki wchodzi na stronę. Efekty scrollowe są
// dekoracją — nic z widocznej treści landingu od nich nie zależy.
//
// Test pilnuje samej BRAMKI, nie skutków ubocznych: `getGsap()` ma zwrócić `null`
// bez dotykania dynamicznego importu. Reszta łańcucha (makiety pokazują stan
// docelowy, `useSectionReveal` nie zakłada `.lp-anim`) jest pokryta w
// ShowcaseFallback.test.tsx — tam scenariusz „biblioteki nie ma" jest ten sam.

const setViewport = (waski: boolean, reducedMotion = false) => {
    (window.matchMedia as unknown) = vi.fn().mockImplementation((q: string) => ({
        matches: q.includes('max-width: 640px')
            ? waski
            : q.includes('prefers-reduced-motion')
                ? reducedMotion
                : false,
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
};

describe('Telefon — GSAP nie jest pobierany', () => {
    beforeEach(() => {
        // Świeży moduł na każdy przypadek: getGsap trzyma `cached`/`loading`
        // na poziomie modułu, więc bez tego drugi test widziałby stan pierwszego.
        vi.resetModules();
    });

    it('na wąskim ekranie getGsap() zwraca null', async () => {
        setViewport(true);
        const { getGsap, animationsDisabled } = await import('../useLandingGsap');

        expect(animationsDisabled()).toBe(true);
        await expect(getGsap()).resolves.toBeNull();
    });

    it('reduced-motion wyłącza animacje niezależnie od szerokości', async () => {
        setViewport(false, true);
        const { getGsap, animationsDisabled } = await import('../useLandingGsap');

        expect(animationsDisabled()).toBe(true);
        await expect(getGsap()).resolves.toBeNull();
    });

    it('na szerokim ekranie bramka jest otwarta', async () => {
        setViewport(false);
        const { animationsDisabled } = await import('../useLandingGsap');

        // Samego getGsap() celowo NIE wołamy — ściągnąłby prawdziwą bibliotekę.
        // Bramka jest tym, co ten plik ma pilnować.
        expect(animationsDisabled()).toBe(false);
    });
});
