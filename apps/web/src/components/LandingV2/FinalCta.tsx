import { ArrowRight } from 'lucide-react';
import { useSectionReveal, useIsLoggedIn } from './useLandingGsap';

function FinalCta() {
  const ref = useSectionReveal<HTMLElement>();
  const isLoggedIn = useIsLoggedIn();

  return (
    <section ref={ref} className="relative py-20 lg:py-28 overflow-hidden lp-grain">
      <div className="lp-aurora" aria-hidden="true">
        <div className="lp-aurora__blob lp-aurora__blob--1" style={{ left: '10%', top: '20%' }} />
        <div className="lp-aurora__blob lp-aurora__blob--2" style={{ right: '5%', bottom: '-10%', top: 'auto' }} />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-6 text-center">
        <h2
          data-lp-reveal
          className="lp-display font-medium text-4xl sm:text-5xl lg:text-7xl text-white leading-[1.05]"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          Zacznij kontrolować swoje wydatki <span className="lp-gradient-text">już dziś</span>
        </h2>
        <p data-lp-reveal className="mt-7 text-white/55 text-lg">
          Załóż darmowe konto w minutę. Bez karty, bez zobowiązań.
        </p>
        <div data-lp-reveal className="mt-10 flex justify-center">
          <a
            href={isLoggedIn ? '/dashboard' : '/register'}
            className="lp-btn-primary px-10 py-4 text-base"
          >
            Zacznij za darmo
            <ArrowRight size={18} />
          </a>
        </div>
      </div>
    </section>
  );
}

export default FinalCta;
