import { Check, Github, ShieldCheck, Lock, MapPin, Server } from 'lucide-react';
import { useSectionReveal, trackCardGlow } from './useLandingGsap';
import { GITHUB_REPO_URL } from '../../lib/constants';

const included = [
  'Nielimitowana historia wydatków',
  'Obsługa kont osobistych i oszczędnościowych',
  'Automatyczny import i kategoryzacja historii',
  'Tracker inwestycyjny (akcje, ETF-y, krypto, obligacje, IKE)',
  'Kontrola kredytu hipotecznego',
  'Cele oszczędnościowe i śledzenie wpłat PPK',
  'Łączniki MCP do Claude i Perplexity',
];

function OpenSource() {
  const ref = useSectionReveal<HTMLElement>();

  return (
    // id="pricing" zostaje obok id="open-source": stara sekcja cennika była linkowana
    // z nawigacji, stopki i z zewnątrz — te odnośniki mają dalej gdzieś prowadzić.
    <section
      id="open-source"
      ref={ref}
      className="relative py-16 lg:py-24 scroll-mt-20"
    >
      <span id="pricing" className="block scroll-mt-20" aria-hidden="true" />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70vw] h-[70vw] max-w-[900px] max-h-[900px] bg-emerald-500/[0.06] rounded-full blur-[140px] pointer-events-none"
        aria-hidden="true"
      />
      <div className="relative max-w-5xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p data-lp-reveal className="lp-eyebrow justify-center mb-5">
            Open source
          </p>
          <h2
            data-lp-reveal
            className="lp-display font-medium text-4xl sm:text-5xl lg:text-6xl text-white leading-[1.08]"
          >
            Darmowy. <span className="lp-gradient-text">I otwarty</span>
          </h2>
          <p data-lp-reveal className="mt-6 text-white/55 text-lg">
            Cały SmartPortfel jest bezpłatny, a jego kod publiczny. Nie ma wersji płatnej,
            limitów ani funkcji schowanych za abonamentem.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <article
            data-lp-reveal
            onPointerMove={trackCardGlow}
            className="lp-glow-card flex flex-col p-8 lg:p-10 md:-translate-y-3 !border-emerald-400/30"
          >
            <h3 className="lp-display text-sm tracking-[0.25em] text-white/50 mb-4">
              W komplecie
            </h3>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="lp-display text-5xl font-medium text-white">0 zł</span>
              <span className="text-white/40 text-sm">/ na zawsze</span>
            </div>
            <p className="text-white/55 text-sm leading-relaxed mb-8 mt-2">
              Każdy moduł, dla każdego. Bez karty, bez triala, bez wersji okrojonej.
            </p>
            <ul className="flex flex-col gap-3.5 mb-10">
              {included.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-white/70">
                  <Check size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>
            <div className="mt-auto">
              <a href="/register" className="block w-full text-center text-sm py-3.5 lp-btn-primary">
                Załóż darmowe konto
              </a>
            </div>
          </article>

          <article
            data-lp-reveal
            onPointerMove={trackCardGlow}
            className="lp-glow-card flex flex-col p-8 lg:p-10"
          >
            <h3 className="lp-display text-sm tracking-[0.25em] text-white/50 mb-4">
              Otwarty kod
            </h3>
            <p className="text-white/55 text-sm leading-relaxed mb-8">
              Aplikacja do finansów osobistych zna Twoje najbardziej wrażliwe dane.
              Otwarty kod znaczy, że nie musisz wierzyć nam na słowo.
            </p>
            <ul className="flex flex-col gap-5 mb-10">
              <li className="flex items-start gap-3 text-sm text-white/70">
                <Github size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <span className="text-white">Sprawdź, co dzieje się z Twoimi danymi.</span>{' '}
                  Cały kod aplikacji i schemat bazy są publiczne.
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm text-white/70">
                <Server size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <span className="text-white">Postaw własną instancję.</span>{' '}
                  Na swoim serwerze, ze swoją bazą — instrukcja jest w repozytorium.
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm text-white/70">
                <Lock size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <span className="text-white">AI na Twoim kluczu.</span>{' '}
                  Zapytania idą prosto do dostawcy, na Twoje konto — bez pośrednika.
                </span>
              </li>
            </ul>
            <div className="mt-auto">
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center text-sm py-3.5 lp-btn-ghost"
              >
                Zobacz kod na GitHubie
              </a>
            </div>
          </article>
        </div>

        <div
          data-lp-reveal
          className="mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4"
        >
          {[
            { icon: Lock, label: 'Dane szyfrowane' },
            { icon: ShieldCheck, label: 'Zgodność z RODO — eksport i usunięcie danych' },
            { icon: Github, label: 'Otwarty kod' },
            { icon: MapPin, label: 'Tworzone w Polsce' },
          ].map((item) => (
            <span key={item.label} className="inline-flex items-center gap-2 text-[12px] text-white/40">
              <item.icon size={14} className="text-emerald-400/70" />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default OpenSource;
