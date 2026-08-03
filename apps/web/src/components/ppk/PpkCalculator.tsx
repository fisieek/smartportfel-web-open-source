import { useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Info } from 'lucide-react';
import { ppkMonthly, costPer100, ppkProjection } from '../../lib/ppkMath';
import { formatMoney } from '../../lib/formatters';
import { Pills, inputClass, labelClass, parseNum } from '../salary/ui';

const compactZl = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} mln` : `${Math.round(v / 1000)} tys.`;

const EMPLOYEE_RATES = ['0,5', '1', '1,5', '2', '3', '4'] as const;
const EMPLOYER_RATES = ['1,5', '2', '2,5', '3', '3,5', '4'] as const;
const RETURN_RATES = ['3', '4', '5', '6', '7'] as const;

const SEGMENTS = [
    { key: 'employee', label: 'Twoje wpłaty', color: '#a78bfa' },
    { key: 'employer', label: 'Pracodawca', color: '#38bdf8' },
    { key: 'state', label: 'Państwo', color: '#fbbf24' },
    { key: 'gains', label: 'Zysk z inwestycji', color: '#34d399' },
] as const;

/** Publiczny kalkulator PPK — koszt netto, insight i projekcja kapitału do 60. roku. */
export default function PpkCalculator() {
    const usedRef = useRef(false);
    const markUsed = () => {
        if (!usedRef.current) {
            usedRef.current = true;
        }
    };

    const [gross, setGross] = useState('8000');
    const [age, setAge] = useState('30');
    const [employeeRate, setEmployeeRate] = useState('2');
    const [employerRate, setEmployerRate] = useState('1,5');
    const [returnRate, setReturnRate] = useState('5');

    const monthly = useMemo(
        () => ppkMonthly(parseNum(gross), parseNum(employeeRate), parseNum(employerRate)),
        [gross, employeeRate, employerRate]
    );
    const per100 = costPer100(monthly);

    const projection = useMemo(
        () =>
            ppkProjection({
                grossMonthly: parseNum(gross),
                employeeRatePct: parseNum(employeeRate),
                employerRatePct: parseNum(employerRate),
                currentAge: parseNum(age),
                annualReturnPct: parseNum(returnRate),
            }),
        [gross, age, employeeRate, employerRate, returnRate]
    );

    const finalBuckets = [
        { ...SEGMENTS[0], amount: projection.totalEmployee },
        { ...SEGMENTS[1], amount: projection.totalEmployer },
        { ...SEGMENTS[2], amount: projection.totalState },
        { ...SEGMENTS[3], amount: projection.totalGains },
    ];
    const total = projection.finalCapital || 1;

    const chartData = projection.series.map((pt) => ({
        age: pt.age,
        'Twoje wpłaty': pt.employee,
        Pracodawca: pt.employer,
        Państwo: pt.state,
        'Zysk z inwestycji': pt.gains,
    }));

    return (
        <div className="space-y-6" onClickCapture={markUsed} onInputCapture={markUsed}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={labelClass}>Wynagrodzenie brutto (zł/mies.)</label>
                    <input type="text" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Twój wiek (lat)</label>
                    <input type="text" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <span className={labelClass}>Twoja wpłata (%)</span>
                    <Pills small options={EMPLOYEE_RATES.map((r) => [r, `${r}%`] as const)} value={employeeRate as (typeof EMPLOYEE_RATES)[number]} onChange={setEmployeeRate} />
                </div>
                <div className="space-y-1.5">
                    <span className={labelClass}>Wpłata pracodawcy (%)</span>
                    <Pills small options={EMPLOYER_RATES.map((r) => [r, `${r}%`] as const)} value={employerRate as (typeof EMPLOYER_RATES)[number]} onChange={setEmployerRate} />
                </div>
            </div>

            <div className="space-y-1.5">
                <span className={labelClass}>Zakładana roczna stopa zwrotu (%)</span>
                <Pills small options={RETURN_RATES.map((r) => [r, `${r}%`] as const)} value={returnRate as (typeof RETURN_RATES)[number]} onChange={setReturnRate} />
            </div>

            {/* Insight: ile realnie kosztuje */}
            <div className="border-t border-white/10 pt-5 space-y-4">
                <div className="bg-emerald-400/10 border border-emerald-400/20 rounded-[5px] p-4">
                    <p className="text-white/70 text-sm">
                        100 zł na Twoim koncie PPK kosztuje Cię tylko
                    </p>
                    <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">{formatMoney(per100)} zł</p>
                    <p className="text-white/40 text-xs mt-1">resztę dokłada pracodawca i państwo</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Twój koszt netto / mies.</p>
                        <p className="text-white font-bold text-lg mt-1">{formatMoney(monthly.netCost)} zł</p>
                        <p className="text-white/40 text-[11px] mt-0.5">wpłata {formatMoney(monthly.employee)} zł + PIT od pracodawcy {formatMoney(monthly.employerTax)} zł</p>
                    </div>
                    <div className="bg-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Na konto PPK / mies.</p>
                        <p className="text-emerald-400 font-bold text-lg mt-1">{formatMoney(monthly.toAccount)} zł</p>
                        <p className="text-white/40 text-[11px] mt-0.5">Ty {formatMoney(monthly.employee)} zł + pracodawca {formatMoney(monthly.employer)} zł</p>
                    </div>
                </div>
            </div>

            {/* Projekcja kapitału */}
            {projection.years > 0 && (
                <div className="border-t border-white/10 pt-5 space-y-4">
                    <div>
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">
                            Szacowany kapitał w wieku 60 lat (za {projection.years} lat)
                        </p>
                        <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">{formatMoney(projection.finalCapital)} zł</p>
                        <p className="text-white/40 text-xs mt-1">
                            Twój realny koszt przez te lata: {formatMoney(projection.totalNetCost)} zł
                        </p>
                    </div>

                    {/* Pasek składu kapitału */}
                    <div className="space-y-2">
                        <div className="flex h-3 rounded-full overflow-hidden border border-white/10">
                            {finalBuckets.map((b) => (
                                <div key={b.key} style={{ width: `${(b.amount / total) * 100}%`, backgroundColor: b.color }} />
                            ))}
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                            {finalBuckets.map((b) => (
                                <span key={b.key} className="flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} /> {b.label} {formatMoney(b.amount)} zł
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Wykres narastania */}
                    {chartData.length > 1 && (
                        <div className="h-[280px] bg-white/[0.02] border border-white/5 rounded-[5px] p-3 pt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                    <defs>
                                        {SEGMENTS.map((s) => (
                                            <linearGradient key={s.key} id={`ppk-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor={s.color} stopOpacity={0.5} />
                                                <stop offset="95%" stopColor={s.color} stopOpacity={0.05} />
                                            </linearGradient>
                                        ))}
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                                    <XAxis dataKey="age" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v} l.`} />
                                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={compactZl} />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || !payload.length) return null;
                                            const sum = payload.reduce((acc, p) => acc + ((p.value as number) || 0), 0);
                                            return (
                                                <div className="bg-[#0B0B0B] border border-white/10 rounded-lg p-3 text-xs shadow-xl">
                                                    <p className="text-white/50 mb-2">Wiek {label} lat</p>
                                                    {payload.map((p) => (
                                                        <p key={p.dataKey as string} className="text-white/70 flex justify-between gap-4">
                                                            <span>{p.dataKey}:</span>
                                                            <span className="font-bold" style={{ color: p.color }}>{formatMoney((p.value as number) || 0)} zł</span>
                                                        </p>
                                                    ))}
                                                    <p className="text-white/70 mt-1 pt-1 border-t border-white/10 flex justify-between gap-4">
                                                        <span>Razem:</span><span className="text-white font-bold">{formatMoney(sum)} zł</span>
                                                    </p>
                                                </div>
                                            );
                                        }}
                                    />
                                    {SEGMENTS.map((s) => (
                                        <Area key={s.key} type="monotone" dataKey={s.label} stackId="1" stroke={s.color} strokeWidth={1.5} fill={`url(#ppk-${s.key})`} />
                                    ))}
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}

            {projection.warnings.length > 0 && (
                <ul className="space-y-1">
                    {projection.warnings.map((w) => (
                        <li key={w} className="flex items-start gap-1.5 text-xs text-white/40">
                            <Info size={12} className="mt-0.5 shrink-0" />
                            {w}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
