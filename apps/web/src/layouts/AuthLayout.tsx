import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AuthHorizon } from '../components/auth/AuthHorizon';
import { AuthCardStack } from '../components/auth/AuthCardStack';
import '../components/auth/auth.css';

interface AuthLayoutProps {
    children: ReactNode;
    /** Rejestracja potrzebuje szerokiego panelu (karty planów) i scrolla na mobile. */
    wide?: boolean;
    /** Logowanie i rejestracja mają różne ilustracje, żeby dało się je rozróżnić. */
    art?: 'horizon' | 'deck';
}

/**
 * Wspólny szkielet ekranów logowania i rejestracji: nawigacja z logo, ilustracja
 * po lewej (od lg wzwyż) i panel z formularzem po prawej.
 */
export function AuthLayout({ children, wide = false, art = 'horizon' }: AuthLayoutProps) {
    return (
        // `lg:h-screen` zamiast samego `min-h-screen`: przy `min-h` wiersz siatki rósł do
        // wysokości formularza, więc panel z ilustracją rozciągał się razem z nim i jego
        // dół (oś czasu) lądował pod krawędzią ekranu. Teraz kolumna ma dokładnie jeden
        // ekran, a ewentualny nadmiar treści scrolluje się wewnątrz prawego panelu.
        <div
            className={`auth relative grid min-h-screen font-sans text-[#f5f5f7] lg:h-screen lg:grid-cols-2 ${
                wide ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-hidden'
            }`}
        >
            <nav className="pointer-events-none absolute left-0 top-0 z-50 flex h-min w-full flex-col items-center justify-center gap-2.5">
                <div className="flex h-min w-full max-w-full items-center justify-between px-6">
                    <div className="relative flex h-min w-full shrink-0 grow basis-0 items-center justify-between px-6 py-6">
                        <div className="relative flex h-min w-min shrink-0 items-center justify-start gap-2.5 opacity-100">
                            <Link
                                to="/"
                                className="auth-display pointer-events-auto text-xl font-semibold text-white transition-opacity hover:opacity-90"
                            >
                                SmartPortfel
                            </Link>
                        </div>
                        {/* Niewidoczny spacer wyrównujący wysokość do CTA landinga (38px) i hamburgera (40px) */}
                        <div className="relative block h-[40px] shrink-0 opacity-0 md:h-[38px]" />
                    </div>
                </div>
            </nav>

            {art === 'deck' ? <AuthCardStack /> : <AuthHorizon />}

            <div
                className={`flex items-center justify-center bg-[#050507] lg:overflow-y-auto ${
                    wide ? 'px-6 pb-8 pt-28 lg:px-8 lg:py-3' : 'px-6 py-8 lg:px-8 lg:py-6'
                }`}
            >
                <div className={`w-full ${wide ? 'max-w-[900px]' : 'max-w-[400px]'}`}>{children}</div>
            </div>
        </div>
    );
}
