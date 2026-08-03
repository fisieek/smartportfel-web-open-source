/**
 * Gamifikacja (front) — wspólne typy (kontrakt z backendem), mapa ikon i confetti.
 * Etap 2: odznaki WIELOPOZIOMOWE — rodziny z poziomami brąz→srebro→złoto→platyna.
 */
import confetti from 'canvas-confetti';
import {
    Footprints,
    Umbrella,
    Flame,
    Target,
    TrendingUp,
    Trophy,
    type LucideIcon,
} from 'lucide-react';

export type StreakStatus = 'ACTIVE' | 'AT_RISK' | 'BROKEN' | 'NONE';
export type Tier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type Unit = 'count' | 'PLN' | 'weeks';

export interface FamilyTierView {
    tier: Tier;
    name: string;
    threshold: number;
    unlocked: boolean;
    unlockedAt: string | null;
}

export interface NextTierView {
    tier: Tier;
    name: string;
    threshold: number;
    progress: number; // 0..1
}

export interface FamilyView {
    key: string;
    name: string;
    icon: string; // nazwa ikony lucide (patrz BADGE_ICONS)
    unit: Unit;
    metric: number;
    currentTier: Tier | null;
    currentTierName: string | null;
    tiers: FamilyTierView[];
    nextTier: NextTierView | null;
}

export interface TierUpView {
    family: string;
    familyName: string;
    tier: Tier;
    tierName: string;
}

export interface GlobalNextTier extends NextTierView {
    family: string;
    familyName: string;
    unit: Unit;
}

export interface GamificationSummary {
    streak: { current: number; longest: number; status: StreakStatus; lastActiveWeek: string | null };
    families: FamilyView[];
    tierUps: TierUpView[];
    backfilledCount: number;
    tiersUnlocked: number;
    tiersTotal: number;
    nextTier: GlobalNextTier | null;
}

export const BADGE_ICONS: Record<string, LucideIcon> = {
    Footprints,
    Umbrella,
    Flame,
    Target,
    TrendingUp,
};

export function badgeIcon(name: string): LucideIcon {
    return BADGE_ICONS[name] ?? Trophy;
}

export const TIER_ORDER: Tier[] = ['bronze', 'silver', 'gold', 'platinum'];
export const METAL_PL: Record<Tier, string> = {
    bronze: 'Brąz',
    silver: 'Srebro',
    gold: 'Złoto',
    platinum: 'Platyna',
};

/** Kolory poziomów (numizmatyczny, premium ton). Platyna = chłodny błękit/biel. */
export const TIER_COLORS: Record<Tier, { ring: string; text: string; bg: string; glow: string; medal: string }> = {
    bronze: { ring: 'border-amber-700/40', text: 'text-amber-500', bg: 'bg-amber-500/10', glow: 'rgba(217,119,6,0.35)', medal: 'from-amber-600 to-amber-800' },
    silver: { ring: 'border-slate-300/30', text: 'text-slate-200', bg: 'bg-slate-300/10', glow: 'rgba(203,213,225,0.35)', medal: 'from-slate-200 to-slate-400' },
    gold: { ring: 'border-yellow-400/40', text: 'text-yellow-400', bg: 'bg-yellow-400/10', glow: 'rgba(250,204,21,0.4)', medal: 'from-yellow-300 to-amber-500' },
    platinum: { ring: 'border-cyan-200/40', text: 'text-cyan-200', bg: 'bg-cyan-200/10', glow: 'rgba(165,243,252,0.45)', medal: 'from-cyan-100 to-sky-300' },
};

/** Czytelna wartość metryki/progu wg jednostki. */
export function formatMetric(value: number, unit: Unit): string {
    if (unit === 'PLN') {
        return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(Math.round(value)) + ' zł';
    }
    if (unit === 'weeks') {
        return `${Math.round(value)} tyg.`;
    }
    return new Intl.NumberFormat('pl-PL').format(Math.round(value));
}

/**
 * „Premium" wybuch confetti — intensywność rośnie z poziomem awansu
 * (złoto/platyna mocniej). intensity: 1 = brąz/srebro, 2 = złoto, 3 = platyna.
 */
export function fireConfetti(intensity = 1): void {
    const colors = intensity >= 3
        ? ['#a5f3fc', '#ffffff', '#7dd3fc'] // platyna
        : intensity === 2
            ? ['#facc15', '#ffffff', '#f59e0b'] // złoto
            : ['#1eb3ab', '#ffffff', '#facc15'];
    const mult = intensity;
    confetti({
        particleCount: 60 * mult,
        spread: 65 + 8 * mult,
        startVelocity: 38,
        origin: { y: 0.35 },
        colors,
        disableForReducedMotion: true,
    });
    setTimeout(() => {
        confetti({
            particleCount: 35 * mult,
            spread: 100,
            decay: 0.92,
            scalar: 0.9,
            origin: { y: 0.4 },
            colors,
            disableForReducedMotion: true,
        });
    }, 160);
}

/** Intensywność confetti dla danego poziomu. */
export function tierIntensity(tier: Tier): number {
    return tier === 'platinum' ? 3 : tier === 'gold' ? 2 : 1;
}
