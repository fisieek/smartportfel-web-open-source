import { useEffect, useRef, useState, type DependencyList } from 'react';
import type { gsap as GsapNamespace } from 'gsap';

/**
 * GSAP jest ładowany LENIWIE.
 *
 * Wcześniej `import gsap from 'gsap'` na top-levelu tego pliku sprawiał, że cały
 * chunk (~45 KB gz) był twardą zależnością chunku landingu — React nie mógł
 * wyrenderować strony, zanim GSAP się nie pobrał i nie sparsował. Animacja wejścia
 * hero jest dziś w czystym CSS (landing.css), więc GSAP obsługuje już tylko rzeczy,
 * które z definicji dzieją się PÓŹNIEJ: parallax i reveal sekcji na scrollu.
 * Nic z tego nie blokuje pierwszego renderu, więc nie ma powodu, by blokował go bundle.
 */

type GsapBundle = {
    gsap: typeof GsapNamespace;
    ScrollTrigger: any;
};

let cached: GsapBundle | null = null;
let loading: Promise<GsapBundle | null> | null = null;

export function getGsap(): Promise<GsapBundle | null> {
    if (cached) return Promise.resolve(cached);
    if (typeof window === 'undefined') return Promise.resolve(null);
    // Na telefonie GSAP nie jest pobierany W OGÓLE — patrz `animationsDisabled`.
    // Zwrócenie `null` wpina się w istniejący kontrakt: każde wywołanie już umie
    // obsłużyć brak biblioteki i pokazać treść bez animacji.
    if (animationsDisabled()) return Promise.resolve(null);

    if (!loading) {
        loading = Promise.all([import('gsap'), import('gsap/ScrollTrigger')])
            .then(([gsapMod, stMod]) => {
                const gsap = (gsapMod.default ?? (gsapMod as any).gsap) as typeof GsapNamespace;
                const { ScrollTrigger } = stMod;
                gsap.registerPlugin(ScrollTrigger);
                cached = { gsap, ScrollTrigger };
                return cached;
            })
            .catch(() => null); // brak animacji nie może wywrócić strony
    }
    return loading;
}

/** Synchroniczny dostęp dla handlerów zdarzeń (pointer move itp.). */
export function peekGsap(): GsapBundle | null {
    return cached;
}

/**
 * Odpowiednik dawnego `useEffect(() => { const ctx = gsap.context(...); return () =>
 * ctx.revert(); })`, tylko czekający na leniwie doładowany GSAP. Trzyma semantykę
 * sprzątania identyczną jak wcześniej — jeśli komponent odmontuje się, zanim
 * biblioteka dojedzie, kontekst nie powstanie w ogóle.
 */
export function useGsapContext(
    setup: (gsap: typeof GsapNamespace, ScrollTrigger: any) => void,
    deps: DependencyList = [],
    scope?: { current: HTMLElement | null }
) {
    useEffect(() => {
        let cancelled = false;
        let ctx: { revert: () => void } | null = null;

        void getGsap().then((lib) => {
            if (cancelled || !lib) return;
            ctx = lib.gsap.context(
                () => setup(lib.gsap, lib.ScrollTrigger),
                scope?.current ?? undefined
            );
        });

        return () => {
            cancelled = true;
            ctx?.revert();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
}

export const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Czy w ogóle nie animujemy — a więc czy GSAP ma się nie pobrać.
 *
 * Do reduced-motion dochodzi wąski ekran, bo na telefonie sama biblioteka to
 * 47 KB pobierania i 113 KB do sparsowania, a płaci za to najsłabszy sprzęt,
 * jaki wchodzi na stronę. Efekty scrollowe są dekoracją — treść landingu nie
 * zależy od nich w niczym.
 *
 * Próg jest ten sam co `@media (max-width: 640px)` w landing.css, żeby stan JS
 * i CSS nie rozjechały się na granicy.
 *
 * Wszystkie wywołania są już przygotowane na brak animacji: `useSectionReveal`
 * nie zakłada wtedy `.lp-anim`, a makiety pokazują stan docelowy od razu. Dzięki
 * temu wyłączenie jest jednym warunkiem, a nie przepisywaniem komponentów.
 */
export const animationsDisabled = () =>
    typeof window !== 'undefined' &&
    (prefersReducedMotion() || window.matchMedia('(max-width: 640px)').matches);

/**
 * Zdejmuje pre-stan `opacity-0` z całego poddrzewa `root`.
 *
 * Makiety showcase'ów (HeroShowcase, ModuleShowcase) mają pre-stan wpisany
 * bezpośrednio w markup klasą Tailwinda `opacity-0`, a odsłania je dopiero GSAP.
 * Jeśli biblioteka nie dojedzie (adblock, CSP, błąd sieci) albo animacji nie
 * odpalamy w ogóle (reduced-motion), elementy zostają niewidoczne NA ZAWSZE —
 * dokładnie ten sam objaw, przed którym `useSectionReveal` broni się zdejmowaniem
 * klasy-bramki `.lp-anim`. Tam pre-stan siedzi w arkuszu, tu w markupie, więc
 * kontrakt jest ten sam, tylko realizacja inna.
 *
 * W makietach `opacity-0` NIE MA innego zastosowania niż pre-stan animacji —
 * dlatego zamiatamy po klasie, a nie po liście selektorów, której nie dałoby się
 * utrzymać w zgodzie z markupem.
 */
export function dropOpacityPreState(root: HTMLElement) {
    root.querySelectorAll<HTMLElement>('.opacity-0').forEach((node) => {
        node.classList.remove('opacity-0');
    });
}

/**
 * Czy element nadal siedzi w pre-stanie.
 *
 * Świadomie NIE przez `getComputedStyle`: pre-stan bierze się z klasy Tailwinda,
 * a GSAP zdejmuje go inline'owym `opacity`, więc czytamy dokładnie te dwa źródła.
 * Dzięki temu wynik nie zależy od tego, czy arkusz z `.opacity-0` zdążył się
 * wczytać — a to bywa właśnie ta sama awaria sieci, przed którą się bronimy.
 */
function isStillHidden(el: HTMLElement) {
    const inline = el.style.opacity;
    if (inline !== '') return inline === '0'; // w trakcie tweenu np. '0.4' → jedzie
    return el.classList.contains('opacity-0');
}

/**
 * Ile czekamy, zanim uznamy, że tween nie ruszy. Ta sama wartość co siatka
 * bezpieczeństwa w `useSectionReveal`, i z tego samego powodu: jest dłuższa niż
 * najdłuższa animacja makiety (licznik hero: 1,2 s opóźnienia + 2 s trwania),
 * więc przy zdrowym GSAP-ie nigdy nie wchodzi w drogę.
 */
export const REVEAL_FAILSAFE_MS = 3500;

/**
 * Druga siatka bezpieczeństwa makiet — na wypadek, gdy GSAP JEST załadowany, ale
 * jego ticker nie jedzie.
 *
 * `dropOpacityPreState` broni przed nieudanym importem biblioteki. Tu chodzi o
 * sytuację odwrotną: biblioteka jest, tween powstał i zdążył synchronicznie
 * nałożyć stan początkowy (`fromTo` ma `immediateRender`), ale rAF jest
 * zagłodzony — karta w tle, agresywny throttling, zapchany main thread. Dla
 * użytkownika efekt jest identyczny: pusta makieta.
 *
 * Warunek „nadal wygaszona" jest tu kluczowy — przy zdrowym GSAP-ie animacja o tej
 * porze dawno się skończyła, sonda ma `opacity: 1` i nic się nie dzieje.
 *
 * `viewportRatio` odwzorowuje próg ScrollTrigger-a (`start: 'top NN%'`): makiety,
 * do których użytkownik jeszcze nie doscrollował, celowo zostawiamy w pre-stanie,
 * bo tam reveal na scrollu jest pożądany. Pominięcie parametru = brak sprawdzania,
 * dla animacji jadących na samo opóźnienie (hero).
 */
export function scheduleShowcaseFailsafe(
    root: HTMLElement,
    probeSelector: string,
    showStatic: () => void,
    viewportRatio?: number
) {
    return window.setTimeout(() => {
        if (viewportRatio !== undefined) {
            const r = root.getBoundingClientRect();
            if (r.bottom <= 0 || r.top >= window.innerHeight * viewportRatio) return;
        }

        const probe = root.querySelector<HTMLElement>(probeSelector);
        if (!probe || !isStillHidden(probe)) return;

        showStatic();
    }, REVEAL_FAILSAFE_MS);
}

/**
 * Animates all [data-lp-reveal] / [data-lp-reveal-x] descendants of the
 * section into view when it enters the viewport.
 */
export function useSectionReveal<T extends HTMLElement>(deps: DependencyList = []) {
    const ref = useRef<T>(null);

    // `deps` pozwala ponownie podpiąć reveal, gdy treść sekcji dochodzi async
    // (np. sekcja renderuje `null` do czasu załadowania danych — bez tego
    // ScrollTrigger nigdy nie podpina się do sekcji i karty zostają na opacity:0).
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        // Bez animacji (reduced-motion albo telefon) nie zakładamy `.lp-anim` —
        // treść jest od razu widoczna i nie dotykamy gsap w ogóle. Sprawdzenie MUSI
        // być tutaj, a nie dopiero w `!lib`: inaczej pre-stan zdążyłby wejść na
        // jedną klatkę i sekcje mrugnęłyby pustką przed odsłonięciem.
        if (animationsDisabled()) return;

        // Pre-stan (opacity: 0) obowiązuje dopiero od tej chwili — patrz landing.css.
        el.classList.add('lp-anim');

        // Siatka bezpieczeństwa ograniczona do sekcji, które SĄ w viewporcie: te
        // powinny być już odsłonięte, więc jeśli po 3,5 s nadal są ukryte, GSAP nie
        // dojechał i pokazujemy je bez animacji. Sekcje poniżej linii załamania
        // celowo zostawiamy w pre-stanie — tam reveal na scroll jest pożądany.
        const revealIfVisible = () => {
            const r = el.getBoundingClientRect();
            if (r.top >= window.innerHeight || r.bottom <= 0) return;
            el.classList.remove('lp-anim');
            el.querySelectorAll<HTMLElement>('[data-lp-reveal], [data-lp-reveal-x]').forEach(
                (node) => {
                    node.style.removeProperty('opacity');
                    node.style.removeProperty('transform');
                }
            );
        };
        const failsafe = window.setTimeout(revealIfVisible, 3500);

        let ctx: { revert: () => void } | null = null;
        let cancelled = false;

        void getGsap().then((lib) => {
            if (cancelled) return;
            if (!lib) {
                // GSAP nie załadował się w ogóle (adblock, CSP, błąd sieci). Bez tego
                // sekcje poniżej linii załamania zostałyby niewidoczne NA ZAWSZE,
                // niezależnie od scrollowania — zdejmujemy pre-stan od razu.
                el.classList.remove('lp-anim');
                return;
            }
            const { gsap } = lib;
            ctx = gsap.context(() => {
                const ups = el.querySelectorAll('[data-lp-reveal]');
                if (ups.length) {
                    gsap.to(ups, {
                        opacity: 1,
                        y: 0,
                        duration: 1,
                        ease: 'power3.out',
                        stagger: 0.12,
                        scrollTrigger: { trigger: el, start: 'top 78%', once: true },
                    });
                }
                el.querySelectorAll('[data-lp-reveal-x]').forEach((node) => {
                    gsap.to(node, {
                        opacity: 1,
                        x: 0,
                        duration: 1.1,
                        ease: 'power3.out',
                        scrollTrigger: { trigger: node, start: 'top 82%', once: true },
                    });
                });
            }, el);
        });

        return () => {
            cancelled = true;
            window.clearTimeout(failsafe);
            ctx?.revert();
            el.classList.remove('lp-anim');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    return ref;
}

/** Pointer-follow glow position for .lp-glow-card elements. */
export function trackCardGlow(e: React.PointerEvent<HTMLElement>) {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    target.style.setProperty('--lp-mx', `${e.clientX - rect.left}px`);
    target.style.setProperty('--lp-my', `${e.clientY - rect.top}px`);
}

/**
 * Landing jest prerenderowany do statycznego HTML (scripts/prerender.mjs), więc ta
 * wartość NIE MOŻE być czytana w trakcie renderu — na serwerze nie ma localStorage,
 * a rozjazd między HTML a pierwszym renderem klienta zepsułby hydrację.
 * Pierwszy render zawsze zwraca `false` (tak jak prerender), a korekta następuje
 * po zamontowaniu: dla zalogowanego CTA przełącza się z /register na /dashboard.
 */
export function useIsLoggedIn() {
    const [loggedIn, setLoggedIn] = useState(false);

    useEffect(() => {
        try {
            // Celowo w efekcie: `localStorage` nie istnieje przy prerenderze, a pierwszy
            // render klienta musi dać ten sam wynik co serwer (`false`), inaczej hydracja
            // się rozjeżdża. Patrz komentarz nad tym hookiem.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setLoggedIn(!!localStorage.getItem('token'));
        } catch {
            /* prywatny tryb przeglądarki — zostajemy przy false */
        }
    }, []);

    return loggedIn;
}
