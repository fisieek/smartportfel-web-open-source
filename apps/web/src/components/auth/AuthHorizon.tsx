import type { CSSProperties } from 'react';
import './auth.css';

/** Stagger wejścia sterujemy zmienną CSS — jak `--lp-delay` w hero landinga. */
type AuthStyle = CSSProperties & { '--auth-delay'?: string };

/** Krzywa wartości netto — ta sama w area i w linii. */
const CURVE =
    'M0 278 C 38 272, 62 254, 96 248 S 148 264, 176 228 S 222 172, 256 182 S 312 128, 340 102 S 384 52, 400 32';

/** Liczby celowo te same, co w mockupach landinga (HeroShowcase / ModuleShowcase),
 *  żeby przejście landing → logowanie było jedną, ciągłą historią produktu. */
const PILLS: { label: string; value: string; delay: string; style: CSSProperties }[] = [
    { label: 'Wartość netto', value: '128 940,22 zł', delay: '0.55s', style: { left: '11%', top: '24%' } },
    { label: 'Portfel', value: '42 819,55 zł', delay: '0.75s', style: { right: '9%', top: '17%' } },
    { label: 'Kredyt spłacony', value: '8,1%', delay: '0.95s', style: { right: '14%', bottom: '23%' } },
];

const TICKS = ['2023', '2025', 'dziś'];

/**
 * Ilustracja ekranów auth: pejzaż z krzywej wartości netto na aurorze landinga.
 * Czysty CSS + jeden <svg> — bez framer-motion, bez GSAP, bez canvasu.
 * Dekoracja, więc w całości aria-hidden.
 */
export function AuthHorizon() {
    return (
        <div
            aria-hidden="true"
            className="auth-grain relative hidden overflow-hidden lg:block"
        >
            <div className="auth-aurora">
                <div className="auth-aurora__blob auth-aurora__blob--1" />
                <div className="auth-aurora__blob auth-aurora__blob--2" />
                <div className="auth-aurora__blob auth-aurora__blob--3" />
            </div>

            {/* Wykres */}
            <div className="absolute bottom-[18%] left-[9%] right-[13%] h-[52%]">
                <svg
                    viewBox="0 0 400 320"
                    preserveAspectRatio="none"
                    className="h-full w-full overflow-visible"
                >
                    <defs>
                        <linearGradient id="authLineGrad" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="60%" stopColor="#22d3ee" />
                            <stop offset="100%" stopColor="#a78bfa" />
                        </linearGradient>
                        <linearGradient id="authAreaGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                        </linearGradient>
                        {/* Wypełnienie domyka się pionową krawędzią przy prawym boku — bez
                            wygaszenia czyta się jak ściana. Maska SVG, nie CSS `mask-image`:
                            ta druga na elemencie SVG zostawia widoczną resztkę krawędzi. */}
                        <linearGradient id="authAreaFade" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#fff" />
                            <stop offset="55%" stopColor="#fff" />
                            <stop offset="92%" stopColor="#000" />
                        </linearGradient>
                        <mask id="authAreaMask">
                            <rect x="0" y="0" width="400" height="320" fill="url(#authAreaFade)" />
                        </mask>
                    </defs>

                    <path
                        data-auth="area"
                        style={{ '--auth-delay': '0.5s' } as AuthStyle}
                        d={`${CURVE} L400 320 L0 320 Z`}
                        fill="url(#authAreaGrad)"
                        mask="url(#authAreaMask)"
                    />
                    <path
                        data-auth="line"
                        className="auth-horizon-line"
                        d={CURVE}
                        fill="none"
                        stroke="url(#authLineGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                    />
                </svg>

                {/* Koniec krzywej = punkt (400, 32) w układzie viewBoxa */}
                <div className="auth-dot absolute right-0 top-[10%] h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#22d3ee]" />
            </div>

            {/* Oś czasu */}
            <div className="absolute bottom-[11%] left-[9%] right-[13%] flex justify-between">
                {TICKS.map((tick, i) => (
                    <span
                        key={tick}
                        data-auth="tick"
                        style={{ '--auth-delay': `${1 + i * 0.1}s` } as AuthStyle}
                        className="text-[10px] uppercase tracking-[0.16em] text-[rgba(245,245,247,0.28)]"
                    >
                        {tick}
                    </span>
                ))}
            </div>

            {/* Szklane pigułki */}
            {PILLS.map((pill) => (
                <div
                    key={pill.label}
                    data-auth="pill"
                    style={{ ...pill.style, '--auth-delay': pill.delay } as AuthStyle}
                    className="auth-pill absolute px-3.5 py-2.5"
                >
                    <span className="block text-[9px] uppercase tracking-[0.14em] text-[rgba(245,245,247,0.5)]">
                        {pill.label}
                    </span>
                    <span className="auth-display mt-0.5 block text-[17px] font-medium text-[#f5f5f7]">
                        {pill.value}
                    </span>
                </div>
            ))}
        </div>
    );
}
