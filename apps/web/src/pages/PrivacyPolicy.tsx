import { SEO } from '../components/SEO';

/**
 * Zaślepka.
 *
 * Treść polityki prywatności jest ściśle związana z konkretnym podmiotem, który prowadzi
 * instancję: to on jest administratorem danych i to jego dane kontaktowe muszą tu stać.
 * Publiczne repozytorium nie może narzucać cudzej instancji ani czyjegoś adresu, więc
 * strona istnieje (jest podlinkowana ze stopki i z rejestracji), ale jest pusta z założenia.
 *
 * Uzupełnij ją przed udostępnieniem instancji komukolwiek poza sobą.
 */
const PrivacyPolicy = () => {
    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-emerald-500/30">
            <SEO title="Polityka Prywatności" description="Polityka prywatności — do uzupełnienia." url="/polityka-prywatnosci" />
            <div className="max-w-4xl mx-auto px-6 py-24 md:py-32">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">
                    POLITYKA PRYWATNOŚCI
                </h1>

                <div className="mt-12 bg-white/5 p-8 rounded-xl border border-white/10">
                    <p className="text-2xl font-bold text-white mb-3">Do uzupełnienia</p>
                    <p className="text-white/60 leading-relaxed">
                        Ta instancja nie ma jeszcze uzupełnionej polityki prywatności.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
