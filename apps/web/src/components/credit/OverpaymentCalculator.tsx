import { useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Info } from 'lucide-react';
import { compareOverpayment, type OverpaymentStrategy } from '../../lib/loanMath';
import { formatMoney } from '../../lib/formatters';
import { Pills, inputClass, labelClass, parseNum } from '../salary/ui';

const compactZl = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln` : `${Math.round(v / 1000)} tys.`;

const formatMonths = (m: number) => {
    const y = Math.floor(m / 12);
    const mm = m % 12;
    if (y === 0) return `${mm} mies.`;
    if (mm === 0) return `${y} lat`;
    return `${y} lat ${mm} mies.`;
};

type InstallmentType = 'EQUAL' | 'DECREASING';

/** Publiczny kalkulator nadpłaty kredytu — reużywa harmonogram i porównanie z lib/loanMath. */
export default function OverpaymentCalculator() {
    const usedRef = useRef(false);
    const markUsed = () => {
        if (!usedRef.current) {
            usedRef.current = true;
        }
    };

    const [principal, setPrincipal] = useState('400000');
    const [years, setYears] = useState('25');
    const [rate, setRate] = useState('7');
    const [installmentType, setInstallmentType] = useState<InstallmentType>('EQUAL');
    const [overpayment, setOverpayment] = useState('500');
    const [strategy, setStrategy] = useState<OverpaymentStrategy>('SHORTEN_TERM');

    const comparison = useMemo(
        () =>
            compareOverpayment(
                {
                    principal: parseNum(principal),
                    termMonths: Math.round(parseNum(years) * 12),
                    annualRatePercent: parseNum(rate),
                    installmentType,
                },
                parseNum(overpayment),
                strategy
            ),
        [principal, years, rate, installmentType, overpayment, strategy]
    );

    const chartData = useMemo(() => {
        if (!comparison) return [];
        const { base, withOverpayment } = comparison;
        const points: Array<{ year: number; 'Bez nadpłaty': number; 'Z nadpłatą': number }> = [];
        for (let month = 0; month <= base.months; month += 12) {
            const idx = month - 1;
            points.push({
                year: month / 12,
                'Bez nadpłaty': month === 0 ? parseNum(principal) : base.rows[idx]?.balance ?? 0,
                'Z nadpłatą': month === 0 ? parseNum(principal) : withOverpayment.rows[idx]?.balance ?? 0,
            });
        }
        return points;
    }, [comparison, principal]);

    if (!comparison) {
        return <p className="text-white/40 text-sm">Podaj parametry kredytu, aby zobaczyć efekt nadpłaty.</p>;
    }

    const { base, withOverpayment, interestSaved, monthsSaved } = comparison;

    return (
        <div className="space-y-6" onClickCapture={markUsed} onInputCapture={markUsed}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={labelClass}>Kwota kredytu (zł)</label>
                    <input type="text" inputMode="decimal" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Okres kredytu (lata)</label>
                    <input type="text" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Oprocentowanie (%)</label>
                    <input type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Miesięczna nadpłata (zł)</label>
                    <input type="text" inputMode="decimal" value={overpayment} onChange={(e) => setOverpayment(e.target.value)} className={inputClass} />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5">
                    <span className={labelClass}>Rodzaj rat</span>
                    <Pills options={[['EQUAL', 'Równe'], ['DECREASING', 'Malejące']] as const} value={installmentType} onChange={setInstallmentType} />
                </div>
                <div className="space-y-1.5">
                    <span className={labelClass}>Nadpłata ma</span>
                    <Pills options={[['SHORTEN_TERM', 'Skrócić okres'], ['LOWER_INSTALLMENT', 'Obniżyć ratę']] as const} value={strategy} onChange={setStrategy} />
                </div>
            </div>

            {/* Wynik */}
            <div className="border-t border-white/10 pt-5 space-y-4">
                <div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Zaoszczędzisz na odsetkach</p>
                    <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">{formatMoney(interestSaved)} zł</p>
                    <p className="text-white/40 text-xs mt-1">
                        {strategy === 'SHORTEN_TERM'
                            ? `krócej spłacasz o ${formatMonths(monthsSaved)}`
                            : `rata spada z ${formatMoney(base.firstInstallment)} zł do ${formatMoney(withOverpayment.firstInstallment)} zł`}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Bez nadpłaty</p>
                        <p className="text-white font-bold text-lg mt-1">{formatMoney(base.totalInterest)} zł</p>
                        <p className="text-white/40 text-[11px] mt-0.5">odsetki · {formatMonths(base.months)}</p>
                    </div>
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Z nadpłatą</p>
                        <p className="text-emerald-400 font-bold text-lg mt-1">{formatMoney(withOverpayment.totalInterest)} zł</p>
                        <p className="text-white/40 text-[11px] mt-0.5">odsetki · {formatMonths(withOverpayment.months)}</p>
                    </div>
                </div>

                {/* Wykres salda */}
                {chartData.length > 1 && (
                    <div className="h-[260px] bg-white/[0.02] border border-white/5 rounded-[5px] p-3 pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="ovBase" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.25} />
                                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0.03} />
                                    </linearGradient>
                                    <linearGradient id="ovOver" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.35} />
                                        <stop offset="95%" stopColor="#34d399" stopOpacity={0.03} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                <XAxis dataKey="year" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} r.`} />
                                <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={compactZl} />
                                <Tooltip
                                    content={({ active, payload, label }) => {
                                        if (!active || !payload || !payload.length) return null;
                                        return (
                                            <div className="bg-[#0B0B0B] border border-white/10 rounded-lg p-3 text-xs shadow-xl">
                                                <p className="text-white/50 mb-2">Po {label} latach — pozostało do spłaty</p>
                                                {payload.map((p) => (
                                                    <p key={p.dataKey as string} className="text-white/70 flex justify-between gap-4">
                                                        <span>{p.dataKey}:</span>
                                                        <span className="font-bold" style={{ color: p.color }}>{formatMoney((p.value as number) || 0)} zł</span>
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    }}
                                />
                                <Area type="monotone" dataKey="Bez nadpłaty" stroke="#94a3b8" strokeWidth={2} fill="url(#ovBase)" />
                                <Area type="monotone" dataKey="Z nadpłatą" stroke="#34d399" strokeWidth={2} fill="url(#ovOver)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <ul className="space-y-1">
                    <li className="flex items-start gap-1.5 text-xs text-white/40">
                        <Info size={12} className="mt-0.5 shrink-0" />
                        Zakładamy stałą nadpłatę co miesiąc i niezmienne oprocentowanie przez cały okres. Sprawdź, czy Twój bank nie pobiera prowizji za wcześniejszą spłatę.
                    </li>
                </ul>
            </div>
        </div>
    );
}
