import { Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
    badgeIcon,
    TIER_COLORS,
    METAL_PL,
    formatMetric,
    type FamilyView,
    type Unit,
} from '../../lib/gamification';

interface Props {
    family: FamilyView;
}

/** Krótka etykieta progu pod segmentem paska (np. 10k, 100k, 4). */
function compact(value: number, unit: Unit): string {
    if (unit === 'weeks') return String(value);
    if (value >= 1000) {
        const k = value / 1000;
        return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
    }
    return String(value);
}

export default function FamilyCard({ family }: Props) {
    // Fałszywy alarm lintera: `badgeIcon` nie TWORZY komponentu, tylko wybiera gotową
    // ikonę z modułowej mapy BADGE_ICONS (lucide). Referencja jest stabilna między
    // renderami, więc żaden stan się nie resetuje — reguła nie umie tego odróżnić od
    // fabryki komponentów, bo widzi wywołanie funkcji.
    // eslint-disable-next-line react-hooks/static-components
    const Icon = badgeIcon(family.icon);
    const current = family.currentTier ? TIER_COLORS[family.currentTier] : null;
    const hasAny = family.currentTier != null;

    return (
        <div
            className={cn(
                'rounded-[5px] border p-4 flex flex-col gap-3 relative overflow-hidden transition-all',
                hasAny ? 'bg-white/[0.06] border-white/15' : 'bg-white/[0.02] border-white/5 hover:border-white/10'
            )}
        >

            <div className="flex items-start gap-3">
                <div
                    className={cn(
                        'shrink-0 w-12 h-12 rounded-full flex items-center justify-center border relative',
                        current ? current.ring : 'border-white/5'
                    )}
                    style={current ? { boxShadow: `0 0 16px ${current.glow}` } : undefined}
                >
                    {/* eslint-disable-next-line react-hooks/static-components */}
                    <Icon size={22} className={current ? current.text : 'text-gray-600'} />
                    {!hasAny && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#0B0B0F] border border-white/10 flex items-center justify-center">
                            <Lock size={10} className="text-gray-500" />
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <h4 className={cn('font-bold text-sm', hasAny ? 'text-white' : 'text-gray-400')}>
                        {family.name}
                    </h4>
                    <p className={cn('text-xs leading-snug mt-0.5', current ? current.text : 'text-gray-500')}>
                        {hasAny
                            ? `${METAL_PL[family.currentTier!]}${
                                  family.currentTierName && family.currentTierName !== METAL_PL[family.currentTier!]
                                      ? ` · ${family.currentTierName}`
                                      : ''
                              }`
                            : 'Zacznij zbierać poziomy'}
                    </p>
                </div>
            </div>

            {/* Segmentowy pasek poziomów */}
            <div className="flex items-end gap-1.5">
                {family.tiers.map((t) => {
                    const isNext = family.nextTier?.tier === t.tier;
                    const c = TIER_COLORS[t.tier];
                    return (
                        <div key={t.tier} className="flex-1 min-w-0">
                            <div className="h-2 rounded-full overflow-hidden bg-white/5">
                                {t.unlocked ? (
                                    <div className={cn('h-full w-full bg-gradient-to-r', c.medal)} />
                                ) : isNext ? (
                                    <div
                                        className="h-full bg-white/35 rounded-full transition-all"
                                        style={{ width: `${Math.round((family.nextTier?.progress ?? 0) * 100)}%` }}
                                    />
                                ) : null}
                            </div>
                            <div
                                className={cn(
                                    'mt-1 text-[9px] text-center truncate',
                                    t.unlocked ? c.text : 'text-gray-600'
                                )}
                            >
                                {compact(t.threshold, family.unit)}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Następny próg / status */}
            <div className="text-[11px] mt-auto">
                {family.nextTier ? (
                    <span className="text-gray-400">
                        Następny: <span className="text-gray-300 font-medium">{METAL_PL[family.nextTier.tier]}</span>{' '}
                        — {formatMetric(family.nextTier.threshold, family.unit)} · masz{' '}
                        {formatMetric(family.metric, family.unit)} ({Math.round(family.nextTier.progress * 100)}%)
                    </span>
                ) : (
                    <span className="text-yellow-400/90 font-medium">Maksymalny poziom! 🏆</span>
                )}
            </div>
        </div>
    );
}
