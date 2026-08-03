import { useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { creditCapacity, DSTI_LEVELS } from '../../lib/creditCapacityMath';
import { formatMoney } from '../../lib/formatters';
import { Pills, ToggleRow, inputClass, labelClass, parseNum } from '../salary/ui';

/** Publiczny kalkulator zdolności kredytowej — wynik live, model DStI + bufor KNF. */
export default function CapacityCalculator() {
    const usedRef = useRef(false);
    const markUsed = () => {
        if (!usedRef.current) {
            usedRef.current = true;
        }
    };

    const [income, setIncome] = useState('8000');
    const [obligations, setObligations] = useState('0');
    const [rate, setRate] = useState('7');
    const [years, setYears] = useState('25');
    const [dsti, setDsti] = useState('0.5');
    const [fixedRate, setFixedRate] = useState(false);

    const result = useMemo(
        () =>
            creditCapacity({
                netIncome: parseNum(income),
                monthlyObligations: parseNum(obligations),
                annualRatePct: parseNum(rate),
                termYears: parseNum(years),
                maxDStI: parseNum(dsti),
                fixedRate,
            }),
        [income, obligations, rate, years, dsti, fixedRate]
    );

    const capitalPct = (result.maxLoanAmount / (result.totalCost || 1)) * 100;

    return (
        <div className="space-y-6" onClickCapture={markUsed} onInputCapture={markUsed}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={labelClass}>Dochód netto gospodarstwa (zł/mies.)</label>
                    <input type="text" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Obecne raty i limity (zł/mies.)</label>
                    <input type="text" inputMode="decimal" value={obligations} onChange={(e) => setObligations(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Oprocentowanie kredytu (%)</label>
                    <input type="text" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Okres kredytu (lata)</label>
                    <input type="text" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="space-y-1.5">
                    <span className={labelClass}>Maks. udział raty w dochodzie (DStI)</span>
                    <Pills
                        small
                        options={DSTI_LEVELS.map((l) => [String(l.value), l.label] as const)}
                        value={dsti}
                        onChange={setDsti}
                    />
                </div>
                <div className="sm:ml-auto pt-1">
                    <ToggleRow label="Kredyt na stałą stopę (bez bufora KNF)" checked={fixedRate} onChange={setFixedRate} />
                </div>
            </div>

            {/* Wynik */}
            <div className="border-t border-white/10 pt-5 space-y-4">
                <div>
                    <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Szacowana zdolność kredytowa</p>
                    <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">{formatMoney(result.maxLoanAmount)} zł</p>
                    <p className="text-white/40 text-xs mt-1">
                        maks. rata {formatMoney(result.maxPayment)} zł/mies. · realna rata {formatMoney(result.realInstallment)} zł/mies.
                    </p>
                </div>

                {result.maxLoanAmount > 0 && (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-white/5 rounded-[5px] p-4">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Rata (bieżąca stopa)</p>
                                <p className="text-white font-bold text-lg mt-1">{formatMoney(result.realInstallment)} zł</p>
                            </div>
                            <div className="bg-white/5 rounded-[5px] p-4">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Całkowity koszt</p>
                                <p className="text-white font-bold text-lg mt-1">{formatMoney(result.totalCost)} zł</p>
                            </div>
                            <div className="bg-white/5 rounded-[5px] p-4 col-span-2 sm:col-span-1">
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Suma odsetek</p>
                                <p className="text-rose-400 font-bold text-lg mt-1">{formatMoney(result.totalInterest)} zł</p>
                            </div>
                        </div>

                        {/* Pasek kapitał vs odsetki */}
                        <div className="space-y-2">
                            <div className="flex h-3 rounded-full overflow-hidden border border-white/10">
                                <div className="bg-emerald-400" style={{ width: `${capitalPct}%` }} />
                                <div className="bg-rose-400" style={{ width: `${100 - capitalPct}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Kapitał {formatMoney(result.maxLoanAmount)} zł</span>
                                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" /> Odsetki {formatMoney(result.totalInterest)} zł</span>
                            </div>
                        </div>
                    </>
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
