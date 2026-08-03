import { useEffect, useRef, useCallback } from 'react';
import {
  getGsap,
  peekGsap,
  dropOpacityPreState,
  animationsDisabled,
  scheduleShowcaseFailsafe,
} from './useLandingGsap';
import { makeParticles } from './particles';

/* ==================================================================
   HERO SHOWCASE
   Large interactive 3D widget replacing the static hero screenshot.
   Renders a rich "Transakcje" view with animated stats, table rows,
   parallax layers, and ambient glow.
   ================================================================== */

/**
 * Formatowanie liczb NIE przez `toLocaleString`.
 *
 * Landing jest prerenderowany w Node, a Node bez pełnych danych ICU zwraca
 * „4218,37" tam, gdzie przeglądarka zwraca „4 218,37". Odkąd wartości końcowe
 * siedzą w markupie (żeby makieta nie pokazywała zer, zanim dojedzie JS), ta
 * różnica trafiałaby do prerenderowanego HTML i React musiałby ją łatać przy
 * hydracji. Robimy to ręcznie, żeby serwer i klient dawały bit w bit to samo.
 */
function plGroup(v: number, decimals: number) {
  const [whole, frac] = Math.abs(v).toFixed(decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  const sign = v < 0 ? '-' : '';
  return frac ? `${sign}${grouped},${frac}` : `${sign}${grouped}`;
}

function formatPln(v: number) {
  return plGroup(v, 2) + ' PLN';
}

/* ---- Realistic data ---- */

const heroStats = [
  { icon: '📊', label: 'Bilans', value: 4218.37, sub: 'Różnica wpływów i kosztów', accent: 'from-emerald-400/10 to-transparent' },
  { icon: '🔴', label: 'Wydatki', value: 3842.15, sub: 'Wydatki w tym miesiącu', accent: 'from-red-400/10 to-transparent' },
  { icon: '🏦', label: 'Oszczędności', value: 1500.0, sub: 'Przelane na oszczędności', accent: 'from-cyan-400/10 to-transparent' },
  { icon: '💰', label: 'Wpływy', value: 8060.52, sub: 'Suma wszystkich wpływów', accent: 'from-violet-400/10 to-transparent' },
];

const heroTransactions = [
  {
    date: '14.06.2026',
    name: 'Wynagrodzenie',
    desc: 'Firma XYZ Sp. z o.o.',
    badge: 'Wpływ',
    badgeClass: 'lp-mini-badge--income',
    type: 'Premia',
    account: 'ING',
    amount: '+7 200,00 PLN',
    positive: true,
  },
  {
    date: '13.06.2026',
    name: 'Lidl',
    desc: 'Zakupy tygodniowe',
    badge: 'Jedzenie',
    badgeClass: 'lp-mini-badge--food',
    type: 'Wydatek',
    account: 'ING',
    amount: '-243,87 PLN',
    positive: false,
  },
  {
    date: '12.06.2026',
    name: 'Spotify',
    desc: 'Subskrypcja Premium Family',
    badge: 'Rozrywka',
    badgeClass: 'lp-mini-badge--expense',
    type: 'Wydatek',
    account: 'Revolut',
    amount: '-29,99 PLN',
    positive: false,
  },
  {
    date: '11.06.2026',
    name: 'PZU',
    desc: 'Ubezpieczenie mieszkania - rata',
    badge: 'Ubezpieczenia',
    badgeClass: 'lp-mini-badge--insurance',
    type: 'Wydatek',
    account: 'mBank',
    amount: '-294,01 PLN',
    positive: false,
  },
  {
    date: '10.06.2026',
    name: 'Orlen',
    desc: 'Paliwo BP95',
    badge: 'Transport',
    badgeClass: 'lp-mini-badge--expense',
    type: 'Wydatek',
    account: 'ING',
    amount: '-312,50 PLN',
    positive: false,
  },
];

/* ---- Floating particles ---- */
const HERO_PARTICLE_COLORS = ['rgba(52,211,153,0.5)', 'rgba(34,211,238,0.4)', 'rgba(167,139,250,0.4)'];

// Układ liczony raz, poza renderem — patrz particles.ts (landing jest prerenderowany
// i hydratowany, więc losowanie w renderze rozjeżdżałoby markup serwera z klientem).
const HERO_PARTICLES = makeParticles(10, 5, 11, 5).map((p, i) => ({
  ...p,
  color: HERO_PARTICLE_COLORS[i % 3],
}));

function HeroParticles() {
  const particles = HERO_PARTICLES;

  return (
    <div className="lp-showcase-particles">
      {particles.map((p) => (
        <div
          key={p.id}
          className="lp-showcase-particle"
          style={{
            left: p.left,
            top: p.top,
            '--p-size': p.size,
            '--p-color': p.color,
            '--p-dur': p.dur,
            '--p-delay': p.delay,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/**
 * Stan docelowy makiety bez animacji: liczniki od razu na wartościach końcowych,
 * pre-stan `opacity-0` zdjęty. Używany wszędzie tam, gdzie GSAP nie odsłoni
 * makiety sam — przy reduced-motion i gdy biblioteka w ogóle nie dojedzie.
 */
function showHeroStatic(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('[data-hero-value]').forEach((node) => {
    node.textContent = formatPln(parseFloat(node.dataset.heroValue || '0'));
  });
  dropOpacityPreState(el);
}

export default function HeroShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Mouse tilt — handled from parent Hero via ref, but also local
  const handleMove = useCallback((e: React.PointerEvent) => {
    const el = innerRef.current;
    if (!el || e.pointerType !== 'mouse' || animationsDisabled()) return;
    // UWAGA: nie odwoływać się tu do gołego `gsap`. GSAP deklaruje globalny
    // `namespace gsap`, więc TypeScript by to przepuścił, a w runtime poleciałby
    // ReferenceError — biblioteka jest ładowana leniwie i nie ma jej w globalu.
    const lib = peekGsap();
    if (!lib) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    lib.gsap.to(el, {
      rotateY: px * 6,
      rotateX: -py * 5,
      duration: 0.5,
      ease: 'power2.out',
    });
  }, []);

  const handleLeave = useCallback(() => {
    const lib = peekGsap();
    if (!innerRef.current || !lib) return;
    lib.gsap.to(innerRef.current, { rotateX: 0, rotateY: 0, duration: 0.7, ease: 'power3.out' });
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (animationsDisabled()) {
      showHeroStatic(el);
      return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    // Animacja hero jedzie na samo opóźnienie, bez ScrollTrigger-a, więc nie ma tu
    // czego chronić przed przedwczesnym odsłonięciem — stąd brak progu viewportu.
    const failsafe = scheduleShowcaseFailsafe(el, '[data-hero-stat]', () => {
      // Tween powstał, ale nie renderuje. Najpierw go zdejmujemy — `fromTo` trzyma
      // inline'owe `opacity: 0`, którego samo zdjęcie klasy by nie ruszyło.
      ctx?.revert();
      ctx = null;
      showHeroStatic(el);
    });

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled) return;
      if (!lib) {
        // GSAP nie załadował się w ogóle (adblock, CSP, błąd sieci). Elementy
        // makiety niosą `opacity-0` z markupu i nikt ich już nie odsłoni —
        // pokazujemy stan docelowy bez animacji.
        showHeroStatic(el);
        return;
      }
      const { gsap } = lib;
      ctx = gsap.context(() => {
      // Stat counters
      el.querySelectorAll<HTMLElement>('[data-hero-value]').forEach((node) => {
        const target = parseFloat(node.dataset.heroValue || '0');
        const counter = { v: 0 };
        // W markupie jest już wartość KOŃCOWA (żeby makieta nie pokazywała zer,
        // zanim dojedzie JS), więc licznik musi sam cofnąć się na start.
        node.textContent = formatPln(0);
        gsap.to(counter, {
          v: target,
          duration: 2,
          ease: 'power2.out',
          delay: 1.2, // after hero entry animation
          onUpdate: () => {
            node.textContent = formatPln(counter.v);
          },
        });
      });

      // Stat cards cascade
      gsap.fromTo(
        el.querySelectorAll('[data-hero-stat]'),
        { opacity: 0, y: 18, scale: 0.95 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.1,
          delay: 1.3,
        }
      );

      // Filter bar
      gsap.fromTo(
        el.querySelectorAll('[data-hero-filter]'),
        { opacity: 0, y: 10 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.06,
          delay: 1.8,
        }
      );

      // Table rows
      gsap.fromTo(
        el.querySelectorAll('[data-hero-row]'),
        { 
          opacity: 0, 
          y: -40, 
          rotateX: -60,
          transformOrigin: '50% 0%',
          scale: 0.95
        },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          scale: 1,
          duration: 0.8,
          ease: 'back.out(1.2)',
          stagger: 0.15,
          delay: 2.0,
        }
      );
    }, el);

    });

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className="lp-showcase-frame">
      <div className="lp-showcase-glow" style={{ '--showcase-glow': 'rgba(52, 211, 153, 0.18)' } as React.CSSProperties} />
      <div
        ref={innerRef}
        className="lp-showcase-inner will-change-transform"
        style={{ '--showcase-glow': 'rgba(52, 211, 153, 0.2)' } as React.CSSProperties}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <HeroParticles />

        {/* macOS chrome */}
        <div className="lp-showcase-chrome">
          <span className="lp-showcase-dot" />
          <span className="lp-showcase-dot" />
          <span className="lp-showcase-dot" />
        </div>

        <div className="p-4 sm:p-5 lg:p-6">
          {/* Header */}
          <div
            className="lp-showcase-layer flex items-center justify-between mb-4 sm:mb-5"
            style={{ '--layer-z': '16px' } as React.CSSProperties}
          >
            <h4 className="lp-display text-xl sm:text-2xl font-semibold text-white">Transakcje</h4>
            <div className="lp-showcase-toolbar">
              <span className="lp-showcase-btn hidden sm:inline-flex">↑ Import</span>
              <span className="lp-showcase-btn">↗ Wpływ</span>
              <span className="lp-showcase-btn lp-showcase-btn--primary">+ Dodaj</span>
            </div>
          </div>

          {/* Stats grid */}
          <div
            className="lp-showcase-layer grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-4 sm:mb-5"
            style={{ '--layer-z': '28px' } as React.CSSProperties}
          >
            {heroStats.map((stat) => (
              <div key={stat.label} data-hero-stat className="lp-stat-card opacity-0">
                <div className="lp-stat-label">
                  <span>{stat.icon}</span>
                  <span>{stat.label}</span>
                </div>
                <div className="lp-stat-value" data-hero-value={stat.value}>
                  {formatPln(stat.value)}
                </div>
                <div className="lp-stat-sub">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Filter bar */}
          <div
            className="lp-showcase-layer lp-filter-bar mb-3 sm:mb-4"
            style={{ '--layer-z': '10px' } as React.CSSProperties}
          >
            <span data-hero-filter className="lp-filter-pill opacity-0">🔍 Szukaj po nazwie, kategorii lub sklepie</span>
            <span data-hero-filter className="lp-filter-pill opacity-0">Wszystkie typy ▾</span>
            <span data-hero-filter className="lp-filter-pill opacity-0">Wszystkie konta ▾</span>
            <span data-hero-filter className="lp-filter-pill opacity-0">Czerwiec 2026 📅</span>
            <span data-hero-filter className="lp-filter-pill opacity-0">Wszystkie kategorie ▾</span>
          </div>

          {/* Table */}
          <div className="lp-showcase-layer" style={{ '--layer-z': '8px' } as React.CSSProperties}>
            <div className="lp-mini-table-header">
              <span>Data</span>
              <span>Opis</span>
              <span>Kategoria</span>
              <span>Konto</span>
              <span className="text-right">Kwota</span>
            </div>
            {heroTransactions.map((tx) => (
              <div key={tx.name + tx.date} data-hero-row className="lp-mini-table-row opacity-0">
                <span className="text-[11px] text-white/40">{tx.date}</span>
                <span className="min-w-0">
                  <span className="text-[11px] text-white/80 block truncate font-medium">{tx.name}</span>
                  {tx.desc && <span className="text-[9px] text-white/30 block truncate">{tx.desc}</span>}
                </span>
                <span>
                  <span className={`lp-mini-badge ${tx.badgeClass}`}>{tx.badge}</span>
                </span>
                <span className="text-[10px] text-white/40">{tx.account}</span>
                <span className={`text-[12px] font-medium text-right ${tx.positive ? 'text-emerald-400' : 'text-white/70'}`}>
                  {tx.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
