import { useEffect, useState } from 'react';
import api from '../lib/api';

interface ContributionData {
    accountType: 'IKE' | 'IKZE';
    ikzeBusiness: boolean;
    year: number;
    contributed: number;
    limit: number;
    remaining: number;
    percentUsed: number;
}

const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/**
 * Kompaktowy pasek wykorzystania rocznego limitu wpłat dla kont IKE/IKZE.
 * Dla IKZE pokazuje też szacowaną ulgę w PIT (zakres wg progu skali / podatku liniowego).
 */
export default function IkeIkzeLimitBar({ accountId }: { accountId: string }) {
    const [data, setData] = useState<ContributionData | null>(null);

    useEffect(() => {
        let active = true;
        api.get<ContributionData>(`/investment-accounts/${accountId}/contributions`)
            .then(res => { if (active) setData(res.data); })
            .catch(() => { /* brak danych = nie pokazujemy paska */ });
        return () => { active = false; };
    }, [accountId]);

    if (!data) return null;

    const nearFull = data.percentUsed >= 90;
    const barColor = nearFull ? 'bg-emerald-400' : 'bg-sky-400';

    // Szacowana ulga IKZE: kwota wpłacona × stawka podatku.
    // Liniowy (B2B): 19%. Skala: 12% (I próg) – 32% (II próg).
    const taxBenefitLow = data.ikzeBusiness ? data.contributed * 0.19 : data.contributed * 0.12;
    const taxBenefitHigh = data.ikzeBusiness ? data.contributed * 0.19 : data.contributed * 0.32;

    return (
        <div className="mt-2 pt-2 border-t border-white/5">
            <div className="flex justify-between items-center text-[8px] font-bold uppercase tracking-wider text-white/40 mb-1">
                <span>{data.accountType} · limit {data.year}</span>
                <span className={nearFull ? 'text-emerald-400' : 'text-white/50'}>{data.percentUsed}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${data.percentUsed}%` }} />
            </div>
            <p className="text-[9px] text-white/40 mt-1 leading-tight">
                {fmt(data.contributed)} / {fmt(data.limit)} zł
                {data.remaining > 0
                    ? <> · zostało <span className="text-white/60 font-bold">{fmt(data.remaining)} zł</span></>
                    : <> · <span className="text-emerald-400 font-bold">limit wykorzystany</span></>}
            </p>
            {data.accountType === 'IKZE' && (
                data.contributed > 0 ? (
                    <p className="text-[9px] text-emerald-400/70 mt-0.5 leading-tight">
                        Szacowana ulga w PIT: {data.ikzeBusiness
                            ? <span className="font-bold">~{fmt(taxBenefitLow)} zł</span>
                            : <span className="font-bold">{fmt(taxBenefitLow)}–{fmt(taxBenefitHigh)} zł</span>}
                    </p>
                ) : (
                    <p className="text-[9px] text-emerald-400/70 mt-0.5 leading-tight">
                        Ulga w PIT: zwrot {data.ikzeBusiness
                            ? <span className="font-bold">~19% wpłaty</span>
                            : <span className="font-bold">12–32% wpłaty</span>}
                    </p>
                )
            )}
        </div>
    );
}
