import { SEO } from '../components/SEO';

/**
 * Zaślepka — patrz komentarz w PrivacyPolicy.tsx. Regulamin jest umową między
 * konkretnym usługodawcą a jego użytkownikami, więc nie może jechać w kodzie.
 */
const TermsAndConditions = () => {
    return (
        <div className="min-h-screen bg-neutral-950 text-white font-sans selection:bg-emerald-500/30">
            <SEO title="Regulamin" description="Regulamin — do uzupełnienia." url="/regulamin" />
            <div className="max-w-4xl mx-auto px-6 py-24 md:py-32">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tight mb-4 text-white">
                    REGULAMIN
                </h1>

                <div className="mt-12 bg-white/5 p-8 rounded-xl border border-white/10">
                    <p className="text-2xl font-bold text-white mb-3">Do uzupełnienia</p>
                    <p className="text-white/60 leading-relaxed">
                        Ta instancja nie ma jeszcze uzupełnionego regulaminu.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default TermsAndConditions;
