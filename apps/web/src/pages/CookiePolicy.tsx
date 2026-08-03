import { SEO } from '../components/SEO';

/**
 * Zaślepka — patrz komentarz w PrivacyPolicy.tsx.
 *
 * Świeży klon nie ładuje żadnej analityki ani zewnętrznych skryptów, więc jedyne, co
 * aplikacja trzyma w przeglądarce, to dane niezbędne do działania (token logowania
 * i preferencje interfejsu w localStorage). Jeśli dołożysz do swojej instancji cokolwiek
 * ponad to, opisz to tutaj.
 */
const CookiePolicy = () => {
    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-emerald-500/30">
            <SEO title="Polityka Cookies" description="Polityka cookies — do uzupełnienia." url="/polityka-cookies" />
            <div className="max-w-4xl mx-auto px-6 py-24 md:py-32">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">
                    POLITYKA COOKIES
                </h1>

                <div className="mt-12 bg-white/5 p-8 rounded-xl border border-white/10">
                    <p className="text-2xl font-bold text-white mb-3">Do uzupełnienia</p>
                    <p className="text-white/60 leading-relaxed">
                        Ta instancja nie ma jeszcze uzupełnionej polityki cookies.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default CookiePolicy;
