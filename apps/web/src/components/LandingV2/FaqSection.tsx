import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSectionReveal } from './useLandingGsap';

const faqItems = [
  {
    question: 'Czym jest SmartPortfel i czy to dla mnie?',
    answer:
      'SmartPortfel to Twój osobisty asystent finansowy, który robi porządek w pieniądzach za Ciebie. Jeśli czujesz, że wypłata "przecieka Ci przez palce", chcesz szybciej spłacić kredyt albo odkładasz na wymarzone wakacje – to miejsce dla Ciebie. Nieważne, czy dopiero zaczynasz oszczędzać, prowadzisz Excela z wydatkami, czy masz już pierwsze inwestycje. My dajemy Ci mapę, dzięki której szybciej dotrzesz do celu.',
  },
  {
    question: 'Czy aplikacja jest naprawdę darmowa?',
    answer:
      'Tak, w całości i bez gwiazdek. Nie ma wersji płatnej, okresu próbnego ani funkcji schowanych za abonamentem — każdy moduł, od importu wyciągów po trackera inwestycyjnego, jest dostępny dla wszystkich. Nie prosimy o kartę, bo nie mamy za co jej obciążyć. Kod aplikacji jest publiczny, więc możesz też postawić własną instancję na swoim serwerze.',
  },
  {
    question: 'Czy muszę mieć własny klucz AI?',
    answer:
      'Funkcje AI — automatyczna kategoryzacja wydatków i odczyt wyciągów PDF — działają na kluczu API, który podajesz w ustawieniach (Google Gemini lub OpenAI). Gemini ma darmowy pakiet, który w zupełności wystarcza do domowego użytku. Klucz jest szyfrowany i używany wyłącznie do Twoich zapytań: idą prosto do dostawcy, na Twoje konto, bez pośrednika. Reszta aplikacji działa bez żadnego klucza.',
  },
  {
    question: 'Czy historyczne wydatki muszę wprowadzić ręcznie?',
    answer:
      'Absolutnie nie! Szanujemy Twój czas - SmartPortfel ma funkcję Szybkiego Importu. Pobierasz historię z banku w CSV, dostosowujesz plik pod nasz szablon, a system sam "układa" wydatki na półkach: jedzenie, transport, rozrywka. Ty tylko rzucasz okiem na gotowy wykres. Koniec ze zbieraniem paragonów.',
  },
  {
    question: 'Prowadzę Excela, po co mi kolejna aplikacja?',
    answer:
      'Excel jest super, ale wszystko musisz przygotować samodzielnie. Tabele, wykresy, formuły. SmartPortfel działa od razu po uruchomieniu. Automatycznie policzymy Twoje wydatki i oszczędności, a także pokażemy, ile zarobiły Twoje inwestycje.',
  },
  {
    question: 'Inwestuję tylko małe kwoty. Czy to narzędzie będzie przydatne?',
    answer:
      'Jasne! Nie musisz być wilkiem z Wall Street. SmartPortfel jest idealny do śledzenia nawet najmniejszych inwestycji. Wszystko masz w jednym widoku – widzisz, ile łącznie masz pieniędzy, niezależnie czy trzymasz je w banku, w obligacjach skarbowych czy w Bitcoinie. System sam policzy Twój zysk. Ze wszystkich Twoich kont i brokerów na raz.',
  },
  {
    question: 'Jak szybko mogę zacząć?',
    answer:
      'Zakładasz konto, wgrywasz historię z banku i... gotowe. Twój finansowy obraz jest gotowy. Bez skomplikowanych konfiguracji i czytania instrukcji. A później już tylko sumienne dodawanie transakcji. Zrób z tego nawyk, a efekty i korzyści zobaczysz już po chwili.',
  },
  {
    question: 'Co jeśli mam konta w trzech różnych bankach?',
    answer:
      'Dla nas to nie problem. Właśnie po to powstał SmartPortfel – żebyś nie musiał logować się w trzy miejsca. Wrzucasz historie ze wszystkich swoich kont, a my łączymy to w jeden, prosty obraz. Wreszcie zobaczysz, ile naprawdę masz łącznie pieniędzy.',
  },
  {
    question: 'Chcę uzbierać na wakacje/nowe auto. Jak to ułatwiacie?',
    answer:
      'Tworzysz u nas Cele Oszczędnościowe. Nazywasz je, ustalasz kwotę i patrzysz, jak pasek postępu się zapełnia. To działa psychologicznie – jak widzisz, że brakuje Ci już tylko kawałka do celu, łatwiej odmówić sobie zbędnych wydatków na mieście. Co więcej pierwszy z nich - Poduszka finansowa - jest utworzona automatycznie dla każdego konta. Bo bezpieczeństwo to podstawa.',
  },
  {
    question: 'Nie znam się na inwestowaniu, czy to nie będzie dla mnie za trudne?',
    answer:
      'SmartPortfel jest właśnie dla takich osób jak Ty. Nie zasypiemy Cię wykresami giełdowymi, których możesz nie zrozumieć. Pokażemy Ci prosto: "Na początku było X, teraz masz Y. Jesteś na plusie Z". Prosto i czytelnie. Sprawdź, to nic nie kosztuje.',
  },
];

function FaqSection() {
  const ref = useSectionReveal<HTMLElement>();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" ref={ref} className="relative py-16 lg:py-24 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-20">
        <div className="lg:col-span-2">
          <p data-lp-reveal className="lp-eyebrow mb-5">
            FAQ
          </p>
          <h2
            data-lp-reveal
            className="lp-display font-medium text-4xl sm:text-5xl text-white leading-[1.1]"
          >
            Mamy odpowiedzi, <span className="lp-gradient-text">których szukasz</span>
          </h2>
          <p data-lp-reveal className="mt-6 text-white/55 leading-relaxed max-w-sm">
            Odkryj szybkie i wyczerpujące odpowiedzi na najczęstsze pytania
            dotyczące naszej platformy i świadomego zarządzania finansami.
          </p>
          <a
            data-lp-reveal
            href="/register"
            className="lp-btn-primary hidden lg:inline-flex mt-10 px-7 py-3.5 text-sm"
          >
            Załóż darmowe konto
          </a>
        </div>

        <div className="lg:col-span-3 flex flex-col">
          {faqItems.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.question} data-lp-reveal className="border-b border-white/[0.08]">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-6 text-left py-6 group"
                >
                  <span
                    className={`lp-display text-base lg:text-lg font-medium transition-colors duration-300 ${
                      isOpen ? 'text-white' : 'text-white/70 group-hover:text-white'
                    }`}
                  >
                    {item.question}
                  </span>
                  <Plus
                    size={20}
                    className={`shrink-0 text-white/40 transition-transform duration-300 ${
                      isOpen ? 'rotate-45 text-emerald-400' : ''
                    }`}
                  />
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-6 text-sm text-white/50 leading-relaxed max-w-2xl">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default FaqSection;
