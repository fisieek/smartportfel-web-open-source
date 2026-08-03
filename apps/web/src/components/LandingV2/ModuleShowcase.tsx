import { useEffect, useRef, useCallback, useMemo } from 'react';
import {
  getGsap,
  peekGsap,
  dropOpacityPreState,
  animationsDisabled,
  scheduleShowcaseFailsafe,
} from './useLandingGsap';
import { makeParticles } from './particles';

/* ==================================================================
   SHARED HELPERS
   ================================================================== */

/**
 * Próg, przy którym ScrollTrigger odsłania makiety. Jedno źródło prawdy dla
 * konfiguracji triggerów i dla siatki bezpieczeństwa — ta ostatnia musi widzieć
 * makietę jako „powinna już być odsłonięta" dokładnie wtedy, co ScrollTrigger,
 * inaczej zabijałaby reveal na scrollu tuż przed jego odpaleniem.
 */
const REVEAL_AT_PCT = 82;
const SC_START = `top ${REVEAL_AT_PCT}%`;
const REVEAL_AT_RATIO = REVEAL_AT_PCT / 100;

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

/** Particle config for ambient floating particles */
interface ParticleConfig {
  color: string;
  count?: number;
}

function FloatingParticles({ color, count = 8 }: ParticleConfig) {
  // Układ deterministyczny (patrz particles.ts): landing jest prerenderowany
  // i hydratowany, więc losowanie w renderze rozjeżdżałoby markup serwera z klientem.
  // Ziarno wyprowadzone z koloru — każdy moduł ma własny rozrzut, ale zawsze ten sam.
  const particles = useMemo(() => {
    const offset = [...color].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return makeParticles(count, 10, 10, 4, offset);
  }, [color, count]);

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
            '--p-color': color,
            '--p-dur': p.dur,
            '--p-delay': p.delay,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

/** Reusable macOS-like chrome bar */
function ChromeBar() {
  return (
    <div className="lp-showcase-chrome">
      <span className="lp-showcase-dot" />
      <span className="lp-showcase-dot" />
      <span className="lp-showcase-dot" />
    </div>
  );
}

/** 3D tilt wrapper with mouse tracking */
function use3DTilt(enabled = true) {
  const innerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (e: React.PointerEvent) => {
      const el = innerRef.current;
      if (!el || !enabled || e.pointerType !== 'mouse' || animationsDisabled()) return;
      // UWAGA: nie odwoływać się tu do gołego `gsap` — patrz komentarz w HeroShowcase.
      // Globalny `namespace gsap` z typów sprawia, że TS by to przepuścił, a w runtime
      // byłby ReferenceError.
      const lib = peekGsap();
      if (!lib) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - 0.5;
      const py = (e.clientY - rect.top) / rect.height - 0.5;
      lib.gsap.to(el, {
        rotateY: px * 8,
        rotateX: -py * 6,
        duration: 0.5,
        ease: 'power2.out',
      });
    },
    [enabled]
  );

  const handleLeave = useCallback(() => {
    const lib = peekGsap();
    if (!innerRef.current || !lib) return;
    lib.gsap.to(innerRef.current, { rotateX: 0, rotateY: 0, duration: 0.7, ease: 'power3.out' });
  }, []);

  return { innerRef, handleMove, handleLeave };
}

/* ==================================================================
   BUDGET SHOWCASE (Transactions)
   ================================================================== */

const budgetStats = [
  { icon: '📊', label: 'Bilans', value: 4218.37, sub: 'Różnica wpływów i kosztów' },
  { icon: '🔴', label: 'Wydatki', value: 3842.15, sub: 'Wydatki w tym miesiącu' },
  { icon: '🏦', label: 'Oszczędności', value: 1500.0, sub: 'Przelane na oszczędności' },
  { icon: '💰', label: 'Wpływy', value: 8060.52, sub: 'Suma wszystkich wpływów' },
];

const budgetTransactions = [
  {
    date: '14.06.2026',
    name: 'Wynagrodzenie',
    desc: '',
    badge: 'Wpływ',
    badgeClass: 'lp-mini-badge--income',
    type: '↗ Wpływ',
    account: 'ING',
    amount: '+7 200,00',
    positive: true,
  },
  {
    date: '13.06.2026',
    name: 'Biedronka',
    desc: 'Zakupy spożywcze',
    badge: 'Jedzenie',
    badgeClass: 'lp-mini-badge--food',
    type: '⊖ Wydatek',
    account: 'ING',
    amount: '-187,43',
    positive: false,
  },
  {
    date: '12.06.2026',
    name: 'PZU',
    desc: 'Ubezpieczenie mieszkania',
    badge: 'Ubezpieczenia',
    badgeClass: 'lp-mini-badge--insurance',
    type: '⊖ Wydatek',
    account: 'mBank',
    amount: '-294,01',
    positive: false,
  },
  {
    date: '10.06.2026',
    name: 'Media Expert',
    desc: 'Słuchawki Sony WH-1000XM5',
    badge: 'Elektronika',
    badgeClass: 'lp-mini-badge--expense',
    type: '⊖ Wydatek',
    account: 'Revolut',
    amount: '-1 249,00',
    positive: false,
  },
];

/**
 * Stan docelowy makiety bez animacji: liczniki od razu na wartościach końcowych,
 * pre-stan `opacity-0` zdjęty. Używany wszędzie tam, gdzie GSAP nie odsłoni
 * makiety sam — przy reduced-motion i gdy biblioteka w ogóle nie dojedzie.
 */
function showBudgetStatic(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('[data-sc-value]').forEach((node) => {
    node.textContent = formatPln(parseFloat(node.dataset.scValue || '0'));
  });
  dropOpacityPreState(el);
}

export function BudgetShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { innerRef, handleMove, handleLeave } = use3DTilt();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (animationsDisabled()) {
      showBudgetStatic(el);
      return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    const failsafe = scheduleShowcaseFailsafe(
      el,
      '[data-sc-stat]',
      () => {
        // Tween powstał, ale nie renderuje. Najpierw go zdejmujemy — `fromTo` trzyma
        // inline'owe `opacity: 0`, którego samo zdjęcie klasy by nie ruszyło.
        ctx?.revert();
        ctx = null;
        showBudgetStatic(el);
      },
      REVEAL_AT_RATIO
    );

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled) return;
      if (!lib) {
        // GSAP nie załadował się w ogóle (adblock, CSP, błąd sieci). Elementy
        // makiety niosą `opacity-0` z markupu i nikt ich już nie odsłoni —
        // pokazujemy stan docelowy bez animacji.
        showBudgetStatic(el);
        return;
      }
      const { gsap } = lib;
      ctx = gsap.context(() => {
      // Stat cards count-up
      el.querySelectorAll<HTMLElement>('[data-sc-value]').forEach((node) => {
        const target = parseFloat(node.dataset.scValue || '0');
        const counter = { v: 0 };
        // Patrz komentarz w HeroShowcase — markup niesie wartość końcową.
        node.textContent = formatPln(0);
        gsap.to(counter, {
          v: target,
          duration: 1.8,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: SC_START, once: true },
          onUpdate: () => {
            node.textContent = formatPln(counter.v);
          },
        });
      });

      // Table rows stagger
      gsap.fromTo(
        el.querySelectorAll('[data-sc-row]'),
        { opacity: 0, x: -20 },
        {
          opacity: 1,
          x: 0,
          duration: 0.7,
          ease: 'power2.out',
          stagger: 0.1,
          delay: 0.5,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
        }
      );

      // Stats cards fade in
      gsap.fromTo(
        el.querySelectorAll('[data-sc-stat]'),
        { opacity: 0, y: 16 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          ease: 'power2.out',
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
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
      <div className="lp-showcase-glow" style={{ '--showcase-glow': 'rgba(52, 211, 153, 0.2)' } as React.CSSProperties} />
      <div
        ref={innerRef}
        className="lp-showcase-inner"
        style={{ '--showcase-glow': 'rgba(52, 211, 153, 0.25)' } as React.CSSProperties}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <FloatingParticles color="rgba(52, 211, 153, 0.5)" count={6} />
        <ChromeBar />

        <div className="p-4 sm:p-5">
          {/* Header */}
          <div className="lp-showcase-layer flex items-center justify-between mb-4" style={{ '--layer-z': '12px' } as React.CSSProperties}>
            <h4 className="lp-display text-lg font-semibold text-white">Transakcje</h4>
            <div className="lp-showcase-toolbar">
              <span className="lp-showcase-btn">↑ Import</span>
              <span className="lp-showcase-btn">↗ Wpływ</span>
              <span className="lp-showcase-btn lp-showcase-btn--primary">+ Dodaj</span>
            </div>
          </div>

          {/* Stats */}
          <div className="lp-showcase-layer grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4" style={{ '--layer-z': '20px' } as React.CSSProperties}>
            {budgetStats.map((stat) => (
              <div key={stat.label} data-sc-stat className="lp-stat-card opacity-0">
                <div className="lp-stat-label">
                  <span>{stat.icon}</span>
                  <span>{stat.label}</span>
                </div>
                <div className="lp-stat-value" data-sc-value={stat.value}>
                  {formatPln(stat.value)}
                </div>
                <div className="lp-stat-sub">{stat.sub}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="lp-showcase-layer lp-filter-bar mb-3" style={{ '--layer-z': '8px' } as React.CSSProperties}>
            <span className="lp-filter-pill">🔍 Szukaj...</span>
            <span className="lp-filter-pill">Wszystkie typy ▾</span>
            <span className="lp-filter-pill">Wszystkie konta ▾</span>
            <span className="lp-filter-pill">Czerwiec 2026 📅</span>
          </div>

          {/* Table */}
          <div className="lp-showcase-layer" style={{ '--layer-z': '6px' } as React.CSSProperties}>
            <div className="lp-mini-table-header">
              <span>Data</span>
              <span>Opis</span>
              <span>Kategoria</span>
              <span>Konto</span>
              <span className="text-right">Kwota</span>
            </div>
            {budgetTransactions.map((tx) => (
              <div key={tx.name + tx.date} data-sc-row className="lp-mini-table-row opacity-0">
                <span className="text-[11px] text-white/40">{tx.date}</span>
                <span className="min-w-0">
                  <span className="text-[11px] text-white/80 block truncate">{tx.name}</span>
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

/* ==================================================================
   INVESTMENTS SHOWCASE (Portfolio sparkline)
   ================================================================== */

const INVEST_TARGET = 42819.55;
const INVEST_GAIN = 4821.12;
const INVEST_GAIN_PCT = '+12,68%';

// Realistic monthly portfolio growth curve
const sparkPoints = [
  0, 68, 2, 65, 5, 62, 8, 60, 12, 58, 16, 54, 20, 56, 24, 50,
  30, 48, 36, 46, 42, 42, 50, 44, 56, 38, 64, 40, 70, 34, 78, 36,
  84, 30, 90, 32, 96, 26, 104, 28, 112, 22, 120, 24, 130, 18, 140, 20,
  150, 16, 162, 18, 175, 14, 188, 12, 200, 14, 215, 10, 230, 12,
  245, 8, 260, 10, 275, 6, 290, 8, 300, 5,
];

function buildSparkPath(pts: number[]) {
  const pairs: string[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    pairs.push(`${pts[i]} ${pts[i + 1]}`);
  }
  return `M ${pairs.join(' L ')}`;
}

function buildSparkArea(pts: number[]) {
  const path = buildSparkPath(pts);
  const lastX = pts[pts.length - 2];
  const firstX = pts[0];
  return `${path} L ${lastX} 80 L ${firstX} 80 Z`;
}

const investmentHoldings = [
  { name: 'VWCE ETF', value: '18 450,20 PLN', change: '+14,2%', positive: true },
  { name: 'Obligacje EDO', value: '12 000,00 PLN', change: '+6,8%', positive: true },
  { name: 'PKO BP', value: '6 840,00 PLN', change: '+18,4%', positive: true },
  { name: 'Bitcoin', value: '5 529,35 PLN', change: '+8,1%', positive: true },
];

/** Docelowe krycie wypełnienia pod sparkline'em (CSS trzyma je na 0 jako pre-stan). */
const SPARK_AREA_OPACITY = 0.15;

/**
 * Stan docelowy makiety bez animacji. Poza licznikiem i pre-stanem `opacity-0`
 * trzeba tu domknąć też wykres: linia jest schowana przez `stroke-dashoffset`,
 * a wypełnienie przez `opacity: 0` w arkuszu — oba odsłania dopiero GSAP.
 */
function showInvestmentsStatic(el: HTMLElement, valueEl: HTMLElement | null) {
  if (valueEl) valueEl.textContent = formatPln(INVEST_TARGET);

  const path = el.querySelector<SVGPathElement>('[data-sc-spark]');
  if (path) path.style.strokeDashoffset = '0';

  const area = el.querySelector<SVGPathElement>('[data-sc-area]');
  if (area) area.style.opacity = String(SPARK_AREA_OPACITY);

  dropOpacityPreState(el);
}

export function InvestmentsShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const { innerRef, handleMove, handleLeave } = use3DTilt();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (animationsDisabled()) {
      showInvestmentsStatic(el, valueRef.current);
      return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    const failsafe = scheduleShowcaseFailsafe(
      el,
      '[data-sc-holding]',
      () => {
        // Tween powstał, ale nie renderuje. Najpierw go zdejmujemy — `fromTo` trzyma
        // inline'owe `opacity: 0`, którego samo zdjęcie klasy by nie ruszyło.
        ctx?.revert();
        ctx = null;
        showInvestmentsStatic(el, valueRef.current);
      },
      REVEAL_AT_RATIO
    );

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled) return;
      if (!lib) {
        // GSAP nie załadował się w ogóle (adblock, CSP, błąd sieci). Elementy
        // makiety niosą `opacity-0` z markupu i nikt ich już nie odsłoni —
        // pokazujemy stan docelowy bez animacji.
        showInvestmentsStatic(el, valueRef.current);
        return;
      }
      const { gsap } = lib;
      ctx = gsap.context(() => {
      // Counter
      const counter = { v: 0 };
      if (valueRef.current) valueRef.current.textContent = formatPln(0);
      gsap.to(counter, {
        v: INVEST_TARGET,
        duration: 2,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: SC_START, once: true },
        onUpdate: () => {
          if (valueRef.current) valueRef.current.textContent = formatPln(counter.v);
        },
      });

      // Sparkline draw
      const path = el.querySelector<SVGPathElement>('[data-sc-spark]');
      if (path) {
        const len = path.getTotalLength();
        path.style.setProperty('--spark-len', `${len}`);
        gsap.fromTo(
          path,
          { strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            duration: 2.2,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: el, start: SC_START, once: true },
          }
        );
      }

      // Area fade
      const area = el.querySelector('[data-sc-area]');
      if (area) {
        gsap.to(area, {
          opacity: SPARK_AREA_OPACITY,
          duration: 1,
          delay: 1.5,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
        });
      }

      // Gain badge pop
      gsap.fromTo(
        el.querySelector('[data-sc-gain]'),
        { opacity: 0, scale: 0.8, y: 8 },
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.6,
          delay: 1.4,
          ease: 'back.out(2)',
          scrollTrigger: { trigger: el, start: SC_START, once: true },
        }
      );

      // Tooltip pop
      gsap.fromTo(
        el.querySelector('[data-sc-tooltip]'),
        { opacity: 0, y: 10, scale: 0.9 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.5,
          delay: 2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: SC_START, once: true },
        }
      );

      // Holdings stagger
      gsap.fromTo(
        el.querySelectorAll('[data-sc-holding]'),
        { opacity: 0, x: 14 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.1,
          delay: 0.8,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
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
      <div className="lp-showcase-glow" style={{ '--showcase-glow': 'rgba(34, 211, 238, 0.2)' } as React.CSSProperties} />
      <div
        ref={innerRef}
        className="lp-showcase-inner"
        style={{ '--showcase-glow': 'rgba(34, 211, 238, 0.25)' } as React.CSSProperties}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <FloatingParticles color="rgba(34, 211, 238, 0.45)" count={6} />
        <ChromeBar />

        <div className="p-4 sm:p-5">
          {/* Header */}
          <div className="lp-showcase-layer flex items-center justify-between mb-4" style={{ '--layer-z': '12px' } as React.CSSProperties}>
            <h4 className="lp-display text-lg font-semibold text-white">Inwestycje</h4>
            <div className="lp-showcase-toolbar">
              <span className="lp-showcase-btn">↗ Wpływ</span>
              <span className="lp-showcase-btn lp-showcase-btn--primary">+ Dodaj</span>
            </div>
          </div>

          {/* Portfolio value card */}
          <div className="lp-showcase-layer lp-stat-card mb-4" style={{ '--layer-z': '22px' } as React.CSSProperties}>
            <div className="lp-stat-label">
              <span>Całkowita wartość portfela (Equity)</span>
            </div>
            <div className="flex items-center flex-wrap gap-3 mb-1">
              <span ref={valueRef} className="lp-display text-2xl sm:text-3xl font-semibold text-white">
                {formatPln(INVEST_TARGET)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px] text-white/35 mb-2">
              <span>INSTRUMENTY: <span className="text-white/55">42 190,20 PLN</span></span>
              <span>● GOTÓWKA: <span className="text-white/55">629,35 PLN</span></span>
            </div>
            <div data-sc-gain className="opacity-0">
              <span className="lp-gain-badge">
                ↗ {formatPln(INVEST_GAIN)} ({INVEST_GAIN_PCT})
              </span>
            </div>
          </div>

          {/* Sparkline chart */}
          <div className="lp-showcase-layer relative" style={{ '--layer-z': '14px' } as React.CSSProperties}>
            <div className="lp-stat-card p-0 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <p className="text-[11px] text-white/50 font-medium">Wartość portfela w czasie</p>
                <div className="flex items-center gap-4 mt-1 text-[9px] text-white/35">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-0.5 rounded bg-emerald-400" />
                    Aktualna wartość
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-0.5 rounded bg-white/25" />
                    Zainwestowane
                  </span>
                </div>
              </div>
              <div className="relative">
                <svg viewBox="0 0 300 80" className="w-full h-28" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="sc-spark-grad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                    <linearGradient id="sc-area-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    data-sc-area
                    d={buildSparkArea(sparkPoints)}
                    fill="url(#sc-area-grad)"
                    className="lp-sparkline-area"
                  />
                  <path
                    data-sc-spark
                    d={buildSparkPath(sparkPoints)}
                    fill="none"
                    stroke="url(#sc-spark-grad)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="lp-sparkline-path"
                  />
                </svg>
                {/* Tooltip */}
                <div
                  data-sc-tooltip
                  className="absolute top-2 right-4 opacity-0 rounded-lg border border-white/10 bg-[#0a0f14]/90 backdrop-blur-sm px-3 py-2 text-[10px] pointer-events-none"
                >
                  <p className="text-white/50 mb-1">14 cze 2026</p>
                  <p className="text-white/80">Aktualna: <span className="font-semibold text-white">42 819,55 PLN</span></p>
                  <p className="text-white/80">Zainwestowane: <span className="font-semibold text-white">37 998,43 PLN</span></p>
                  <p className="text-emerald-400 mt-0.5">Zysk: <span className="font-semibold">+4 821,12 PLN (+12,68%)</span></p>
                </div>
              </div>
            </div>
          </div>

          {/* Holdings mini-list */}
          <div className="lp-showcase-layer mt-3 grid grid-cols-2 gap-2" style={{ '--layer-z': '10px' } as React.CSSProperties}>
            {investmentHoldings.map((h) => (
              <div key={h.name} data-sc-holding className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 opacity-0">
                <span className="text-[10px] text-white/60 truncate">{h.name}</span>
                <span className={`text-[10px] font-medium ${h.positive ? 'text-emerald-400' : 'text-red-400'}`}>{h.change}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ==================================================================
   MORTGAGE SHOWCASE (Loan progress)
   ================================================================== */

const mortgageStats = [
  { icon: '🏠', label: 'Kwota kredytu', value: '500 000 PLN' },
  { icon: '↗', label: 'Pozostało', value: '459 731,60 PLN', color: 'text-amber-400' },
  { icon: '✓', label: 'Spłacony kapitał', value: '40 268,40 PLN' },
];

const mortgagePayments = [
  { date: 'Czerwiec 2026', amount: '2 847,32 PLN', capital: '1 203,18 PLN', interest: '1 644,14 PLN' },
  { date: 'Maj 2026', amount: '2 847,32 PLN', capital: '1 198,55 PLN', interest: '1 648,77 PLN' },
  { date: 'Kwiecień 2026', amount: '2 847,32 PLN', capital: '1 193,89 PLN', interest: '1 653,43 PLN' },
];

const PROGRESS_PCT = 8.1;
const MORTGAGE_PAID_CAPITAL = 40268.4;

const formatPaidCapital = (v: number) => plGroup(v, 1);

/**
 * Stan docelowy makiety bez animacji: pasek postępu wypełniony, licznik na
 * wartości końcowej, pre-stan `opacity-0` zdjęty. Używany wszędzie tam, gdzie
 * GSAP nie odsłoni makiety sam — przy reduced-motion i gdy biblioteka w ogóle
 * nie dojedzie.
 */
function showMortgageStatic(el: HTMLElement, progressEl: HTMLElement | null) {
  if (progressEl) progressEl.style.width = `${PROGRESS_PCT}%`;

  const mainVal = el.querySelector<HTMLElement>('[data-sc-mortgage-val]');
  if (mainVal) mainVal.textContent = formatPaidCapital(MORTGAGE_PAID_CAPITAL);

  dropOpacityPreState(el);
}

export function MortgageShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const { innerRef, handleMove, handleLeave } = use3DTilt();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    if (animationsDisabled()) {
      showMortgageStatic(el, progressRef.current);
      return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    const failsafe = scheduleShowcaseFailsafe(
      el,
      '[data-sc-mstat]',
      () => {
        // Tween powstał, ale nie renderuje. Najpierw go zdejmujemy — `fromTo` trzyma
        // inline'owe `opacity: 0`, którego samo zdjęcie klasy by nie ruszyło.
        ctx?.revert();
        ctx = null;
        showMortgageStatic(el, progressRef.current);
      },
      REVEAL_AT_RATIO
    );

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled) return;
      if (!lib) {
        // GSAP nie załadował się w ogóle (adblock, CSP, błąd sieci). Elementy
        // makiety niosą `opacity-0` z markupu i nikt ich już nie odsłoni —
        // pokazujemy stan docelowy bez animacji.
        showMortgageStatic(el, progressRef.current);
        return;
      }
      const { gsap } = lib;
      ctx = gsap.context(() => {
      // Progress bar fill
      if (progressRef.current) {
        gsap.fromTo(
          progressRef.current,
          { width: '0%' },
          {
            width: `${PROGRESS_PCT}%`,
            duration: 1.8,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: SC_START, once: true },
          }
        );
      }

      // Main value counter
      const mainVal = el.querySelector<HTMLElement>('[data-sc-mortgage-val]');
      if (mainVal) {
        const counter = { v: 0 };
        // Markup niesie wartość końcową — patrz komentarz w HeroShowcase.
        mainVal.textContent = formatPaidCapital(0);
        gsap.to(counter, {
          v: MORTGAGE_PAID_CAPITAL,
          duration: 2,
          ease: 'power2.out',
          scrollTrigger: { trigger: el, start: SC_START, once: true },
          onUpdate: () => {
            mainVal.textContent = formatPaidCapital(counter.v);
          },
        });
      }

      // Stats and payments stagger
      gsap.fromTo(
        el.querySelectorAll('[data-sc-mstat]'),
        { opacity: 0, y: 12 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.1,
          delay: 0.4,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
        }
      );

      gsap.fromTo(
        el.querySelectorAll('[data-sc-payment]'),
        { opacity: 0, x: -14 },
        {
          opacity: 1,
          x: 0,
          duration: 0.5,
          stagger: 0.12,
          delay: 0.8,
          scrollTrigger: { trigger: el, start: SC_START, once: true },
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
      <div className="lp-showcase-glow" style={{ '--showcase-glow': 'rgba(167, 139, 250, 0.2)' } as React.CSSProperties} />
      <div
        ref={innerRef}
        className="lp-showcase-inner"
        style={{ '--showcase-glow': 'rgba(167, 139, 250, 0.25)' } as React.CSSProperties}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
      >
        <FloatingParticles color="rgba(167, 139, 250, 0.45)" count={6} />
        <ChromeBar />

        <div className="p-4 sm:p-5">
          {/* Header */}
          <div className="lp-showcase-layer flex items-center justify-between mb-2" style={{ '--layer-z': '12px' } as React.CSSProperties}>
            <h4 className="lp-display text-lg font-semibold text-white">Kredyt Hipoteczny</h4>
            <div className="lp-showcase-toolbar">
              <span className="lp-showcase-btn">↗ Wpływ</span>
              <span className="lp-showcase-btn lp-showcase-btn--primary">+ Dodaj</span>
            </div>
          </div>

          <p className="text-[10px] text-white/35 mb-4">Śledź spłatę swoich kredytów hipotecznych</p>

          {/* Mortgage card */}
          <div className="lp-showcase-layer lp-stat-card mb-4" style={{ '--layer-z': '22px' } as React.CSSProperties}>
            {/* Name row */}
            <div className="flex items-center gap-3 mb-3">
              <span className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-base">🏠</span>
              <div>
                <p className="text-[12px] text-white/85 font-medium">Moje Pierwsze Mieszkanie</p>
                <p className="text-[9px] text-emerald-400/70">Od 28.12.2025</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="lp-showcase-btn lp-showcase-btn--primary text-[10px] py-1 px-3">+ Dodaj ratę</span>
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="text-white/45">Postęp spłaty</span>
              <span className="text-emerald-400 font-medium">{PROGRESS_PCT}%</span>
            </div>
            <div className="lp-progress-track mb-4">
              <div ref={progressRef} className="lp-progress-fill" style={{ width: `${PROGRESS_PCT}%` }} />
            </div>

            {/* Main value */}
            <div className="flex items-end justify-between mb-4">
              <div>
                <span data-sc-mortgage-val className="lp-display text-2xl sm:text-3xl font-semibold text-white">
                  {formatPaidCapital(MORTGAGE_PAID_CAPITAL)}
                </span>
                <span className="text-sm text-white/35 ml-1">PLN</span>
              </div>
              <span className="text-[10px] text-white/35">z 500 000 PLN</span>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-2">
              {mortgageStats.map((s) => (
                <div key={s.label} data-sc-mstat className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 opacity-0">
                  <div className="flex items-center gap-1 text-[9px] text-white/35 mb-1">
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </div>
                  <p className={`text-[12px] font-semibold ${s.color || 'text-white/80'}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent payments */}
          <div className="lp-showcase-layer" style={{ '--layer-z': '8px' } as React.CSSProperties}>
            <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Ostatnie raty</p>
            <div className="flex flex-col gap-1.5">
              {mortgagePayments.map((p) => (
                <div key={p.date} data-sc-payment className="flex items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2 opacity-0">
                  <span className="text-[10px] text-white/50">{p.date}</span>
                  <span className="text-[10px] text-white/35">
                    kapitał: <span className="text-white/55">{p.capital}</span>
                  </span>
                  <span className="text-[11px] text-white/70 font-medium">{p.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
