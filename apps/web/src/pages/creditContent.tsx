import type { PageContent } from './salaryCalculatorsContent';

// Treść stron kalkulatorów kredytowych (zdolność, nadpłata).
// UWAGA: title/description muszą być zgodne z STATIC_PAGES w apps/server/src/seo/seo.ts.

export type CreditMode = 'zdolnosc' | 'nadplata';

export const CREDIT_PAGES: Record<CreditMode, PageContent> = {
    zdolnosc: {
        path: '/kalkulator-zdolnosci-kredytowej',
        seoTitle: 'Kalkulator zdolności kredytowej 2026 — ile kredytu dostanę',
        seoDescription:
            'Darmowy kalkulator zdolności kredytowej 2026: sprawdź, na jaki kredyt hipoteczny możesz liczyć przy swoich dochodach. Wskaźnik DStI i bufor stopy KNF (+2,5 p.p.) — wynik od razu.',
        h1: 'Kalkulator zdolności kredytowej 2026',
        intro:
            'Sprawdź orientacyjnie, na jaki kredyt hipoteczny możesz liczyć przy swoich dochodach i zobowiązaniach. Liczymy metodą DStI z buforem stopy procentowej zgodnym z Rekomendacją S KNF.',
        ctaHeading: 'Poznaj swoją zdolność, a potem realnie nią zarządzaj',
        ctaBody:
            'W SmartPortfel zobaczysz swój budżet, zobowiązania i wolne środki w jednym miejscu — łatwiej zaplanujesz kredyt i sprawdzisz, ile raty naprawdę udźwigniesz.',
        faq: [
            {
                q: 'Jak banki liczą zdolność kredytową?',
                a: 'Bank sprawdza, jaka część Twojego dochodu może iść na spłatę rat (wskaźnik DStI), odejmuje istniejące zobowiązania i koszty utrzymania, a następnie dolicza bufor na wzrost stóp procentowych. Wynik zależy też od scoringu, liczby osób w gospodarstwie i źródła dochodu.',
            },
            {
                q: 'Co to jest bufor stopy procentowej KNF?',
                a: 'Zgodnie z Rekomendacją S KNF bank liczy zdolność tak, jakby oprocentowanie było wyższe o co najmniej 2,5 punktu procentowego. To zabezpieczenie na wypadek wzrostu stóp — dzięki niemu realna rata jest niższa niż maksymalna, którą „udźwignąłbyś" na papierze. Dla kredytów na stałą stopę przez cały okres bufor nie obowiązuje.',
            },
            {
                q: 'Co to jest wskaźnik DStI?',
                a: 'DStI (Debt Service to Income) to udział wszystkich rat w dochodzie netto. Banki zwykle akceptują 40–50% dla przeciętnych dochodów, a wyższy poziom przy wysokich zarobkach. Im niższe zobowiązania, tym większa część dochodu zostaje na nowy kredyt.',
            },
            {
                q: 'Czy ten wynik to gwarancja kredytu?',
                a: 'Nie. To szacunek edukacyjny — każdy bank stosuje własną metodykę (koszty utrzymania per osoba, scoring, akceptowane źródła dochodu). Traktuj wynik jako punkt wyjścia, a ostateczną zdolność potwierdź w banku lub u doradcy.',
            },
        ],
        article: [
            {
                h2: 'Co najbardziej podnosi zdolność kredytową?',
                body: (
                    <p>
                        Największy wpływ mają <strong>dochód netto</strong> i <strong>brak innych zobowiązań</strong> —
                        każda rata kredytu gotówkowego czy limit na karcie obniża kwotę, jaką bank przeznaczy na
                        hipotekę. Zdolność podnosi też <strong>dłuższy okres kredytowania</strong> (niższa rata) oraz
                        dodanie współkredytobiorcy. Zanim złożysz wniosek, warto zamknąć niepotrzebne karty i limity
                        odnawialne — nawet nieużywane obniżają zdolność.
                    </p>
                ),
            },
            {
                h2: 'Dlaczego liczymy z buforem na wzrost stóp?',
                body: (
                    <p>
                        Rekomendacja S KNF nakazuje bankom sprawdzać, czy poradzisz sobie z ratą także wtedy, gdy stopy
                        wzrosną. Dlatego zdolność liczona jest przy oprocentowaniu powiększonym o <strong>minimum 2,5
                        p.p.</strong> To dlatego dwie osoby o tym samym dochodzie mogą mieć różną zdolność w zależności
                        od tego, czy wybiorą zmienne czy okresowo stałe oprocentowanie.
                    </p>
                ),
            },
        ],
    },
    nadplata: {
        path: '/kalkulator-nadplaty-kredytu',
        seoTitle: 'Kalkulator nadpłaty kredytu 2026 — ile zaoszczędzisz',
        seoDescription:
            'Darmowy kalkulator nadpłaty kredytu hipotecznego: policz, ile zaoszczędzisz na odsetkach i o ile skrócisz kredyt dzięki regularnym nadpłatom. Skrócenie okresu lub obniżenie raty.',
        h1: 'Kalkulator nadpłaty kredytu 2026',
        intro:
            'Zobacz, ile realnie zyskasz, nadpłacając kredyt hipoteczny. Policz oszczędność na odsetkach i skrócenie okresu — albo sprawdź, jak nadpłata obniży Twoją miesięczną ratę.',
        ctaHeading: 'Nadpłacasz kredyt? Pilnuj całego budżetu w jednym miejscu',
        ctaBody:
            'W SmartPortfel połączysz kredyt z wydatkami i oszczędnościami, zaplanujesz nadpłaty i zobaczysz, ile wolnych środków realnie możesz przeznaczyć na szybszą spłatę.',
        faq: [
            {
                q: 'Czy opłaca się nadpłacać kredyt hipoteczny?',
                a: 'Zwykle tak — każda nadpłata zmniejsza kapitał, od którego naliczane są odsetki, więc oszczędzasz na całym pozostałym okresie. Im wcześniej nadpłacasz i im wyższe oprocentowanie, tym większa korzyść. Warto porównać ją z alternatywą, np. lokatą po podatku Belki.',
            },
            {
                q: 'Nadpłata: skrócić okres czy obniżyć ratę?',
                a: 'Skrócenie okresu daje największą oszczędność na odsetkach, bo szybciej pozbywasz się długu. Obniżenie raty zmniejsza miesięczne obciążenie i poprawia bezpieczeństwo budżetu, ale odsetkowo jest mniej korzystne. Kalkulator pokazuje oba warianty.',
            },
            {
                q: 'Czy bank pobiera prowizję za nadpłatę kredytu?',
                a: 'Przy kredytach hipotecznych dla konsumentów prowizja za wcześniejszą spłatę może być pobierana zwykle tylko w pierwszych 3 latach (i jest ograniczona ustawowo). Po tym okresie nadpłata jest zazwyczaj bezpłatna. Zawsze sprawdź zapisy swojej umowy.',
            },
            {
                q: 'Ile zaoszczędzę, nadpłacając 500 zł miesięcznie?',
                a: 'Przy kredycie 400 000 zł na 25 lat i oprocentowaniu 7% regularna nadpłata 500 zł miesięcznie potrafi skrócić kredyt o kilka lat i zaoszczędzić kilkadziesiąt tysięcy złotych odsetek. Dokładny wynik policzysz w kalkulatorze dla swoich parametrów.',
            },
        ],
        article: [
            {
                h2: 'Jak nadpłata obniża koszt kredytu?',
                body: (
                    <p>
                        Odsetki naliczane są od <strong>pozostałego kapitału</strong>. Każda złotówka nadpłaty trafia
                        wprost na spłatę kapitału, więc w kolejnych miesiącach odsetki liczone są od niższej kwoty. Efekt
                        kuli śnieżnej sprawia, że nawet niewielkie, ale regularne nadpłaty w pierwszych latach kredytu
                        dają największą oszczędność — wtedy udział odsetek w racie jest najwyższy.
                    </p>
                ),
            },
            {
                h2: 'Nadpłata a poduszka bezpieczeństwa',
                body: (
                    <p>
                        Zanim przeznaczysz nadwyżki na nadpłatę, zadbaj o <strong>poduszkę bezpieczeństwa</strong> (zwykle
                        3–6 miesięcy wydatków). Pieniądze wpłacone na kredyt trudno odzyskać, a rezerwa chroni Cię przed
                        koniecznością zaciągania droższych zobowiązań w razie nagłego wydatku. Dobrą strategią jest
                        równoległe budowanie rezerwy i systematyczna, spokojna nadpłata.
                    </p>
                ),
            },
        ],
    },
};
