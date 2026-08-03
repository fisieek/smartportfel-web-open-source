import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { getGsap, useSectionReveal, trackCardGlow } from './useLandingGsap';

type Status = 'done' | 'in-progress' | 'planned';

interface Milestone {
  title: string;
  date: string;
  status: Status;
  tag: string;
  points: string[];
}

const milestones: Milestone[] = [
  {
    title: 'Beta v0.1',
    date: '12.2025',
    status: 'done',
    tag: 'Gotowe',
    points: [
      'Manualne zarządzanie kontami osobistymi, wprowadzanie wpływów i wydatków',
      'System oszczędności i inwestycji',
      'Cele oszczędnościowe',
      'Import danych historycznych',
    ],
  },
  {
    title: 'Beta v0.2',
    date: '02.2026',
    status: 'done',
    tag: 'Gotowe',
    points: [
      'Planowanie miesiąca: zaplanowane wpływy i wydatki',
      'Customowe kategorie i sklepy',
      'System PPK oraz kredytu',
      'Obsługa wielowalutowych kont osobistych',
      'Karty lojalnościowe i vouchery',
      'Kalkulator oszczędności na kontach oszczędnościowych',
    ],
  },
  {
    title: 'Beta v0.3',
    date: '03.2026',
    status: 'done',
    tag: 'Gotowe',
    points: [
      'Cashback (LetyShops, Żappka, itp.)',
      'Zautomatyzowany import danych',
      'Automatyczne śledzenie postępów inwestycyjnych (integracja z API)',
      'Lokaty',
    ],
  },
  {
    title: 'SmartPortfel 1.0',
    date: '06.2026',
    status: 'in-progress',
    tag: 'W trakcie',
    points: [
      'Zarządzanie wieloma kredytami',
      'Kalkulator kredytu',
      'Wspólne konta osobiste',
      'Konta IKE/IKZE',
    ],
  },
  {
    title: 'SmartPortfel 1.1',
    date: '08.2026',
    status: 'planned',
    tag: 'Zaplanowane',
    points: [
      'Ubezpieczenia',
      'Zarządzanie aktywami (nieruchomości, biżuteria, samochód)',
      'Czekamy na Wasze propozycje!',
    ],
  },
];

function StatusNode({ status }: { status: Status }) {
  if (status === 'done') {
    return (
      <span className="relative z-10 w-9 h-9 rounded-full bg-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.5)] flex items-center justify-center">
        <Check size={16} strokeWidth={3.5} className="text-[#050507]" />
      </span>
    );
  }
  if (status === 'in-progress') {
    return (
      <span className="relative z-10 w-9 h-9 rounded-full border-2 border-amber-400 bg-[#0a0a0c] flex items-center justify-center">
        <span className="absolute inset-0 rounded-full border-2 border-amber-400/60 animate-ping" />
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
      </span>
    );
  }
  return (
    <span className="relative z-10 w-9 h-9 rounded-full border-2 border-white/20 bg-[#0a0a0c] flex items-center justify-center">
      <span className="w-2 h-2 rounded-full bg-white/25" />
    </span>
  );
}

function StatusTag({ m }: { m: Milestone }) {
  const styles: Record<Status, string> = {
    done: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
    'in-progress': 'bg-amber-400/10 text-amber-300 border-amber-400/25',
    planned: 'bg-white/[0.05] text-white/45 border-white/10',
  };
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${styles[m.status]}`}
    >
      {m.tag}
    </span>
  );
}

function MilestoneCard({ m }: { m: Milestone }) {
  return (
    <article
      onPointerMove={trackCardGlow}
      className="lp-glow-card p-5 lg:p-6 w-full text-left"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="font-mono text-[11px] tracking-[0.18em] text-white/40">
          {m.date}
        </span>
        <StatusTag m={m} />
      </div>
      <h3 className="lp-display text-lg font-medium text-white mb-3">{m.title}</h3>
      <ul className="flex flex-col gap-1.5">
        {m.points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-white/45">
            <span className="mt-[7px] w-1 h-1 rounded-full bg-white/25 shrink-0" />
            {point}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Roadmap() {
  const ref = useSectionReveal<HTMLElement>();
  const desktopLineRef = useRef<HTMLDivElement>(null);
  const mobileLineRef = useRef<HTMLDivElement>(null);
  const desktopWrapRef = useRef<HTMLDivElement>(null);
  const mobileWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Czystym DOM-em, żeby ścieżka reduced-motion w ogóle nie ściągała GSAP.
      if (desktopLineRef.current) desktopLineRef.current.style.transform = 'scaleX(1)';
      if (mobileLineRef.current) mobileLineRef.current.style.transform = 'scaleY(1)';
      return;
    }

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    void getGsap().then((lib) => {
      if (cancelled || !lib) return;
      const { gsap } = lib;
      ctx = gsap.context(() => {
      if (desktopLineRef.current && desktopWrapRef.current) {
        gsap.fromTo(
          desktopLineRef.current,
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            transformOrigin: '0 50%',
            scrollTrigger: {
              trigger: desktopWrapRef.current,
              start: 'top 75%',
              end: 'bottom 45%',
              scrub: 0.8,
            },
          }
        );
      }
      if (mobileLineRef.current && mobileWrapRef.current) {
        gsap.fromTo(
          mobileLineRef.current,
          { scaleY: 0 },
          {
            scaleY: 1,
            ease: 'none',
            transformOrigin: '50% 0',
            scrollTrigger: {
              trigger: mobileWrapRef.current,
              start: 'top 70%',
              end: 'bottom 60%',
              scrub: 0.8,
            },
          }
        );
      }
    });
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return (
    <section id="roadmap" ref={ref} className="relative py-16 lg:py-24 overflow-hidden scroll-mt-20">
      <div
        className="absolute left-1/4 top-0 w-96 h-96 bg-cyan-500/[0.07] rounded-full blur-[130px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute right-1/4 bottom-0 w-96 h-96 bg-violet-500/[0.07] rounded-full blur-[130px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative max-w-7xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-24">
          <p data-lp-reveal className="lp-eyebrow justify-center mb-5">
            Roadmapa
          </p>
          <h2
            data-lp-reveal
            className="lp-display font-medium text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08]"
          >
            Rozwijamy się <span className="lp-gradient-text">dla Ciebie</span>
          </h2>
          <p data-lp-reveal className="mt-6 text-white/55 text-lg">
            Plan rozwoju SmartPortfela — od wersji beta aż po inteligentnego
            doradcę finansowego.
          </p>
        </div>

        {/* Desktop: pozioma oś czasu */}
        <div ref={desktopWrapRef} className="hidden lg:block">
          <div className="relative mb-10">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-white/[0.07]" />
            <div
              ref={desktopLineRef}
              className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 shadow-[0_0_18px_rgba(34,211,238,0.45)] origin-left scale-x-0"
            />
            <div className="relative grid grid-cols-5">
              {milestones.map((m) => (
                <div key={m.title} className="flex justify-center py-1">
                  <StatusNode status={m.status} />
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4 items-start">
            {milestones.map((m, i) => (
              <div
                key={m.title}
                data-lp-reveal
                className="flex flex-col items-center gap-0"
              >
                <span
                  className="w-px bg-gradient-to-b from-white/25 to-transparent"
                  style={{ height: 18 + (i % 2) * 26 }}
                  aria-hidden="true"
                />
                <MilestoneCard m={m} />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile/tablet: pionowa oś czasu */}
        <div ref={mobileWrapRef} className="lg:hidden relative pl-12">
          <div className="absolute left-[17px] top-1 bottom-1 w-[3px] rounded-full bg-white/[0.07]" />
          <div
            ref={mobileLineRef}
            className="absolute left-[17px] top-1 bottom-1 w-[3px] rounded-full bg-gradient-to-b from-emerald-400 via-cyan-400 to-violet-400 shadow-[0_0_14px_rgba(34,211,238,0.4)] origin-top scale-y-0"
          />
          <div className="flex flex-col gap-8">
            {milestones.map((m) => (
              <div key={m.title} data-lp-reveal className="relative">
                <span className="absolute -left-12 top-1 scale-90 origin-left">
                  <StatusNode status={m.status} />
                </span>
                <MilestoneCard m={m} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default Roadmap;
