import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';
import LandingNav from '../components/LandingV2/LandingNav';
import Footer from '../components/LandingV2/Footer';
import SalaryCalculator, { type SalaryMode } from '../components/salary/SalaryCalculator';
import { SALARY_PAGES } from './salaryCalculatorsContent';

/**
 * Publiczna (bez logowania) strona kalkulatora wynagrodzeń — magnes SEO.
 * Jeden layout, trzy trasy (UoP / zlecenie / B2B) — treść z SALARY_PAGES.
 */
export default function SalaryCalculatorPage({ mode }: { mode: SalaryMode }) {
    const content = SALARY_PAGES[mode];

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: content.faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
    };

    const related = [
        { path: '/kalkulatory', label: 'Wszystkie kalkulatory' },
        { path: '/kalkulator-kredytu', label: 'Kalkulator kredytu' },
        ...(Object.values(SALARY_PAGES)
            .filter((p) => p.path !== content.path)
            .map((p) => ({ path: p.path, label: p.h1.replace(/ \d{4}.*$/, '') }))),
    ];

    return (
        <div className="bg-white min-h-screen flex flex-col text-neutral-900" style={{ color: '#000000' }}>
            <SEO
                title={content.seoTitle}
                description={content.seoDescription}
                url={content.path}
                jsonLd={faqJsonLd}
            />
            <LandingNav />

            <main className="flex-grow pt-[100px]">
                {/* Hero */}
                <div className="text-center py-12 px-4 max-w-3xl mx-auto">
                    <h1 className="text-4xl md:text-5xl font-light mb-5 [font-family:'Space_Grotesk',sans-serif] tracking-tight text-gray-900">
                        {content.h1}
                    </h1>
                    <p className="text-lg text-gray-700">{content.intro}</p>
                </div>

                {/* Kalkulator w ciemnym panelu */}
                <div className="px-4 pb-16 max-w-4xl mx-auto w-full">
                    <div className="bg-[#0B0B0B] rounded-2xl p-5 md:p-8 shadow-2xl border border-black/5">
                        <SalaryCalculator mode={mode} />
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-3">
                        Wynik ma charakter szacunkowy i nie stanowi porady podatkowej ani oferty w rozumieniu Kodeksu
                        cywilnego. Stan prawny: 2026.
                    </p>
                </div>

                {/* CTA */}
                <div className="bg-neutral-50 border-y border-neutral-200 py-14 px-4">
                    <div className="max-w-2xl mx-auto text-center">
                        <h2 className="text-2xl md:text-3xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                            {content.ctaHeading}
                        </h2>
                        <p className="text-gray-700 mb-6">{content.ctaBody}</p>
                        <Link
                            to="/register"
                            className="inline-block bg-black text-white font-bold px-8 py-3.5 rounded-full hover:bg-neutral-800 transition-colors"
                        >
                            Załóż darmowe konto
                        </Link>
                    </div>
                </div>

                {/* Treść SEO / wyjaśnienia */}
                <article className="max-w-3xl mx-auto px-4 py-14 text-gray-800 leading-relaxed space-y-8">
                    {content.article.map((section) => (
                        <section key={section.h2}>
                            <h2 className="text-2xl font-semibold mb-3 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                                {section.h2}
                            </h2>
                            {section.body}
                        </section>
                    ))}
                </article>

                {/* FAQ */}
                <section className="max-w-3xl mx-auto px-4 pb-14">
                    <h2 className="text-2xl font-semibold mb-6 text-gray-900 [font-family:'Space_Grotesk',sans-serif]">
                        Najczęstsze pytania
                    </h2>
                    <div className="space-y-6">
                        {content.faq.map((item) => (
                            <div key={item.q}>
                                <h3 className="font-semibold text-gray-900 mb-1.5">{item.q}</h3>
                                <p className="text-gray-700">{item.a}</p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Pozostałe kalkulatory */}
                <section className="max-w-3xl mx-auto px-4 pb-16">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">
                        Pozostałe kalkulatory
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {related.map((r) => (
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
