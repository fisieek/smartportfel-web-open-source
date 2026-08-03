import { useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Info } from 'lucide-react';
import { calculateSavings, type Compounding } from '../../lib/savingsMath';
import { formatMoney } from '../../lib/formatters';
import { Pills, ToggleRow, inputClass, labelClass, parseNum } from '../salary/ui';

const compactZl = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln` : `${Math.round(v / 1000)} tys.`;

/** Publiczny kalkulator oszczędności (konto/lokata) — wyniki live, wykres narastania. */
export default function SavingsCalculator() {
    const usedRef = useRef(false);
    const markUsed = () => {
        if (!usedRef.current) {
            usedRef.current = true;
        }
    };

    const [initial, setInitial] = useState('10000');
    const [monthly, setMonthly] = useState('500');
    const [rate, setRate] = useState('5');
    const [years, setYears] = useState('10');
    const [compounding, setCompounding] = useState<Compounding>('monthly');
    const [showGross, setShowGross] = useState(false);

    const result = useMemo(
        () =>
            calculateSavings({
                initial: parseNum(initial),
                monthly: parseNum(monthly),
                annualRatePct: parseNum(rate),
                years: parseNum(years),
                compounding,
                taxBelka: !showGross,
            }),
        [initial, monthly, rate, years, compounding, showGross]
    );

    const finalValue = showGross ? result.finalGross : result.finalNet;
    const interestValue = showGross ? result.totalInterestGross : result.totalInterestNet;

    const chartData = result.series.map((pt) => {
        const balance = showGross ? pt.balanceGross : pt.balanceNet;
        return {
            year: pt.year,
            Kapitał: pt.contributions,
            Zysk: Math.max(0, Math.round((balance - pt.contributions) * 100) / 100),
        };
    });

    return (
        <div className="space-y-6" onClickCapture={markUsed} onInputCapture={markUsed}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={labelClass}>Kwota startowa (zł)</label>
                    <input type="text" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Dopłata miesięczna (zł)</label>
                    <input type="text" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Oprocentowanie roczne (%)</label>
                    <input type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Okres oszczędzania (lata)</label>
                    <input type="text" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="space-y-1.5">
                    <span className={labelClass}>Kapitalizacja odsetek</span>
                    <Pills
                        options={[['monthly', 'Miesięczna'], ['annual', 'Roczna']] as const}
                        value={compounding}
                        onChange={setCompounding}
                    />
                </div>
                <div className="sm:ml-auto pt-1">
                    <ToggleRow
                        label="Pokaż kwoty brutto (bez podatku Belki)"
                        checked={showGross}
                        onChange={setShowGross}
                    />
                </div>
            </div>

            {/* Wynik */}
            <div className="border-t border-white/10 pt-5 space-y-4">
                <div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                        {showGross ? 'Kwota końcowa (brutto)' : 'Kwota końcowa na rękę'}
                    </p>
                    <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">{formatMoney(finalValue)} zł</p>
                    <p className="text-white/40 text-xs mt-1">
                        z tego {formatMoney(interestValue)} zł to zarobione odsetki
                        {!showGross && result.taxPaid > 0 && ` (po odliczeniu ${formatMoney(result.taxPaid)} zł podatku Belki)`}
                    </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Wpłacony kapitał</p>
                        <p className="text-white font-bold text-lg mt-1">{formatMoney(result.totalContributions)} zł</p>
                    </div>
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Odsetki {showGross ? 'brutto' : 'netto'}</p>
                        <p className="text-emerald-400 font-bold text-lg mt-1">{formatMoney(interestValue)} zł</p>
                    </div>
                    <div className="bg-white/5 rounded-[5px] p-4 col-span-2 sm:col-span-1">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Podatek Belki (19%)</p>
                        <p className="text-white font-bold text-lg mt-1">{formatMoney(result.taxPaid)} zł</p>
                    </div>
                </div>

                {/* Wykres narastania */}
                {chartData.length > 1 && (
                    <div className="h-[260px] bg-white/[0.02] border border-white/5 rounded-[5px] p-3 pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="savKapital" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.05} />
                                    </linearGradient>
                                    <linearGradient id="savZysk" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                <XAxis dataKey="year" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} r.`} />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={compactZl} />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || !payload.length) return null;
                                        const kapital = (payload.find((p) => p.dataKey === 'Kapitał')?.value as number) || 0;
                                        const zysk = (payload.find((p) => p.dataKey === 'Zysk')?.value as number) || 0;
                                        return (
                                            <div className="bg-[#0B0B0B] border border-white/10 rounded-lg p-3 text-xs shadow-xl">
                                                <p className="text-white/50 mb-2">Po {label} latach</p>
                                                <p className="text-white/70">Kapitał: <span className="text-white font-bold">{formatMoney(kapital)} zł</span></p>
                                                <p className="text-white/70">Zysk: <span className="text-emerald-400 font-bold">{formatMoney(zysk)} zł</span></p>
                                                <p className="text-white/70 mt-1 pt-1 border-t border-white/10">Razem: <span className="text-white font-bold">{formatMoney(kapital + zysk)} zł</span></p>
                                            </div>
                                        );
                                    }}
                                />
                                <Area type="monotone" dataKey="Kapitał" stackId="1" stroke="#94a3b8" strokeWidth={2} fill="url(#savKapital)" />
                                <Area type="monotone" dataKey="Zysk" stackId="1" stroke="#34d399" strokeWidth={2} fill="url(#savZysk)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                {result.warnings.length > 0 && (
                    <ul className="space-y-1">
                        {result.warnings.map((w) => (
                            <li key={w} className="flex items-start gap-1.5 text-xs text-white/40">
                                <Info size={12} className="mt-0.5 shrink-0" />
                                {w}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
