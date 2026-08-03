import type { ReactNode } from 'react';
import type { SalaryMode } from '../components/salary/SalaryCalculator';

// Treść stron kalkulatorów wynagrodzeń (h1, meta, FAQ, artykuły SEO).
// UWAGA: title/description muszą być zgodne z STATIC_PAGES w apps/server/src/seo/seo.ts
// (serwer wstrzykuje meta dla crawlerów bez JS).

export interface FaqItem {
    q: string;
    /** Czysty tekst — trafia do JSON-LD FAQPage i do renderu */
    a: string;
}

export interface PageContent {
    path: string;
    seoTitle: string;
    seoDescription: string;
    h1: string;
    intro: string;
    ctaHeading: string;
    ctaBody: string;
    faq: FaqItem[];
    article: Array<{ h2: string; body: ReactNode }>;
}

export const SALARY_PAGES: Record<SalaryMode, PageContent> = {
    uop: {
        path: '/kalkulator-wynagrodzen',
        seoTitle: 'Kalkulator wynagrodzeń brutto-netto 2026 (umowa o pracę)',
        seoDescription:
            'Darmowy kalkulator wynagrodzeń 2026: przelicz brutto na netto (i odwrotnie) na umowie o pracę. Składki ZUS, zdrowotna, PIT, PPK i ulga dla młodych — z pełnym rozbiciem „skąd ta kwota".',
        h1: 'Kalkulator wynagrodzeń brutto–netto 2026',
        intro:
            'Sprawdź, ile dostaniesz „na rękę" z pensji brutto na umowie o pracę — albo policz, jakiego brutto potrzebujesz, żeby osiągnąć wymarzone netto. Aktualne stawki 2026, PPK i ulga dla młodych.',
        ctaHeading: 'Wiesz już, ile zarabiasz. A wiesz, ile z tego zostaje?',
        ctaBody:
            'W SmartPortfel połączysz pensję z codziennymi wydatkami, budżetem i oszczędnościami — zobaczysz, ile naprawdę zostaje Ci co miesiąc i na co ucieka reszta.',
        faq: [
            {
                q: 'Ile to jest 8000 zł brutto netto w 2026 roku?',
                a: 'Na umowie o pracę z podstawowymi kosztami uzyskania i PIT-2 z 8000 zł brutto otrzymasz około 5784 zł netto. Potrącenia to składki ZUS (1096,80 zł), składka zdrowotna (621,29 zł) i zaliczka na podatek (498 zł).',
            },
            {
                q: 'Ile wynosi minimalna krajowa 2026 netto?',
                a: 'Minimalne wynagrodzenie w 2026 r. to 4806 zł brutto, czyli około 3606 zł netto na pełnym etacie (przy podstawowych kosztach uzyskania i złożonym PIT-2).',
            },
            {
                q: 'Co obniża moją pensję z brutto do netto?',
                a: 'Z pensji brutto potrącane są: składka emerytalna (9,76%), rentowa (1,5%), chorobowa (2,45%), składka zdrowotna (9% od brutto pomniejszonego o składki społeczne) oraz zaliczka na PIT (12% lub 32%). Jeśli oszczędzasz w PPK, dochodzi też Twoja wpłata (0,5–4%).',
            },
            {
                q: 'Jak działa ulga dla młodych (zerowy PIT do 26 lat)?',
                a: 'Osoby do 26. roku życia nie płacą podatku dochodowego od przychodów z umowy o pracę i zlecenia do limitu 85 528 zł rocznie. Składki ZUS i zdrowotna są naliczane normalnie — netto rośnie o kwotę zaliczki PIT.',
            },
            {
                q: 'Czy PPK obniża moje wynagrodzenie netto?',
                a: 'Tak, Twoja wpłata (standardowo 2% brutto) pomniejsza wypłatę, a wpłata pracodawcy (min. 1,5%) jest doliczana do podstawy opodatkowania. W zamian na Twoje konto PPK trafia łącznie 3,5% pensji plus dopłaty państwa.',
            },
        ],
        article: [
            {
                h2: 'Jak liczymy netto z brutto?',
                body: (
                    <p>
                        Od pensji brutto najpierw odejmowane są <strong>składki społeczne</strong> finansowane przez
                        pracownika: emerytalna 9,76%, rentowa 1,5% i chorobowa 2,45% (łącznie 13,71%). Od tak
                        pomniejszonej kwoty naliczana jest <strong>składka zdrowotna 9%</strong>. Następnie od podstawy
                        (brutto minus składki społeczne i koszty uzyskania przychodu 250/300 zł) liczona jest{' '}
                        <strong>zaliczka na PIT</strong> — 12% do progu 120 000 zł rocznie i 32% powyżej, pomniejszona o
                        kwotę zmniejszającą 300 zł miesięcznie (PIT-2). To, co zostanie, to Twoje netto.
                    </p>
                ),
            },
            {
                h2: 'Brutto czy netto — o czym rozmawiać na rekrutacji?',
                body: (
                    <p>
                        Pracodawcy podają wynagrodzenie <strong>brutto</strong>, bo to od niego zależą ich koszty (do
                        Twojego brutto dokładają jeszcze ok. 20% składek po swojej stronie). Dla Ciebie liczy się{' '}
                        <strong>netto</strong> — dlatego w kalkulatorze możesz liczyć w obie strony: wpisz oczekiwane
                        netto, a policzymy, jakiego brutto zażądać. Pamiętaj, że dodatki (premie, nadgodziny) też są
                        opodatkowane, a benefity pozapłacowe (np. pakiet medyczny) zwykle doliczane do przychodu.
                    </p>
                ),
            },
            {
                h2: 'Dlaczego moje netto w grudniu może być inne niż w styczniu?',
                body: (
                    <p>
                        Kalkulator pokazuje typowy miesiąc, ale w ciągu roku netto potrafi się zmieniać: po
                        przekroczeniu <strong>progu 120 000 zł</strong> dochodu zaliczka rośnie do 32%, a po
                        przekroczeniu <strong>limitu 30-krotności</strong> (podstawa składek emerytalno-rentowych)
                        składki przestają być pobierane i netto rośnie. Dobrze zarabiający często widzą wyższe wypłaty
                        w końcówce roku — a potem „powrót do normy" w styczniu.
                    </p>
                ),
            },
        ],
    },
    zlecenie: {
        path: '/kalkulator-umowa-zlecenie',
        seoTitle: 'Kalkulator umowy zlecenia 2026 — brutto netto',
        seoDescription:
            'Darmowy kalkulator umowy zlecenia 2026: ile dostaniesz na rękę ze zlecenia. Student do 26 lat bez składek, dobrowolna chorobowa, koszty 20% — pełne rozbicie potrąceń.',
        h1: 'Kalkulator umowy zlecenia 2026',
        intro:
            'Policz, ile dostaniesz na rękę z umowy zlecenia. Uwzględniamy zwolnienie dla uczniów i studentów do 26 lat, dobrowolną składkę chorobową i 20-procentowe koszty uzyskania przychodu.',
        ctaHeading: 'Dorabiasz na zleceniach? Miej wszystkie wpływy pod kontrolą',
        ctaBody:
            'W SmartPortfel zapiszesz wpływy z różnych umów, zobaczysz je na jednej osi czasu i sprawdzisz, ile realnie zarabiasz miesięcznie — za darmo.',
        faq: [
            {
                q: 'Ile dostanę na rękę z umowy zlecenia jako student?',
                a: 'Uczniowie i studenci do 26. roku życia nie płacą ze zlecenia ani składek ZUS, ani podatku — dostają całą kwotę brutto. 3000 zł brutto to 3000 zł na rękę.',
            },
            {
                q: 'Jakie składki płacę na umowie zlecenia?',
                a: 'Jeśli zlecenie jest Twoim jedynym tytułem do ubezpieczeń: emerytalną (9,76%), rentową (1,5%) i zdrowotną (9%). Składka chorobowa jest dobrowolna (2,45%) — bez niej nie masz prawa do zasiłku chorobowego.',
            },
            {
                q: 'Czy na zleceniu obowiązują koszty uzyskania przychodu?',
                a: 'Tak — standardowo 20% przychodu pomniejszonego o składki społeczne (a przy przeniesieniu praw autorskich nawet 50%). Obniżają one podstawę opodatkowania, więc podatek jest niższy niż na etacie przy tej samej kwocie.',
            },
            {
                q: 'Czym różni się zlecenie od umowy o pracę pod względem netto?',
                a: 'Przy tej samej kwocie brutto netto ze zlecenia bywa wyższe (koszty 20%, brak obowiązkowej chorobowej), ale zlecenie nie daje płatnego urlopu, okresu wypowiedzenia ani pełnej ochrony kodeksu pracy.',
            },
        ],
        article: [
            {
                h2: 'Zlecenie a ZUS — kiedy składki są obowiązkowe?',
                body: (
                    <p>
                        Jeśli zlecenie to Twój <strong>jedyny tytuł do ubezpieczeń</strong>, obowiązkowe są składki
                        emerytalna, rentowa i zdrowotna, a chorobowa jest dobrowolna. Jeżeli jednocześnie pracujesz na
                        etacie i zarabiasz tam co najmniej minimalną krajową, ze zlecenia u innego podmiotu płacisz
                        zwykle tylko składkę zdrowotną. Nasz kalkulator zakłada pierwszy wariant — najczęstszy przy
                        „czystym" zleceniu.
                    </p>
                ),
            },
            {
                h2: 'Student do 26 lat — najtańsza legalna forma pracy',
                body: (
                    <p>
                        Uczniowie i studenci do ukończenia 26. roku życia są <strong>zwolnieni ze składek ZUS</strong> na
                        zleceniu, a dzięki uldze dla młodych nie płacą też PIT (do 85 528 zł przychodu rocznie). W
                        praktyce: kwota brutto z umowy = kwota na rękę. To dlatego zlecenie jest standardem przy pracy
                        studenckiej — dla zleceniodawcy też jest najtańsze.
                    </p>
                ),
            },
            {
                h2: 'Dobrowolna chorobowa — czy warto?',
                body: (
                    <p>
                        Składka chorobowa na zleceniu kosztuje <strong>2,45% brutto</strong> (np. 122,50 zł przy 5000
                        zł) i daje prawo do zasiłku chorobowego oraz macierzyńskiego. Jeśli zlecenie to Twoje główne
                        źródło dochodu na dłużej — warto ją rozważyć; przy krótkiej dorywczej pracy większość osób z
                        niej rezygnuje.
                    </p>
                ),
            },
        ],
    },
    b2b: {
        path: '/kalkulator-b2b',
        seoTitle: 'Kalkulator B2B 2026 — ile zostaje na rękę z faktury',
        seoDescription:
            'Darmowy kalkulator B2B 2026: porównaj skalę, podatek liniowy i ryczałt przy Twoich przychodach. Składki ZUS (ulga na start, preferencyjny, pełny), zdrowotna per forma — ile realnie zostaje.',
        h1: 'Kalkulator B2B 2026 — ile zostaje z faktury',
        intro:
            'Wystaw fakturę i zobacz, ile naprawdę zostanie Ci w kieszeni. Porównujemy trzy formy opodatkowania obok siebie — skalę, liniowy i ryczałt — z właściwą składką zdrowotną i wybranym wariantem ZUS.',
        ctaHeading: 'Prowadzisz działalność? Ogarnij finanse firmowe i prywatne w jednym miejscu',
        ctaBody:
            'W SmartPortfel połączysz wpływy z faktur z domowym budżetem, odłożysz na podatki i zobaczysz realny obraz swoich pieniędzy — bez arkuszy kalkulacyjnych.',
        faq: [
            {
                q: 'Która forma opodatkowania B2B jest najlepsza w 2026?',
                a: 'To zależy od dochodu i kosztów. Przy niższych dochodach często wygrywa skala (kwota wolna i 12%), przy wysokich — liniowy 19% (zdrowotna 4,9%), a przy niskich kosztach i odpowiedniej stawce — ryczałt. Nasz kalkulator porównuje wszystkie trzy przy Twoich liczbach.',
            },
            {
                q: 'Ile wynosi pełny ZUS na działalności w 2026?',
                a: 'Składki społeczne z dobrowolną chorobową to 1926,76 zł miesięcznie (podstawa 5652 zł). Do tego dochodzi składka zdrowotna zależna od formy opodatkowania i dochodu — minimum 432,54 zł.',
            },
            {
                q: 'Jak liczona jest składka zdrowotna na B2B?',
                a: 'Na skali to 9% dochodu, na liniowym 4,9% dochodu (obie minimum 432,54 zł/mies.), a na ryczałcie stała kwota zależna od rocznego przychodu: 498,35 zł (do 60 tys.), 830,58 zł (60–300 tys.) lub 1495,04 zł (powyżej 300 tys.).',
            },
            {
                q: 'Czym jest ulga na start i ZUS preferencyjny?',
                a: 'Ulga na start to 6 miesięcy bez składek społecznych (płacisz tylko zdrowotną). Potem przez 24 miesiące możesz płacić ZUS preferencyjny od podstawy 30% minimalnej krajowej (ok. 456 zł zamiast ok. 1927 zł).',
            },
            {
                q: 'Ile z faktury 15 000 zł zostaje na rękę na B2B?',
                a: 'Przykładowo na podatku liniowym przy pełnym ZUS i 1500 zł kosztów zostaje około 8900–9100 zł. Dokładna kwota zależy od formy opodatkowania i wariantu ZUS — sprawdź swój przypadek w kalkulatorze.',
            },
        ],
        article: [
            {
                h2: 'Skala, liniowy czy ryczałt — jak wybrać?',
                body: (
                    <p>
                        <strong>Skala podatkowa</strong> (12/32%) opłaca się przy niższych dochodach — korzystasz z
                        kwoty wolnej 30 000 zł i możesz rozliczyć się wspólnie z małżonkiem. <strong>Liniowy 19%</strong>{' '}
                        wygrywa przy wysokich dochodach, bo nie ma drugiego progu, a zdrowotna to tylko 4,9%.{' '}
                        <strong>Ryczałt</strong> bywa najkorzystniejszy, gdy masz niskie koszty i stawkę 8,5–12% — ale
                        podatek płacisz od przychodu, nie od dochodu. Formę zmienia się raz w roku, zwykle do 20 lutego.
                    </p>
                ),
            },
            {
                h2: 'B2B kontra etat — porównuj netto z netto',
                body: (
                    <p>
                        Stawka na B2B wygląda atrakcyjnie, ale pamiętaj, że z faktury sam opłacasz{' '}
                        <strong>składki ZUS, zdrowotną i podatek</strong>, nie masz płatnego urlopu, chorobowego ani
                        okresu wypowiedzenia. Zasada kciuka: żeby wyjść „na zero" względem etatu, faktura powinna być o
                        ok. 20–30% wyższa niż koszt pracodawcy na umowie o pracę. Ten kalkulator pokaże Ci twarde
                        liczby po stronie B2B — zestaw je z wynikiem kalkulatora wynagrodzeń.
                    </p>
                ),
            },
            {
                h2: 'O czym pamiętać poza podatkiem?',
                body: (
                    <p>
                        Wynik kalkulatora to kwota po ZUS i podatku, ale przed <strong>rezerwami</strong>, które warto
                        odkładać samodzielnie: na urlop, chorobę, okresy bez zleceń i księgowość. Dobrą praktyką jest
                        traktowanie 10–15% każdej faktury jako „niewidzialnych" pieniędzy odkładanych na osobne konto —
                        wtedy B2B daje wolność bez nieprzyjemnych niespodzianek.
                    </p>
                ),
            },
        ],
    },
};
