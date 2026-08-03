import { useSectionReveal } from './useLandingGsap';
import { BudgetShowcase, InvestmentsShowcase, MortgageShowcase } from './ModuleShowcase';

const modules = [
  {
    id: '01',
    title: 'Budżet',
    description:
      'Przekształć swoje codzienne wydatki w czytelne zestawienia. Kategoryzuj transakcje i kontroluj budżet domowy z niezwykłą łatwością.',
    Showcase: BudgetShowcase,
    accent: 'from-emerald-400/25',
    points: ['Kategorie wpływów i wydatków', 'Import historii wydatków (CSV)', 'Planowanie miesiąca'],
  },
  {
    id: '02',
    title: 'Moduł Inwestycyjny',
    description:
      'Obserwuj postęp swoich inwestycji w czasie i sprawdzaj, które decyzje przynoszą największe efekty.',
    Showcase: InvestmentsShowcase,
    accent: 'from-cyan-400/25',
    points: ['Akcje, ETF-y, krypto, obligacje', 'Wszyscy brokerzy w jednym widoku', 'Zysk liczony automatycznie'],
  },
  {
    id: '03',
    title: 'Kredyt Hipoteczny',
    description:
      'Trzymaj rękę na pulsie. Zapisuj wpłaty i sprawdzaj aktualne saldo zadłużenia w jednym, czytelnym miejscu.',
    Showcase: MortgageShowcase,
    accent: 'from-violet-400/25',
    points: ['Historia spłaconych rat', 'Aktualne saldo zadłużenia', 'Motywujący pasek postępu'],
  },
];

function Modules() {
  const ref = useSectionReveal<HTMLElement>();

  return (
    <section id="modules" ref={ref} className="relative py-16 lg:py-24 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl mb-16 lg:mb-24">
          <p data-lp-reveal className="lp-eyebrow mb-5">
            Osobisty analityk finansowy
          </p>
          <h2
            data-lp-reveal
            className="lp-display font-medium text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08]"
          >
            Kluczowe <span className="lp-gradient-text">moduły</span>
          </h2>
        </div>

        <div className="flex flex-col gap-24 lg:gap-36">
          {modules.map((mod, i) => {
            const reversed = i % 2 === 1;
            return (
              <div
                key={mod.id}
                className={`flex flex-col gap-10 lg:gap-16 items-center lg:flex-row ${
                  reversed ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div
                  data-lp-reveal-x
                  style={{ '--lp-rx': reversed ? '48px' : '-48px' } as React.CSSProperties}
                  className="w-full lg:w-[44%] shrink-0"
                >
                  <span className="lp-display block text-sm tracking-[0.3em] text-white/30 mb-4">
                    {mod.id}
                  </span>
                  <h3 className="lp-display text-3xl lg:text-4xl font-medium text-white mb-5">
                    {mod.title}
                  </h3>
                  <p className="text-white/55 leading-relaxed mb-8">
                    {mod.description}
                  </p>
                  <ul className="flex flex-col gap-3">
                    {mod.points.map((point) => (
                      <li key={point} className="flex items-center gap-3 text-sm text-white/65">
                        <span className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center shrink-0">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div
                  data-lp-reveal-x
                  style={{ '--lp-rx': reversed ? '-48px' : '48px' } as React.CSSProperties}
                  className="w-full lg:flex-1 relative"
                >
                  <div
                    className={`absolute -inset-6 bg-gradient-to-br ${mod.accent} to-transparent blur-3xl rounded-full opacity-60 pointer-events-none`}
                    aria-hidden="true"
                  />
                  <mod.Showcase />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Modules;
