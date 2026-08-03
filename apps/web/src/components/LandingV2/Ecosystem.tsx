import { useEffect, useRef } from 'react';
import { TrendingUp, ShoppingCart, Car, Home, Utensils } from 'lucide-react';
import { getGsap, useSectionReveal, trackCardGlow, animationsDisabled } from './useLandingGsap';

/**
 * Formatowanie NIE przez `toLocaleString` — patrz komentarz w HeroShowcase.
 * Landing jest prerenderowany w Node, więc serwer i klient muszą dać bit w bit
 * to samo, odkąd wartość końcowa siedzi w markupie.
 */
function formatPln(value: number) {
  const [whole, frac] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
  return `${value < 0 ? '-' : ''}${grouped},${frac} PLN`;
}

/* ---- Widget 1: Zarządzanie wydatkami — słupki kategorii + transakcje ---- */
function ExpensesWidget() {
  const ref = useRef<HTMLDivElement>(null);

  const bars = [
    { label: 'Jedzenie', value: 72, color: 'bg-emerald-400' },
    { label: 'Transport', value: 38, color: 'bg-cyan-400' },
    { label: 'Mieszkanie', value: 90, color: 'bg-violet-400' },
    { label: 'Rozrywka', value: 26, color: 'bg-emerald-300' },
    { label: 'Zdrowie', value: 18, color: 'bg-cyan-300' },
  ];

  const rows = [
    { icon: ShoppingCart, name: 'Biedronka', cat: 'Jedzenie', amount: '-86,40 PLN' },
    { icon: Car, name: 'Orlen', cat: 'Transport', amount: '-220,00 PLN' },
    { icon: Utensils, name: 'Pyszne.pl', cat: 'Jedzenie', amount: '-54,99 PLN' },
  ];

  useEffect(() => {
    const el = ref.current;
    if (!el || animationsDisabled()) return;
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled || !lib) return;
      const { gsap } = lib;
      ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-bar]',
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 1,
          ease: 'power3.out',
          stagger: 0.09,
          transformOrigin: '50% 100%',
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
      gsap.fromTo(
        '[data-row]',
        { opacity: 0, x: -16 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: 'power2.out',
          stagger: 0.12,
          delay: 0.4,
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
    }, el);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={ref} className="flex flex-col sm:flex-row gap-5 p-6 lg:p-7 pb-2">
      <div className="flex items-end justify-between gap-3 h-36 sm:h-auto sm:w-[45%] border border-white/[0.06] rounded-xl bg-white/[0.02] p-4">
        {bars.map((bar) => (
          <div key={bar.label} className="flex flex-col items-center gap-2 flex-1 h-full justify-end">
            <div className="w-full max-w-[26px] h-full flex items-end">
              <div
                data-bar
                className={`w-full rounded-t-[4px] ${bar.color} opacity-80`}
                style={{ height: `${bar.value}%` }}
              />
            </div>
            <span className="text-[8px] uppercase tracking-wider text-white/35 whitespace-nowrap">
              {bar.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-2.5 justify-center">
        {rows.map((row) => (
          <div
            key={row.name}
            data-row
            className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
          >
            <span className="w-7 h-7 rounded-md bg-white/[0.05] flex items-center justify-center shrink-0">
              <row.icon size={13} className="text-white/55" />
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-xs text-white/80 truncate">{row.name}</span>
              <span className="text-[10px] text-white/35">{row.cat}</span>
            </span>
            <span className="ml-auto text-xs font-medium text-white/70 whitespace-nowrap">
              {row.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---- Widget 2: Inwestycje — sparkline + licznik ---- */
function InvestmentsWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);
  const TARGET = 15681.66;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Bez animacji (reduced-motion albo telefon) licznik od razu na wartości
    // końcowej. Markup i tak ją niesie, więc to tylko domknięcie kontraktu.
    if (animationsDisabled()) {
      if (valueRef.current) valueRef.current.textContent = formatPln(TARGET);
      return;
    }
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled) return;
      if (!lib) {
        // GSAP nie dojechał (adblock, CSP, błąd sieci). Licznik jest jedyną
        // rzeczą, którą wypełnia wyłącznie animacja — bez tego zostałby na zerze.
        if (valueRef.current) valueRef.current.textContent = formatPln(TARGET);
        return;
      }
      const { gsap } = lib;
      ctx = gsap.context(() => {
      const path = el.querySelector<SVGPathElement>('[data-spark]');
      if (path) {
        const len = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: len, strokeDashoffset: len },
          {
            strokeDashoffset: 0,
            duration: 1.6,
            ease: 'power2.inOut',
            scrollTrigger: { trigger: el, start: 'top 80%', once: true },
          }
        );
      }
      const counter = { v: 0 };
      if (valueRef.current) valueRef.current.textContent = formatPln(0);
      gsap.to(counter, {
        v: TARGET,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        onUpdate: () => {
          if (valueRef.current) valueRef.current.textContent = formatPln(counter.v);
        },
      });
      gsap.fromTo(
        '[data-gain]',
        { opacity: 0, y: 8 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay: 1.2,
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
    }, el);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={ref} className="p-6 lg:p-7 pb-2">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="text-[10px] uppercase tracking-wider text-white/35 mb-1.5">
          Wartość portfela
        </p>
        <div className="flex items-center flex-wrap gap-3 mb-4">
          <span ref={valueRef} className="lp-display text-2xl font-medium text-white">
            {formatPln(TARGET)}
          </span>
          <span
            data-gain
            className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 border border-emerald-400/25 text-emerald-300 text-[11px] px-2 py-0.5"
          >
            <TrendingUp size={11} />
            +9,96%
          </span>
        </div>
        <svg viewBox="0 0 300 80" className="w-full h-20" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="eco-spark" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <path
            data-spark
            d="M0 72 C 30 70, 45 62, 70 60 S 110 58, 130 48 S 170 42, 195 34 S 250 24, 300 8"
            fill="none"
            stroke="url(#eco-spark)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}

/* ---- Widget 3: Kredyt — pasek spłaty ---- */
function MortgageWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const PROGRESS = 38;

  useEffect(() => {
    const el = ref.current;
    if (!el || animationsDisabled()) return;
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled || !lib) return;
      const { gsap } = lib;
      ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-mortgage-fill]',
        { width: '0%' },
        {
          width: `${PROGRESS}%`,
          duration: 1.5,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
    }, el);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={ref} className="p-6 lg:p-7 pb-2">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-7 h-7 rounded-md bg-white/[0.05] flex items-center justify-center">
            <Home size={13} className="text-white/55" />
          </span>
          <div>
            <p className="text-xs text-white/80">Mieszkanie — kredyt hipoteczny</p>
            <p className="text-[10px] text-white/35">Pozostało 248 z 400 rat</p>
          </div>
        </div>
        <div className="flex justify-between text-[11px] mb-2">
          <span className="text-emerald-300">Spłacono {PROGRESS}%</span>
          <span className="text-white/40">312 480 PLN pozostało</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            data-mortgage-fill
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
            style={{ width: `${PROGRESS}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/* ---- Widget 4: Podsumowanie miesiąca — donut wpływy/wydatki ---- */
function MonthWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const R = 34;
  const CIRC = 2 * Math.PI * R;
  const SHARE = 0.64; // wydatki jako część wpływów

  useEffect(() => {
    const el = ref.current;
    if (!el || animationsDisabled()) return;
    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    // GSAP ładowany leniwie — ta animacja i tak odpala się na scrollu, długo po
    // pierwszym renderze, więc nie ma powodu, by jej biblioteka blokowała bundle.
    void getGsap().then((lib) => {
      if (cancelled || !lib) return;
      const { gsap } = lib;
      ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-donut]',
        { strokeDashoffset: CIRC },
        {
          strokeDashoffset: CIRC * (1 - SHARE),
          duration: 1.4,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
      gsap.fromTo(
        '[data-month-row]',
        { opacity: 0, x: 14 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          stagger: 0.14,
          delay: 0.3,
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
        }
      );
    }, el);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={ref} className="p-6 lg:p-7 pb-2">
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-center gap-6">
        <div className="relative shrink-0 w-24 h-24">
          <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90" aria-hidden="true">
            <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <circle
              data-donut
              cx="42"
              cy="42"
              r={R}
              fill="none"
              stroke="#34d399"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - SHARE)}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[11px] text-white/70 rotate-0">
            64%
          </span>
        </div>
        <div className="flex flex-col gap-2.5 min-w-0">
          <div data-month-row className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-white/25 shrink-0" />
            <span className="text-white/45">Wpływy</span>
            <span className="ml-auto sm:ml-3 text-white/80 font-medium whitespace-nowrap">6 828,94 PLN</span>
          </div>
          <div data-month-row className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-white/45">Wydatki</span>
            <span className="ml-auto sm:ml-3 text-white/80 font-medium whitespace-nowrap">4 370,52 PLN</span>
          </div>
          <div data-month-row className="flex items-center gap-2 text-xs pt-1.5 border-t border-white/[0.07]">
            <span className="text-white/45">Bilans miesiąca</span>
            <span className="ml-auto sm:ml-3 text-emerald-300 font-semibold whitespace-nowrap">+2 458,42 PLN</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const cards = [
  {
    title: 'Zarządzanie Wydatkami',
    description:
      'Kontroluj, na co idą pieniądze. Proste kategorie, jasna historia i szybki podgląd, na co wydajesz za dużo.',
    widget: ExpensesWidget,
    span: 'lg:col-span-3',
  },
  {
    title: 'Twoje Inwestycje',
    description:
      'Śledź wartość swoich obligacji, ETF-ów i akcji w jednym miejscu. Zobacz, jak rosną Twoje inwestycje.',
    widget: InvestmentsWidget,
    span: 'lg:col-span-2',
  },
  {
    title: 'Kredyt Hipoteczny',
    description:
      'Wpisuj spłacone raty i obserwuj, jak maleje Twój kredyt. Motywujący pasek postępu, który pokazuje, ile już za Tobą.',
    widget: MortgageWidget,
    span: 'lg:col-span-2',
  },
  {
    title: 'Podsumowanie Miesiąca',
    description:
      'Jeden rzut oka na dane przychodów i wydatków. Sprawdź, czy ten miesiąc zamykasz na plusie.',
    widget: MonthWidget,
    span: 'lg:col-span-3',
  },
];

function Ecosystem() {
  const ref = useSectionReveal<HTMLElement>();

  return (
    <section id="ecosystem" ref={ref} className="relative py-16 lg:py-24 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-14 lg:mb-20">
          <p data-lp-reveal className="lp-eyebrow mb-5">
            Finansowy ekosystem
          </p>
          <h2
            data-lp-reveal
            className="lp-display font-medium text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08]"
          >
            Twoje finanse —{' '}
            <span className="lp-gradient-text">prosto i czytelnie</span>
          </h2>
          <p data-lp-reveal className="mt-6 text-white/55 text-lg leading-relaxed">
            Buduj nawyk świadomego wydawania: widzisz dane, podejmujesz lepsze
            decyzje.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {cards.map((card) => (
            <article
              key={card.title}
              data-lp-reveal
              className={`lp-glow-card group flex flex-col ${card.span}`}
              onPointerMove={trackCardGlow}
            >
              <card.widget />
              <div className="p-6 lg:p-7 pt-4 mt-auto">
                <h3 className="lp-display text-lg font-medium text-white mb-2">
                  {card.title}
                </h3>
                <p className="text-sm text-white/50 leading-relaxed">
                  {card.description}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Ecosystem;
