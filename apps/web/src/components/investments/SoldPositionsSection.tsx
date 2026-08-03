import { useState } from 'react';
import { Banknote, ChevronDown } from 'lucide-react';
import type { SoldPositionsResponse } from '@smartportfel/shared';

interface Props {
    soldData: SoldPositionsResponse | null;
}

/**
 * Rozwijana sekcja sprzedanych pozycji ze zrealizowanym zyskiem/stratą.
 * Zwija się domyślnie; stan rozwinięcia trzymany lokalnie.
 */
export default function SoldPositionsSection({ soldData }: Props) {
    const [showSold, setShowSold] = useState(false);

    if (!soldData?.positions || soldData.positions.length === 0) return null;

    return (
        <div className="mt-4 space-y-2">
            <button
                onClick={() => setShowSold(v => !v)}
                className="flex items-center gap-3 px-1 w-full group/sold"
            >
                <Banknote size={13} className="text-white/20 shrink-0" />
                <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap group-hover/sold:text-white/40 transition-colors">
                    Sprzedane pozycje · {soldData.positions.length}
                </h3>
                <div className="h-px flex-1 bg-white/5"></div>
                <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${soldData.totalRealizedPLN >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                    {soldData.totalRealizedPLN >= 0 ? '+' : ''}{soldData.totalRealizedPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                </span>
                <ChevronDown size={14} className={`text-white/20 shrink-0 transition-transform ${showSold ? 'rotate-180' : ''}`} />
            </button>
            {showSold && (
                <div className="bg-surface/50 border border-white/5 rounded-[5px] divide-y divide-white/5">
                    {soldData.positions.map(sp => {
                        const positive = sp.realizedPLN >= 0;
                        return (
                            <div key={sp.id} className="flex items-center gap-3 px-4 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="text-white/80 font-bold truncate">{sp.name}</span>
                                        <span className="text-[9px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">{sp.type}</span>
                                    </div>
                                    <p className="text-[10px] text-white/40 mt-0.5">
                                        {sp.quantity.toLocaleString('pl-PL', { maximumFractionDigits: 4 })} szt. · {sp.purchasePrice.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} → {sp.salePrice.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sp.currency}
                                        {' · '}sprzedano {new Date(sp.soldAt).toLocaleDateString('pl-PL')}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`font-black text-xs ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {positive ? '+' : ''}{sp.realizedPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                    </p>
                                    <p className={`text-[10px] font-bold ${positive ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                        {positive ? '+' : ''}{sp.realizedPct.toFixed(2)}%
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
