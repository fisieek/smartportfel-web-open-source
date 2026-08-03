import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

// Strażnik regresji dla makiet showcase'ów — bliźniak HeroReveal.test.tsx, który
// pilnuje tego samego kontraktu dla krytycznej treści hero (i który makiety
// mockuje, więc ich NIE pokrywa).
//
// Historia: elementy makiet mają pre-stan wpisany w markup klasą Tailwinda
// `opacity-0`, a odsłania je dopiero GSAP. Gdy biblioteka nie dojedzie (adblock,
// CSP, błąd sieci) albo gdy przy reduced-motion animacji nie odpalamy w ogóle,
// `getGsap()` zwraca `null` i wcześniej po prostu wychodziliśmy — makieta
// zostawała pusta NA ZAWSZE.
//
// Kontrakt, którego pilnuje ten plik:
//   1. gdy GSAP nie dojedzie, makieta pokazuje się bez animacji — w DOM nie
//      zostaje ani jeden `opacity-0`,
//   2. to samo przy prefers-reduced-motion,
//   3. liczniki lądują na wartościach końcowych, a nie na „0,00 PLN".

const { getGsapMock, peekGsapMock } = vi.hoisted(() => ({
    // `null` = GSAP nie załadował się w ogóle (ścieżka .catch() w getGsap).
    // `any`, bo część testów podstawia tu atrapę biblioteki.
    getGsapMock: vi.fn((): Promise<any> => Promise.resolve(null)),
    peekGsapMock: vi.fn(() => null),
}));

// Świadomie NIE podmieniamy `dropOpacityPreState` — to właśnie ten helper jest
// tu testowany, podstawiamy tylko samo ładowanie biblioteki.
vi.mock('../useLandingGsap', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../useLandingGsap')>();
    return { ...actual, getGsap: getGsapMock, peekGsap: peekGsapMock };
});

import HeroShowcase from '../HeroShowcase';
import { BudgetShowcase, InvestmentsShowcase, MortgageShowcase } from '../ModuleShowcase';
import { REVEAL_FAILSAFE_MS } from '../useLandingGsap';

// Oczekiwana wartość liczona JAWNIE, nie przez `toLocaleString`. Node w testach
// (jak i w prerenderze) bywa bez pełnych danych ICU i zwraca „4218,37" zamiast
// „4 218,37" — komponenty formatują deterministycznie właśnie po to, żeby
// prerenderowany HTML zgadzał się co do bitu z tym, co wyrenderuje przeglądarka.
// Gdyby test liczył oczekiwanie tą samą zepsutą drogą, przegapiłby regresję.
const NBSP = '\u00A0';
const pln = (v: number) => `${grupuj(v, 2)} PLN`;

function grupuj(v: number, decimals: number) {
    const [whole, frac] = Math.abs(v).toFixed(decimals).split('.');
    return `${v < 0 ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)},${frac}`;
}

function setReducedMotion(matches: boolean) {
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (query: string) => ({
            matches: matches && query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })
    );
}

/** Render + domknięcie mikrozadania, w którym rozwiązuje się `getGsap()`. */
async function renderShowcase(ui: React.ReactElement) {
    let result!: ReturnType<typeof render>;
    await act(async () => {
        result = render(ui);
    });
    return result;
}

const showcases = [
    ['HeroShowcase', <HeroShowcase key="hero" />],
    ['BudgetShowcase', <BudgetShowcase key="budget" />],
    ['InvestmentsShowcase', <InvestmentsShowcase key="invest" />],
    ['MortgageShowcase', <MortgageShowcase key="mortgage" />],
] as const;

describe('Showcase — makieta nie zostaje pusta bez GSAP', () => {
    beforeEach(() => {
        setReducedMotion(false);
    });

    afterEach(() => {
        vi.clearAllMocks();
        setReducedMotion(false);
    });

    it.each(showcases)('%s: markup faktycznie niesie pre-stan `opacity-0`', (_name, ui) => {
        // Bez tego reszta testów byłaby zielona także wtedy, gdyby ktoś usunął
        // pre-stan z markupu — i przestałaby cokolwiek chronić.
        const { container } = render(ui);
        expect(container.querySelectorAll('[class*="opacity-0"]').length).toBeGreaterThan(0);
    });

    it.each(showcases)('%s: gdy GSAP nie dojedzie, pre-stan jest zdejmowany', async (_name, ui) => {
        const { container } = await renderShowcase(ui);

        expect(getGsapMock).toHaveBeenCalled();
        expect(container.querySelectorAll('[class*="opacity-0"]')).toHaveLength(0);
    });

    it.each(showcases)('%s: przy reduced-motion pre-stan też jest zdejmowany', async (_name, ui) => {
        setReducedMotion(true);

        const { container } = await renderShowcase(ui);

        expect(getGsapMock).not.toHaveBeenCalled();
        expect(container.querySelectorAll('[class*="opacity-0"]')).toHaveLength(0);
    });

    it('HeroShowcase: liczniki lądują na wartościach końcowych, nie na zerach', async () => {
        const { container } = await renderShowcase(<HeroShowcase />);

        const values = [...container.querySelectorAll<HTMLElement>('[data-hero-value]')];
        expect(values).toHaveLength(4);
        values.forEach((node) => {
            expect(node.textContent).not.toBe('0,00 PLN'); // wartość startowa licznika
            expect(node.textContent).toBe(pln(parseFloat(node.dataset.heroValue!)));
        });
    });

    it('BudgetShowcase: liczniki lądują na wartościach końcowych, nie na zerach', async () => {
        const { container } = await renderShowcase(<BudgetShowcase />);

        const values = [...container.querySelectorAll<HTMLElement>('[data-sc-value]')];
        expect(values).toHaveLength(4);
        values.forEach((node) => {
            expect(node.textContent).not.toBe('0,00 PLN'); // wartość startowa licznika
            expect(node.textContent).toBe(pln(parseFloat(node.dataset.scValue!)));
        });
    });

    it('InvestmentsShowcase: wykres i licznik są domknięte, a nie schowane', async () => {
        const { container } = await renderShowcase(<InvestmentsShowcase />);

        expect(container.textContent).toContain(pln(42819.55));
        expect(container.textContent).not.toContain('0,00 PLN');

        // Linia jest chowana w CSS przez stroke-dashoffset, wypełnienie przez opacity
        const spark = container.querySelector<SVGPathElement>('[data-sc-spark]');
        expect(spark!.style.strokeDashoffset).toBe('0');
        const area = container.querySelector<SVGPathElement>('[data-sc-area]');
        expect(area!.style.opacity).toBe('0.15');
    });

    it('MortgageShowcase: pasek postępu i licznik są domknięte', async () => {
        const { container } = await renderShowcase(<MortgageShowcase />);

        const fill = container.querySelector<HTMLElement>('.lp-progress-fill');
        expect(fill!.style.width).toBe('8.1%');

        const val = container.querySelector<HTMLElement>('[data-sc-mortgage-val]');
        expect(val!.textContent).toBe(grupuj(40268.4, 1));
    });
});

// ---------------------------------------------------------------------------
// Druga siatka bezpieczeństwa: GSAP JEST, ale jego ticker nie jedzie.
//
// Scenariusz: biblioteka doładowała się poprawnie, tween powstał i synchronicznie
// nałożył stan początkowy (`fromTo` ma immediateRender), ale rAF jest zagłodzony —
// karta w tle, throttling, zapchany main thread. Tween nigdy nie renderuje, więc
// `dropOpacityPreState` ze ścieżki `!lib` nawet się nie odpala. Dla użytkownika
// efekt jest ten sam co przy braku biblioteki: pusta makieta.
// ---------------------------------------------------------------------------

/** Ile elementów jest jeszcze wygaszonych — klasą albo inline'em od GSAP-a. */
const hiddenCount = (root: HTMLElement) =>
    [...root.querySelectorAll<HTMLElement>('*')].filter(
        (n) => n.classList.contains('opacity-0') || n.style.opacity === '0'
    ).length;

/**
 * Atrapa GSAP-a, która zachowuje się jak biblioteka z martwym tickerem: nakłada
 * stan początkowy tweenów i nigdy go nie rusza. Callback `gsap.context()` celowo
 * NIE jest wołany — prawdziwy sięgnąłby po `gsap.to/fromTo`, których tu nie ma.
 */
function stalledGsap() {
    return {
        gsap: {
            context: (_setup: () => void, scope: HTMLElement) => {
                const touched = [...scope.querySelectorAll<HTMLElement>('.opacity-0')];
                touched.forEach((n) => {
                    n.style.opacity = '0';
                });
                return {
                    revert: () => touched.forEach((n) => n.style.removeProperty('opacity')),
                };
            },
        },
        ScrollTrigger: {},
    };
}

/** Atrapa GSAP-a, która dowozi — animacja doszła do końca przed siatką. */
function healthyGsap() {
    return {
        gsap: {
            context: (_setup: () => void, scope: HTMLElement) => {
                const touched = [...scope.querySelectorAll<HTMLElement>('.opacity-0')];
                touched.forEach((n) => {
                    n.style.opacity = '1';
                });
                return { revert: () => touched.forEach((n) => n.style.removeProperty('opacity')) };
            },
        },
        ScrollTrigger: {},
    };
}

function stubRect(top: number, bottom: number) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
        top,
        bottom,
        left: 0,
        right: 1024,
        width: 1024,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
    } as DOMRect);
}

describe('Showcase — siatka bezpieczeństwa na zagłodzony ticker GSAP', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        setReducedMotion(false);
        getGsapMock.mockImplementation(() => Promise.resolve(stalledGsap()));
        // jsdom zwraca same zera z getBoundingClientRect, co siatka czyta jako
        // „poza viewportem". Domyślnie ustawiamy makietę powyżej progu 82%.
        stubRect(100, 700); // window.innerHeight w jsdom = 768 → 82% = 629,76
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        getGsapMock.mockImplementation(() => Promise.resolve(null));
        setReducedMotion(false);
    });

    async function mountAndWait(ui: React.ReactElement) {
        let result!: ReturnType<typeof render>;
        await act(async () => {
            result = render(ui);
        });
        return result;
    }

    it.each(showcases)('%s: przed upływem siatki nic nie ruszamy', async (_name, ui) => {
        const { container } = await mountAndWait(ui);

        await act(async () => {
            vi.advanceTimersByTime(REVEAL_FAILSAFE_MS - 100);
        });

        // Animacja wciąż ma prawo dojechać — nie wolno jej wyprzedzać.
        expect(hiddenCount(container)).toBeGreaterThan(0);
    });

    it.each(showcases)('%s: po upływie siatki makieta jest odsłonięta', async (_name, ui) => {
        const { container } = await mountAndWait(ui);

        await act(async () => {
            vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 100);
        });

        expect(hiddenCount(container)).toBe(0);
    });

    it.each(showcases)('%s: gdy GSAP dowiózł, siatka nie wchodzi w drogę', async (_name, ui) => {
        getGsapMock.mockImplementation(() => Promise.resolve(healthyGsap()));

        const { container } = await mountAndWait(ui);

        await act(async () => {
            vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 100);
        });

        // Sonda ma opacity 1, więc siatka milczy: klasy zostają na miejscu, a stan
        // końcowy pochodzi od animacji, nie od nas.
        expect(container.querySelectorAll('[class*="opacity-0"]').length).toBeGreaterThan(0);
        expect(hiddenCount(container)).toBeGreaterThan(0);
    });

    it.each([
        ['BudgetShowcase', <BudgetShowcase key="b" />],
        ['InvestmentsShowcase', <InvestmentsShowcase key="i" />],
        ['MortgageShowcase', <MortgageShowcase key="m" />],
    ] as const)(
        '%s: poniżej progu ScrollTrigger-a pre-stan zostaje — reveal na scrollu nietknięty',
        async (_name, ui) => {
            stubRect(700, 1400); // top > 82% viewportu → użytkownik jeszcze nie doscrollował

            const { container } = await mountAndWait(ui);

            await act(async () => {
                vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 100);
            });

            expect(hiddenCount(container)).toBeGreaterThan(0);
        }
    );

    it('HeroShowcase: animacja na samo opóźnienie — siatka działa też poza viewportem', async () => {
        stubRect(-2000, -1000); // użytkownik zdążył przewinąć hero poza ekran

        const { container } = await mountAndWait(<HeroShowcase />);

        await act(async () => {
            vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 100);
        });

        expect(hiddenCount(container)).toBe(0);
    });

    it('siatka jest kasowana przy odmontowaniu', async () => {
        const { container, unmount } = await mountAndWait(<HeroShowcase />);
        const orphan = container.cloneNode(true) as HTMLElement;

        unmount();
        await act(async () => {
            vi.advanceTimersByTime(REVEAL_FAILSAFE_MS + 100);
        });

        // Gdyby timer przeżył odmontowanie, dotknąłby odpiętego już poddrzewa.
        expect(hiddenCount(orphan)).toBeGreaterThan(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});
