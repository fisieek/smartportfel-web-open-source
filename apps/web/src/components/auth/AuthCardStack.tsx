import type { CSSProperties } from 'react';
import './auth.css';

type AuthStyle = CSSProperties & { '--auth-delay'?: string };

/** Słupki wydatków — wysokości w procentach. */
const BARS = [42, 68, 35, 84, 56, 30, 74, 48, 90, 62, 38, 70];

/**
 * Ilustracja ekranu logowania: trzy przechylone szklane karty produktu.
 * Rejestracja dostaje `AuthHorizon`, żeby oba ekrany dało się rozróżnić.
 * Czysty CSS + jeden <svg>, bez zależności. Dekoracja, więc aria-hidden.
 */
export function AuthCardStack() {
    return (
        <div aria-hidden="true" className="auth-grain relative hidden overflow-hidden lg:block">
            <div className="auth-aurora">
                <div className="auth-aurora__blob auth-aurora__blob--1" />
                <div className="auth-aurora__blob auth-aurora__blob--2" />
                <div className="auth-aurora__blob auth-aurora__blob--3" />
            </div>

            <div className="auth-deck">
                {/* Kredyt — najdalsza karta */}
                <div
                    className="auth-deck__card auth-deck__card--back"
                    style={{ '--auth-delay': '0.15s' } as AuthStyle}
                >
                    <div className="auth-deck__chrome">
                        <i />
                        <i />
                        <i />
                    </div>
                    <div className="mb-2 flex items-center justify-between text-[10px] text-white/45">
                        <span>Kredyt hipoteczny</span>
                        <span className="auth-display text-white/70">40 268 / 500 000</span>
                    </div>
                    <div className="auth-deck__bar">
                        <i style={{ width: '8.1%' }} />
                    </div>
                </div>

                {/* Wydatki — karta środkowa */}
                <div
                    className="auth-deck__card auth-deck__card--mid"
                    style={{ '--auth-delay': '0.3s' } as AuthStyle}
                >
                    <div className="auth-deck__chrome">
                        <i />
                        <i />
                        <i />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/45">
                        <span>Wydatki — lipiec</span>
                        <span className="auth-display text-white/70">3 842,15 zł</span>
                    </div>
                    <div className="mt-2.5 flex h-8 items-end gap-[3px]">
                        {BARS.map((height, i) => (
                            <i
                                key={i}
                                style={{ height: `${height}%` }}
                                className="flex-1 rounded-t-[2px] bg-gradient-to-b from-emerald-400/85 to-emerald-400/20"
                            />
                        ))}
                    </div>
                </div>

                {/* Portfel — karta wierzchnia */}
                <div
                    className="auth-deck__card auth-deck__card--front"
                    style={{ '--auth-delay': '0.45s' } as AuthStyle}
                >
                    <div className="auth-deck__chrome">
                        <i />
                        <i />
                        <i />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/45">Wartość portfela</span>
                        <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] text-emerald-300">
                            ↗ +12,68%
                        </span>
                    </div>
                    <div className="auth-display mt-1 text-[19px] font-medium text-[#f5f5f7]">
                        42 819,55 zł
                    </div>
                    <svg
                        viewBox="0 0 300 60"
                        preserveAspectRatio="none"
                        className="mt-2 h-9 w-full"
                    >
                        <defs>
                            <linearGradient id="authDeckSpark" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#34d399" />
                                <stop offset="100%" stopColor="#22d3ee" />
                            </linearGradient>
                        </defs>
                        <path
                            d="M0 52 C 30 50, 45 42, 70 40 S 120 46, 150 30 S 200 16, 230 18 S 275 6, 300 4"
                            fill="none"
                            stroke="url(#authDeckSpark)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                </div>
            </div>
        </div>
    );
}
