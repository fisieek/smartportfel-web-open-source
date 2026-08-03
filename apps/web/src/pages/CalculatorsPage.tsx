import { Link } from 'react-router-dom';
import { Landmark, Wallet, FileSignature, Briefcase, PiggyBank, TrendingUp, Home, Percent, ArrowRight } from 'lucide-react';
import { SEO } from '../components/SEO';
import LandingNav from '../components/LandingV2/LandingNav';
import Footer from '../components/LandingV2/Footer';

const CALCULATORS = [
    {
        path: '/kalkulator-wynagrodzen',
        icon: Wallet,
        title: 'Kalkulator wynagrodzeń brutto–netto',
        description: 'Ile dostaniesz na rękę z umowy o pracę — z PPK, ulgą dla młodych i przeliczaniem w obie strony.',
    },
    {
        path: '/kalkulator-umowa-zlecenie',
        icon: FileSignature,
        title: 'Kalkulator umowy zlecenia',
        description: 'Netto ze zlecenia — także dla uczniów i studentów do 26 lat (zero składek i podatku).',
    },
    {
        path: '/kalkulator-b2b',
        icon: Briefcase,
        title: 'Kalkulator B2B',
        description: 'Ile zostaje z faktury: porównanie skali, liniowego i ryczałtu przy Twoim ZUS-ie.',
    },
    {
        path: '/kalkulator-oszczednosci',
        icon: PiggyBank,
        title: 'Kalkulator oszczędności',
        description: 'Konto oszczędnościowe i lokata — z podatkiem Belki i wykresem narastania odsetek.',
    },
    {
        path: '/kalkulator-ppk',
        icon: TrendingUp,
        title: 'Kalkulator PPK',
        description: 'Ile realnie kosztuje Cię PPK i ile uzbierasz do 60-tki z dopłatami państwa.',
    },
    {
        path: '/kalkulator-zdolnosci-kredytowej',
        icon: Percent,
        title: 'Kalkulator zdolności kredytowej',
        description: 'Sprawdź, na jaki kredyt hipoteczny możesz liczyć — DStI i bufor stopy KNF.',
    },
    {
        path: '/kalkulator-nadplaty-kredytu',
        icon: Home,
        title: 'Kalkulator nadpłaty kredytu',
        description: 'Ile zaoszczędzisz i o ile skrócisz kredyt dzięki regularnym nadpłatom.',
    },
    {
        path: '/kalkulator-kredytu',
        icon: Landmark,
        title: 'Kalkulator kredytu',
        description: 'Rata, całkowity koszt i harmonogram spłaty. Symulacja nadpłaty i zmiany WIBOR/WIRON.',
    },
] as const;

const COMING_SOON: ReadonlyArray<{ icon: typeof Percent; title: string; description: string }> = [];

/** Publiczny hub darmowych kalkulatorów finansowych — magnes SEO. */
export default function CalculatorsPage() {
    return (
        <div className="bg-white min-h-screen flex flex-col text-neutral-900" style={{ color: '#000000' }}>
            <SEO
                title="Darmowe kalkulatory finansowe online"
                description="Darmowe kalkulatory finansowe: wynagrodzeń brutto-netto (UoP, zlecenie, B2B) i kredytu hipotecznego. Bez rejestracji, aktualne stawki 2026, pełne rozbicie wyników."
                url="/kalkulatory"
            />
            <LandingNav />

            <main className="flex-grow pt-[100px]">
                {/* Hero */}
                <div className="text-center py-12 px-4 max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-light mb-5 [font-family:'Space_Grotesk',sans-serif] tracking-tight text-gray-900">
                        Darmowe kalkulatory finansowe
                    </h1>
                    <p className="text-lg text-gray-700">
                        Policz pensję, fakturę i ratę kredytu — bez rejestracji, na aktualnych stawkach 2026, z pełnym
                        rozbiciem „skąd ta kwota".
                    </p>
                </div>

                {/* Karty kalkulatorów */}
                <div className="max-w-4xl mx-auto px-4 pb-10 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {CALCULATORS.map((calc) => (
                        <Link
                            key={calc.path}
                            to={calc.path}
                            className="group border border-neutral-200 rounded-2xl p-6 hover:border-black hover:shadow-lg transition-all"
                        >
                            <calc.icon size={24} className="text-gray-900 mb-3" />
                            <h2 className="text-lg font-semibold text-gray-900 mb-1.5 [font-family:'Space_Grotesk',sans-serif]">
                                {calc.title}
                            </h2>
                            <p className="text-sm text-gray-600 mb-3">{calc.description}</p>
                            <span className="inline-flex items-center gap-1 text-sm font-bold text-gray-900 group-hover:gap-2 transition-all">
                                Przelicz <ArrowRight size={14} />
                            </span>
                        </Link>
                    ))}
                    {COMING_SOON.map((calc) => (
                        <div key={calc.title} className="border border-neutral-200 rounded-2xl p-6 opacity-60">
                            <div className="flex items-start justify-between">
                                <calc.icon size={24} className="text-gray-400 mb-3" />
                                <span className="bg-neutral-200 text-neutral-500 text-[10px] font-bold uppercase tracking-widest rounded-full px-2 py-0.5">
                                    Wkrótce
                                </span>
                            </div>
                            <h2 className="text-lg font-semibold text-gray-500 mb-1.5 [font-family:'Space_Grotesk',sans-serif]">
                                {calc.title}
                            </h2>
                            <p className="text-sm text-gray-400">{calc.description}</p>
                        </div>
                    ))}
                </div>

                {/* CTA */}
                <div className="bg-neutral-50 border-y border-neutral-200 py-14 px-4">
                    <div className="max-w-2xl mx-auto text-center">
                        <h2 className="text-2xl md:text-3xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            Kalkulatory to dopiero początek
                        </h2>
                        <p className="text-gray-700 mb-6">
                            SmartPortfel łączy Twoje wydatki, budżet, oszczędności, inwestycje i kredyty w jednym
                            miejscu — z aplikacją na telefon i automatycznymi podsumowaniami.
                        </p>
                        <Link
                            to="/register"
                            className="inline-block bg-black text-white font-bold px-8 py-3.5 rounded-full hover:bg-neutral-800 transition-colors"
                        >
                            Załóż darmowe konto
                        </Link>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
}
