import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import LandingNav from '../components/LandingV2/LandingNav';
import Footer from '../components/LandingV2/Footer';
import LoanCalculator from '../components/LoanCalculator';

const RELATED = [
    { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
    { path: '/kalkulator-zdolnosci-kredytowej', label: 'Kalkulator zdolności' },
    { path: '/kalkulator-nadplaty-kredytu', label: 'Kalkulator nadpłaty' },
    { path: '/kalkulator-wynagrodzen', label: 'Kalkulator wynagrodzeń' },
    { path: '/kalkulator-oszczednosci', label: 'Kalkulator oszczędności' },
];

/**
 * Publiczna (bez logowania) strona kalkulatora kredytu — magnes SEO.
 * Reużywa komponent `LoanCalculator` z aplikacji, osadzony w ciemnym panelu na jasnej stronie.
 */
export default function LoanCalculatorPage() {
    return (
        <div className="bg-white min-h-screen flex flex-col text-neutral-900" style={{ color: '#000000' }}>
            <SEO
                title="Kalkulator kredytu hipotecznego i gotówkowego"
                description="Darmowy kalkulator kredytu: oblicz ratę, całkowity koszt i harmonogram spłaty. Sprawdź ratę równą i malejącą, zasymuluj nadpłatę oraz zmianę stopy WIBOR/WIRON."
                url="/kalkulator-kredytu"
            />
            <LandingNav />

            <main className="flex-grow pt-[100px]">
                {/* Hero */}
                <div className="text-center py-12 px-4 max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-light mb-5 [font-family:'Space_Grotesk',sans-serif] tracking-tight text-gray-900">
                        Kalkulator kredytu
                    </h1>
                    <p className="text-lg text-gray-700">
                        Oblicz ratę, całkowity koszt i harmonogram spłaty kredytu hipotecznego lub gotówkowego.
                        Porównaj raty równe i malejące, zasymuluj nadpłatę i sprawdź, co się stanie, gdy zmieni się WIBOR/WIRON.
                    </p>
                </div>

                {/* Kalkulator w ciemnym panelu */}
                <div className="px-4 pb-16 max-w-4xl mx-auto w-full">
                    <div className="bg-[#0B0B0B] rounded-2xl p-5 md:p-8 shadow-2xl border border-black/5">
                        <LoanCalculator />
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-3">
                        Wyniki mają charakter szacunkowy i nie stanowią oferty w rozumieniu Kodeksu cywilnego.
                    </p>
                </div>

                {/* CTA */}
                <div className="bg-neutral-50 border-y border-neutral-200 py-14 px-4">
                    <div className="max-w-2xl mx-auto text-center">
                        <h2 className="text-2xl md:text-3xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            Śledź swój kredyt w jednym miejscu
                        </h2>
                        <p className="text-gray-700 mb-6">
                            W SmartPortfel zapiszesz swój kredyt, będziesz na bieżąco rejestrować spłaty i nadpłaty,
                            a aplikacja pokaże postęp i pozostałe zadłużenie — razem z resztą Twoich finansów.
                        </p>
                        <Link
                            to="/register"
                            className="inline-block bg-black text-white font-bold px-8 py-3.5 rounded-full hover:bg-neutral-800 transition-colors"
                        >
                            Załóż darmowe konto
                        </Link>
                    </div>
                </div>

                {/* Treść SEO / wyjaśnienia */}
                <article className="max-w-3xl mx-auto px-4 py-14 prose-headings:font-semibold text-gray-800 leading-relaxed space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            Jak liczona jest rata kredytu?
                        </h2>
                        <p>
                            Rata kredytu składa się z części kapitałowej (spłata pożyczonej kwoty) i odsetkowej (koszt
                            pożyczki). Oprocentowanie to suma <strong>marży banku</strong> (stałej przez cały okres) oraz
                            <strong> stawki referencyjnej</strong> (WIBOR, a dla nowych kredytów stopniowo WIRON), która
                            zmienia się w czasie. Nasz kalkulator wylicza ratę metodą annuitetową (raty równe) lub liniową
                            (raty malejące) na podstawie tych dwóch składników.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            Raty równe czy malejące?
                        </h2>
                        <p>
                            Przy <strong>ratach równych</strong> płacisz co miesiąc tę samą kwotę — na początku przeważają
                            odsetki, z czasem rośnie udział kapitału. Przy <strong>ratach malejących</strong> część
                            kapitałowa jest stała, więc pierwsze raty są wyższe, ale maleją z każdym miesiącem, a
                            <strong> łączny koszt odsetek jest niższy</strong>. Raty malejące wymagają wyższej zdolności
                            kredytowej na starcie.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            Czy warto nadpłacać kredyt?
                        </h2>
                        <p>
                            Nadpłata zmniejsza kapitał, od którego naliczane są odsetki, więc realnie obniża całkowity koszt
                            kredytu. Możesz wybrać dwie strategie: <strong>skrócenie okresu</strong> (rata bez zmian, kredyt
                            spłacasz szybciej — większa oszczędność na odsetkach) lub <strong>obniżenie raty</strong>
                            (okres bez zmian, niższe miesięczne obciążenie). Skorzystaj z symulacji nadpłaty powyżej, aby
                            porównać oba warianty dla swojego kredytu.
                        </p>
                    </section>
                </article>

                {/* Pozostałe kalkulatory */}
                <section className="max-w-3xl mx-auto px-4 pb-16">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                        Pozostałe kalkulatory
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {RELATED.map((r) => (
                            <Link
                                key={r.path}
                                to={r.path}
                                className="px-4 py-2 text-sm rounded-full border border-neutral-300 text-gray-700 hover:border-black hover:text-black transition-colors"
                            >
                                {r.label}
                            </Link>
                        ))}
                    </div>
                </section>
            </main>

            <Footer />
        </div>
    );
}
