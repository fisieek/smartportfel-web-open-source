import type { PageContent } from './salaryCalculatorsContent';

// Treść stron kalkulatorów oszczędności i PPK (h1, meta, FAQ, artykuły SEO).
// UWAGA: title/description muszą być zgodne z STATIC_PAGES w apps/server/src/seo/seo.ts.

export type SavingsPpkMode = 'oszczednosci' | 'ppk';

export const SAVINGS_PPK_PAGES: Record<SavingsPpkMode, PageContent> = {
    oszczednosci: {
        path: '/kalkulator-oszczednosci',
        seoTitle: 'Kalkulator oszczędności 2026 — lokata i konto z podatkiem Belki',
        seoDescription:
            'Darmowy kalkulator oszczędności: policz, ile uzbierasz na koncie oszczędnościowym lub lokacie. Kapitalizacja miesięczna i roczna, podatek Belki 19%, wykres narastania odsetek.',
        h1: 'Kalkulator oszczędności 2026',
        intro:
            'Sprawdź, ile realnie odłożysz na koncie oszczędnościowym lub lokacie — z regularnymi dopłatami, procentem składanym i podatkiem Belki. Wynik netto, „na rękę", widzisz od razu.',
        ctaHeading: 'Odkładasz? Zobacz, ile realnie rośnie Twój kapitał',
        ctaBody:
            'W SmartPortfel połączysz konta oszczędnościowe i lokaty z resztą finansów, ustawisz cele i będziesz widzieć postęp bez zaglądania do pięciu banków.',
        faq: [
            {
                q: 'Czy od odsetek na lokacie i koncie oszczędnościowym płacę podatek?',
                a: 'Tak — od zysków z odsetek pobierany jest 19-procentowy podatek od zysków kapitałowych, tzw. podatek Belki. Bank potrąca go automatycznie przy kapitalizacji, więc na konto trafiają odsetki już po opodatkowaniu. W kalkulatorze możesz go włączyć lub zobaczyć kwoty brutto.',
            },
            {
                q: 'Czym różni się kapitalizacja miesięczna od rocznej?',
                a: 'Kapitalizacja to moment dopisania odsetek do kapitału. Przy miesięcznej odsetki dopisywane są co miesiąc i od razu pracują (procent składany), więc kwota końcowa jest nieco wyższa niż przy rocznej. Im dłuższy okres i wyższe oprocentowanie, tym różnica jest większa.',
            },
            {
                q: 'Jak działa procent składany?',
                a: 'Procent składany to „odsetki od odsetek". Dopisane odsetki powiększają kapitał, od którego liczone są kolejne — dlatego oszczędności rosną coraz szybciej. Regularne dopłaty miesięczne dodatkowo wzmacniają ten efekt w długim horyzoncie.',
            },
            {
                q: 'Ile uzbieram, odkładając 500 zł miesięcznie?',
                a: 'Przy 500 zł miesięcznie i oprocentowaniu 5% przez 10 lat uzbierasz około 77–78 tys. zł brutto, z czego ponad 15 tys. zł to same odsetki. Dokładna kwota zależy od kapitału startowego, oprocentowania i kapitalizacji — policz swój scenariusz w kalkulatorze.',
            },
        ],
        article: [
            {
                h2: 'Lokata czy konto oszczędnościowe?',
                body: (
                    <p>
                        <strong>Konto oszczędnościowe</strong> daje elastyczność — wpłacasz i wypłacasz kiedy chcesz, a
                        odsetki kapitalizowane są zwykle co miesiąc. <strong>Lokata</strong> zamraża środki na określony
                        czas w zamian za (często) wyższe, gwarantowane oprocentowanie. Oba produkty obejmuje ten sam
                        podatek Belki 19% i gwarancja BFG do 100 000 euro. W kalkulatorze przełącznik kapitalizacji
                        pozwala porównać oba warianty przy tych samych założeniach.
                    </p>
                ),
            },
            {
                h2: 'Dlaczego warto dopłacać regularnie?',
                body: (
                    <p>
                        Systematyczne dopłaty to najprostszy sposób na wykorzystanie procentu składanego. Nawet niewielka
                        kwota odkładana co miesiąc przez wiele lat potrafi urosnąć do sumy znacznie przewyższającej same
                        wpłaty — bo każda złotówka pracuje tym dłużej, im wcześniej trafi na konto. Dlatego czas jest
                        tu ważniejszy niż wysokość pojedynczej wpłaty.
                    </p>
                ),
            },
            {
                h2: 'Pamiętaj o inflacji',
                body: (
                    <p>
                        Kalkulator pokazuje wartości <strong>nominalne</strong> — realną siłę nabywczą Twoich
                        oszczędności obniża inflacja. Jeśli oprocentowanie jest niższe niż inflacja, pieniądze rosną na
                        papierze, ale tracą na wartości. Konto oszczędnościowe świetnie sprawdza się jako poduszka
                        bezpieczeństwa i cel krótkoterminowy; na długi horyzont warto rozważyć też inne formy pomnażania
                        kapitału.
                    </p>
                ),
            },
        ],
    },
    ppk: {
        path: '/kalkulator-ppk',
        seoTitle: 'Kalkulator PPK 2026 — ile kosztuje i ile uzbierasz do 60. roku',
        seoDescription:
            'Darmowy kalkulator PPK: sprawdź, ile realnie kosztuje Cię udział w PPK i ile kapitału uzbierasz do 60. roku życia z dopłatami pracodawcy i państwa. Projekcja z wykresem narastania.',
        h1: 'Kalkulator PPK 2026',
        intro:
            'Zobacz, ile naprawdę kosztuje Cię PPK po odliczeniu dopłat pracodawcy i państwa — i ile kapitału możesz uzbierać do 60. roku życia. Kluczowy insight: 100 zł na koncie kosztuje Cię znacznie mniej.',
        ctaHeading: 'Masz PPK? Śledź swój realny rachunek w SmartPortfel',
        ctaBody:
            'SmartPortfel ma gotowy dashboard PPK: wpłaty Twoje i pracodawcy, dopłaty państwa i aktualną wartość rachunku — obok reszty Twoich finansów.',
        faq: [
            {
                q: 'Ile realnie kosztuje mnie PPK?',
                a: 'Mniej, niż wpłacasz na konto. Przy wpłacie 2% Twoja pensja maleje o 2% brutto, a dodatkowo płacisz PIT od wpłaty pracodawcy. W praktyce każde 100 zł, które ląduje na Twoim koncie PPK, kosztuje Cię około 60–65 zł netto — resztę dokłada pracodawca i państwo.',
            },
            {
                q: 'Ile dokłada pracodawca i państwo?',
                a: 'Pracodawca wpłaca minimum 1,5% Twojego wynagrodzenia (może więcej). Państwo dodaje jednorazową wpłatę powitalną 250 zł oraz dopłatę roczną 240 zł, jeśli spełnisz warunek minimalnych wpłat w roku. To realny „darmowy" zastrzyk do Twojego kapitału.',
            },
            {
                q: 'Dlaczego płacę podatek od wpłaty pracodawcy?',
                a: 'Wpłata pracodawcy do PPK jest traktowana jako Twój przychód, więc doliczana jest do podstawy opodatkowania PIT (12% lub 32%). To dlatego realny koszt netto jest nieco wyższy niż sama Twoja wpłata — kalkulator uwzględnia ten podatek.',
            },
            {
                q: 'Czy mogę wypłacić pieniądze z PPK przed 60. rokiem życia?',
                a: 'Tak, ale z konsekwencjami: tracisz dopłaty państwa, część wpłat pracodawcy wraca do ZUS, a od zysków zapłacisz podatek Belki. PPK najbardziej opłaca się jako oszczędzanie długoterminowe do 60. roku życia — wtedy wypłata jest najkorzystniejsza podatkowo.',
            },
            {
                q: 'Ile uzbieram w PPK do emerytury?',
                a: 'Zależy od pensji, stawek wpłat, wieku i stopy zwrotu. Przy 8000 zł brutto, wpłatach 2% + 1,5% i 5% zwrotu rocznie osoba 30-letnia może uzbierać kilkaset tysięcy złotych do 60. roku — w dużej części z dopłat i zysków z inwestowania. Sprawdź swój scenariusz w kalkulatorze.',
            },
        ],
        article: [
            {
                h2: 'Jak liczymy realny koszt PPK?',
                body: (
                    <p>
                        Twój realny koszt to <strong>Twoja wpłata</strong> (np. 2% brutto) powiększona o{' '}
                        <strong>PIT od wpłaty pracodawcy</strong>, która jest Twoim przychodem. Na Twoje konto trafia
                        jednak suma Twojej wpłaty i wpłaty pracodawcy (min. 3,5% pensji), a raz w roku dochodzą dopłaty
                        państwa. Dlatego stosunek „ile mnie kosztuje" do „ile mam na koncie" jest tak korzystny — to
                        jedna z niewielu sytuacji, w której ktoś realnie dokłada do Twoich oszczędności.
                    </p>
                ),
            },
            {
                h2: 'Dopłaty państwa — powitalna i roczna',
                body: (
                    <p>
                        Państwo zasila Twoje PPK dwa razy: jednorazową <strong>wpłatą powitalną 250 zł</strong> po
                        pierwszych miesiącach oszczędzania oraz coroczną <strong>dopłatą 240 zł</strong>, o ile Twoje
                        wpłaty w danym roku przekroczą ustawowy próg (wpłaty podstawowe od 6-krotności minimalnego
                        wynagrodzenia). Przy standardowej wpłacie 2% od typowej pensji warunek jest zwykle spełniony.
                    </p>
                ),
            },
            {
                h2: 'Projekcja to symulacja, nie gwarancja',
                body: (
                    <p>
                        Kapitał na 60. rok liczymy przy <strong>stałym wynagrodzeniu</strong> i{' '}
                        <strong>założonej stopie zwrotu</strong> — realny wynik zależy od podwyżek, zmian stawek i
                        wyników funduszy, które inwestują środki PPK. Traktuj projekcję jako orientacyjny obraz siły
                        procentu składanego w długim horyzoncie, a nie obietnicę konkretnej kwoty.
                    </p>
                ),
            },
        ],
    },
};
