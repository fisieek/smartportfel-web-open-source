import { Wallet, TrendingUp, PiggyBank, Trophy } from 'lucide-react';
import type { InvestmentPosition, PositionsResponse } from '@smartportfel/shared';
import { GlowCard } from '../ui/spotlight-card';
import AnimatedNumber from '../ui/AnimatedNumber';

interface Props {
    totals: PositionsResponse['totals'];
    positions: InvestmentPosition[];
}

export default function PortfolioKPIs({ totals, positions }: Props) {
    const best = positions.reduce<InvestmentPosition | null>((b, p) => (!b || p.plPct > b.plPct ? p : b), null);
    const profitPositive = totals.plPLN >= 0;

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <Kpi glow="blue" icon={<Wallet size={13} />} label="Wartość portfela">
                <span className="text-sm sm:text-xl font-black text-white tracking-tight">
                    <AnimatedNumber value={totals.equityPLN} />
                    <span className="text-[10px] sm:text-xs font-normal text-white/40 ml-1">PLN</span>
                </span>
                <p className="text-[9px] sm:text-[10px] text-white/30 font-medium mt-0.5">
                    Instrumenty + gotówka
                </p>
            </Kpi>

            <Kpi glow="purple" icon={<PiggyBank size={13} />} label="Zainwestowane">
                <span className="text-sm sm:text-xl font-black text-white tracking-tight">
                    <AnimatedNumber value={totals.investedPLN} />
                    <span className="text-[10px] sm:text-xs font-normal text-white/40 ml-1">PLN</span>
                </span>
                <p className="text-[9px] sm:text-[10px] text-white/30 font-medium mt-0.5">
                    Koszt nabycia (PLN)
                </p>
            </Kpi>

            <Kpi glow={profitPositive ? 'green' : 'red'} icon={<TrendingUp size={13} className={profitPositive ? '' : 'rotate-180'} />} label="Zysk / Strata">
                <span className={`text-sm sm:text-xl font-black tracking-tight ${profitPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <AnimatedNumber value={totals.plPLN} showSign />
                    <span className="text-[10px] sm:text-xs font-normal opacity-50 ml-1">PLN</span>
                </span>
                <p className={`text-[9px] sm:text-[10px] font-bold mt-0.5 ${profitPositive ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                    {profitPositive ? '+' : ''}{totals.plPct.toFixed(2)}%
                </p>
            </Kpi>

            <Kpi glow="orange" icon={<Trophy size={13} />} label="Najlepsza pozycja">
                {best ? (
                    <>
                        <span className="text-sm sm:text-base font-black text-white tracking-tight truncate block">
                            {best.name}
                        </span>
                        <p className={`text-[9px] sm:text-[10px] font-bold mt-0.5 ${best.plPct >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                            {best.plPct >= 0 ? '+' : ''}{best.plPct.toFixed(2)}%
                        </p>
                    </>
                ) : (
                    <span className="text-sm font-black text-white/30">—</span>
                )}
            </Kpi>
        </div>
    );
}

function Kpi({ glow, icon, label, children }: { glow: 'blue' | 'purple' | 'green' | 'red' | 'orange'; icon: React.ReactNode; label: string; children: React.ReactNode }) {
    return (
        <GlowCard glowColor={glow} className="bg-surface/50 border border-white/5 shadow-card p-4 min-h-[96px] flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-white/40">
                {icon}
                <span className="text-[10px] uppercase tracking-wider font-bold truncate">{label}</span>
            </div>
            <div className="mt-2">{children}</div>
        </GlowCard>
    );
}
