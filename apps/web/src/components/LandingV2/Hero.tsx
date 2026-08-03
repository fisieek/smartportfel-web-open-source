import { useEffect, useRef } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { getGsap, peekGsap, animationsDisabled, useIsLoggedIn } from './useLandingGsap';
import HeroShowcase from './HeroShowcase';

const marqueeItems = [
  'Budżet domowy',
  'Inwestycje',
  'Cele oszczędnościowe',
  'Kredyt hipoteczny',
  'PPK',
  'Import historycznych wydatków',
  'Konta wielowalutowe',
  'Karty lojalnościowe',
];

function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const isLoggedIn = useIsLoggedIn();
  const ctaHref = isLoggedIn ? '/dashboard' : '/register';

  // Animacja WEJŚCIA hero jest w czystym CSS (landing.css) — nie ma jej tutaj celowo.
  // GSAP zostaje wyłącznie do parallaxu na scrollu, czyli czegoś, co z definicji
  // dzieje się długo po pierwszym renderze. Dlatego ładujemy go leniwie i nic
  // w widocznej treści od niego nie zależy.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || animationsDisabled()) return;

    let cancelled = false;
    let ctx: { revert: () => void } | null = null;

    void getGsap().then((lib) => {
      if (cancelled || !lib || !screenRef.current) return;
      const { gsap } = lib;
      ctx = gsap.context(() => {
        gsap.to(screenRef.current, {
          y: -60,
          ease: 'none',
          scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 1.2 },
        });
      }, root);
    });

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  // Pointer tilt on the dashboard frame (desktop only).
  // Jeśli GSAP jeszcze nie dojechał, tilt po prostu nie działa — to ozdobnik
  // reagujący na mysz, więc do pierwszego ruchu kursora biblioteka i tak zdąży.
  const handleTilt = (e: React.PointerEvent) => {
    const el = screenRef.current;
    if (!el || e.pointerType !== 'mouse') return;
    const lib = peekGsap();
    if (!lib) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    lib.gsap.to(el, {
      rotateY: px * 6,
      rotateX: -py * 5,
      duration: 0.6,
      ease: 'power2.out',
    });
  };

  const resetTilt = () => {
    const lib = peekGsap();
    if (!screenRef.current || !lib) return;
    lib.gsap.to(screenRef.current, { rotateX: 0, rotateY: 0, duration: 0.8, ease: 'power3.out' });
  };

  return (
    <header
      ref={rootRef}
      className="relative min-h-screen flex flex-col items-center justify-start overflow-hidden lp-grain pt-32 lg:pt-40"
    >
      <div className="lp-aurora" aria-hidden="true">
        <div className="lp-aurora__blob lp-aurora__blob--1" />
        <div className="lp-aurora__blob lp-aurora__blob--2" />
        <div className="lp-aurora__blob lp-aurora__blob--3" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 flex flex-col items-center text-center">
        <div
          data-hero="badge" style={{ "--lp-delay": ".1s" } as React.CSSProperties}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur px-4 py-1.5 text-xs text-white/70 mb-8"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Polska aplikacja do finansów osobistych
        </div>

        <h1
          className="lp-display font-medium text-[44px] leading-[1.05] sm:text-6xl lg:text-[84px] text-white [perspective:800px]"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          <span data-hero="line" className="block" style={{ "--lp-delay": ".25s" } as React.CSSProperties}>
            Twoje pieniądze.
          </span>
          <span data-hero="line" className="block" style={{ "--lp-delay": ".39s" } as React.CSSProperties}>
            Pod <span className="lp-gradient-text">pełną kontrolą</span>.
          </span>
        </h1>

        <p
          data-hero="sub" style={{ "--lp-delay": ".7s" } as React.CSSProperties}
          className="mt-7 max-w-xl text-base sm:text-lg text-white/55 leading-relaxed"
        >
          Oszczędzaj, planuj i kontroluj wydatki w jednym miejscu. SmartPortfel
          to Twoje centrum zarządzania finansami — od budżetu domowego po
          inwestycje i kredyt hipoteczny.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <a
            data-hero="cta" style={{ "--lp-delay": ".9s" } as React.CSSProperties}
            href={ctaHref}
            className="lp-btn-primary px-8 py-4 text-base w-full sm:w-auto"
          >
            Zacznij za darmo
            <ArrowRight size={18} />
          </a>
          <a
            data-hero="cta" style={{ "--lp-delay": "1s" } as React.CSSProperties}
            href="/#ecosystem"
            className="lp-btn-ghost px-8 py-4 text-base w-full sm:w-auto"
          >
            Zobacz możliwości
          </a>
        </div>

        <a
          data-hero="cta" style={{ "--lp-delay": "1.1s" } as React.CSSProperties}
          href="/#ecosystem"
          aria-label="Przewiń do sekcji Ekosystem"
          className="mt-10 inline-flex flex-col items-center gap-1 text-white/35 hover:text-white/70 transition-colors"
        >
          <span className="text-[10px] uppercase tracking-[0.25em]">Przewiń</span>
          <ChevronDown size={18} className="animate-bounce motion-reduce:animate-none" />
        </a>

        <div
          data-hero="screen" style={{ "--lp-delay": "1s" } as React.CSSProperties}
          className="relative mt-16 lg:mt-20 w-full [perspective:1200px]"
        >
          <div
            ref={screenRef}
            className="will-change-transform"
            onPointerMove={handleTilt}
            onPointerLeave={resetTilt}
          >
            <HeroShowcase />
          </div>
          <div
            className="absolute -inset-x-10 -bottom-10 h-40 bg-gradient-to-t from-[#050507] via-[#050507]/80 to-transparent pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>

      <div
        data-hero="marquee" style={{ "--lp-delay": "1.3s" } as React.CSSProperties}
        className="relative z-10 w-full mt-4 lg:mt-2 pb-10 [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]"
        aria-hidden="true"
      >
        <div className="lp-marquee gap-12 pr-12">
          {[...marqueeItems, ...marqueeItems].map((item, i) => (
            <span
              key={i}
              className="flex items-center gap-12 text-sm uppercase tracking-[0.2em] text-white/30 whitespace-nowrap"
            >
              {item}
              <span className="w-1 h-1 rounded-full bg-emerald-400/60" />
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

export default Hero;
