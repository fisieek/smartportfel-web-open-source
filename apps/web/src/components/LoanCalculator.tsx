import { useMemo, useState } from 'react';
import { TrendingDown, Clock, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import { generateSchedule, compareOverpayment, type OverpaymentStrategy } from '../lib/loanMath';
import { formatMoney } from '../lib/formatters';

interface LoanCalculatorProps {
    /** Wstępne wartości, np. z istniejącego kredytu */
    initialAmount?: number;
    initialTermMonths?: number;
    initialMarginRate?: number;
    initialReferenceRate?: number;
    initialInstallmentType?: 'EQUAL' | 'DECREASING';
}

const parseNum = (value: string) => {
    const n = parseFloat(value.replace(',', '.').replace(/\s/g, ''));
    return isNaN(n) ? 0 : n;
};

const formatMonths = (months: number) => {
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m} mies.`;
    if (m === 0) return `${y} lat`;
    return `${y} lat ${m} mies.`;
};

export default function LoanCalculator({
    initialAmount = 300000,
    initialTermMonths = 300,
    initialMarginRate = 2.0,
    initialReferenceRate = 5.75,
    initialInstallmentType = 'EQUAL',
}: LoanCalculatorProps) {
    const [amount, setAmount] = useState(initialAmount.toString());
    const [years, setYears] = useState(Math.round(initialTermMonths / 12).toString());
    const [marginRate, setMarginRate] = useState(initialMarginRate.toString());
    const [referenceRate, setReferenceRate] = useState(initialReferenceRate.toString());
    const [installmentType, setInstallmentType] = useState<'EQUAL' | 'DECREASING'>(initialInstallmentType);
    const [overpayment, setOverpayment] = useState('');
    const [strategy, setStrategy] = useState<OverpaymentStrategy>('SHORTEN_TERM');
    const [rateDelta, setRateDelta] = useState(0); // symulacja zmiany stawki w p.p.
    const [showSchedule, setShowSchedule] = useState(false);

    const annualRate = parseNum(marginRate) + parseNum(referenceRate);

    const baseParams = useMemo(() => ({
        principal: parseNum(amount),
        termMonths: Math.round(parseNum(years) * 12),
        annualRatePercent: annualRate,
        installmentType,
    }), [amount, years, annualRate, installmentType]);

    const schedule = useMemo(() => generateSchedule(baseParams), [baseParams]);

    const overpaymentValue = parseNum(overpayment);
    const comparison = useMemo(
        () => (overpaymentValue > 0 ? compareOverpayment(baseParams, overpaymentValue, strategy) : null),
        [baseParams, overpaymentValue, strategy]
    );

    const rateSimulation = useMemo(() => {
        if (rateDelta === 0) return null;
        const newRate = Math.max(0, annualRate + rateDelta);
        return generateSchedule({ ...baseParams, annualRatePercent: newRate });
    }, [baseParams, annualRate, rateDelta]);

    const scheduleToShow = comparison ? comparison.withOverpayment : schedule;

    const inputClass = "w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium";
    const labelClass = "text-[9px] font-black text-white/50 uppercase tracking-widest ml-1";

    return (
        <div className="space-y-6">
            {/* Parametry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className={labelClass}>Kwota kredytu (zł)</label>
                    <input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Okres (lata)</label>
                    <input type="text" inputMode="numeric" value={years} onChange={e => setYears(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Marża banku (%)</label>
                    <input type="text" inputMode="decimal" value={marginRate} onChange={e => setMarginRate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Stawka referencyjna (%) — WIBOR/WIRON</label>
                    <input type="text" inputMode="decimal" value={referenceRate} onChange={e => setReferenceRate(e.target.value)} className={inputClass} />
                </div>
            </div>

            {/* Typ rat */}
            <div className="flex gap-2">
                {([['EQUAL', 'Raty równe'], ['DECREASING', 'Raty malejące']] as const).map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        onClick={() => setInstallmentType(value)}
                        className={`px-3 py-1.5 text-xs rounded-[4px] border transition-all ${installmentType === value
                            ? 'bg-white border-white text-black font-bold'
                            : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                            }`}
                    >
                        {label}
                    </button>
                ))}
                <span className="ml-auto text-xs text-white/40 self-center">Oprocentowanie: <span className="text-white font-bold">{annualRate.toFixed(2)}%</span></span>
            </div>

            {/* Wynik bazowy */}
            {schedule ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/5 border border-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{installmentType === 'EQUAL' ? 'Rata miesięczna' : 'Pierwsza rata'}</p>
                        <p className="text-white font-bold text-xl mt-1">{formatMoney(schedule.firstInstallment)} zł</p>
                        {installmentType === 'DECREASING' && (
                            <p className="text-white/40 text-xs mt-0.5">ostatnia: {formatMoney(schedule.lastInstallment)} zł</p>
                        )}
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Suma odsetek</p>
                        <p className="text-amber-400 font-bold text-xl mt-1">{formatMoney(schedule.totalInterest)} zł</p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-[5px] p-4">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">Całkowity koszt</p>
                        <p className="text-white font-bold text-xl mt-1">{formatMoney(schedule.totalPaid)} zł</p>
                    </div>
                </div>
            ) : (
                <p className="text-white/40 text-sm">Uzupełnij poprawnie kwotę, okres i oprocentowanie.</p>
            )}

            {/* Symulacja zmiany stawki */}
            {schedule && (
                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-4 space-y-3">
                    <p className="text-xs font-bold text-white/70 flex items-center gap-2"><Percent size={14} /> Co jeśli stawka referencyjna się zmieni?</p>
                    <div className="flex gap-2 flex-wrap">
                        {[-2, -1, -0.5, 0.5, 1, 2].map(delta => (
                            <button
                                key={delta}
                                type="button"
                                onClick={() => setRateDelta(rateDelta === delta ? 0 : delta)}
                                className={`px-3 py-1 text-xs rounded-[4px] border transition-all ${rateDelta === delta
                                    ? 'bg-white border-white text-black font-bold'
                                    : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                {delta > 0 ? '+' : ''}{delta} p.p.
                            </button>
                        ))}
                    </div>
                    {rateSimulation && (
                        <p className="text-sm text-white/70">
                            Rata: <span className={`font-bold ${rateSimulation.firstInstallment > schedule.firstInstallment ? 'text-danger' : 'text-emerald-400'}`}>
                                {formatMoney(rateSimulation.firstInstallment)} zł
                            </span>
                            <span className="text-white/40"> ({rateSimulation.firstInstallment > schedule.firstInstallment ? '+' : ''}{formatMoney(rateSimulation.firstInstallment - schedule.firstInstallment)} zł)</span>
                            , odsetki łącznie: <span className="font-bold text-white">{formatMoney(rateSimulation.totalInterest)} zł</span>
                        </p>
                    )}
                </div>
            )}

            {/* Nadpłata */}
            {schedule && (
                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-4 space-y-3">
                    <p className="text-xs font-bold text-white/70 flex items-center gap-2"><TrendingDown size={14} /> Symulacja miesięcznej nadpłaty</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                            type="text"
                            inputMode="decimal"
                            value={overpayment}
                            onChange={e => setOverpayment(e.target.value)}
                            placeholder="np. 500 zł / mies."
                            className={inputClass}
                        />
                        <div className="flex gap-2">
                            {([['SHORTEN_TERM', 'Skróć okres'], ['LOWER_INSTALLMENT', 'Obniż ratę']] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setStrategy(value)}
                                    className={`flex-1 px-2 py-1.5 text-xs rounded-[4px] border transition-all ${strategy === value
                                        ? 'bg-white border-white text-black font-bold'
                                        : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    {comparison && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[5px] p-3">
                                <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest">Oszczędność na odsetkach</p>
                                <p className="text-emerald-400 font-bold text-lg mt-0.5">{formatMoney(comparison.interestSaved)} zł</p>
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[5px] p-3">
                                <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> Spłata szybciej o</p>
                                <p className="text-emerald-400 font-bold text-lg mt-0.5">{formatMonths(comparison.monthsSaved)}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Harmonogram */}
            {scheduleToShow && (
                <div className="border border-white/5 rounded-[5px] overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowSchedule(!showSchedule)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-surface/50 hover:bg-white/5 transition-all text-xs font-bold text-white/70"
                    >
                        <span>Harmonogram spłaty ({formatMonths(scheduleToShow.months)})</span>
                        {showSchedule ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {showSchedule && (
                        <div className="max-h-72 overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-[#141414]">
                                    <tr className="text-white/40 text-left">
                                        <th className="px-4 py-2 font-medium">Mies.</th>
                                        <th className="px-2 py-2 font-medium text-right">Rata</th>
                                        <th className="px-2 py-2 font-medium text-right">Kapitał</th>
                                        <th className="px-2 py-2 font-medium text-right">Odsetki</th>
                                        <th className="px-4 py-2 font-medium text-right">Pozostało</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scheduleToShow.rows.map(row => (
                                        <tr key={row.month} className="border-t border-white/5 text-white/70">
                                            <td className="px-4 py-1.5">{row.month}</td>
                                            <td className="px-2 py-1.5 text-right">{formatMoney(row.payment)}</td>
                                            <td className="px-2 py-1.5 text-right">{formatMoney(row.principal + row.overpayment)}</td>
                                            <td className="px-2 py-1.5 text-right">{formatMoney(row.interest)}</td>
                                            <td className="px-4 py-1.5 text-right">{formatMoney(row.balance)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
