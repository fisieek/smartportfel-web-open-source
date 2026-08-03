import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { SalaryResult, TaxForm } from '../../lib/salaryMath';
import { formatMoney } from '../../lib/formatters';

/** Kolor segmentu paska i kropki legendy per pozycja potrącenia. */
const COLOR_BY_KEY: Record<string, string> = {
    emerytalna: 'bg-amber-400',
    rentowa: 'bg-amber-500',
    chorobowa: 'bg-amber-300',
    wypadkowa: 'bg-amber-600',
    funduszPracy: 'bg-amber-200',
    zus: 'bg-amber-400',
    zdrowotna: 'bg-sky-400',
    pit: 'bg-rose-400',
    ppkEmployee: 'bg-violet-400',
    koszty: 'bg-white/30',
};

export interface ExtraStat {
    label: string;
    value: string;
    hint?: string;
}

const FORM_LABEL: Record<TaxForm, string> = {
    skala: 'Skala (12/32%)',
    liniowy: 'Liniowy 19%',
    ryczalt: 'Ryczałt',
};

interface ResultPanelProps {
    result: SalaryResult;
    /** Nagłówek nad wielką liczbą, np. „Na rękę co miesiąc" */
    netLabel?: string;
    /** Porównanie form opodatkowania (tylko B2B) */
    compare?: Record<TaxForm, SalaryResult>;
    activeForm?: TaxForm;
    onSelectForm?: (form: TaxForm) => void;
    /** Dodatkowe karty statystyk (np. B2B: faktura brutto/VAT, stawka netto/godz.) */
    extraStats?: ExtraStat[];
}

export default function ResultPanel({ result, netLabel = 'Na rękę co miesiąc', compare, activeForm, onSelectForm, extraStats }: ResultPanelProps) {
    const [showBreakdown, setShowBreakdown] = useState(false);

    const deductions = result.rows.filter((r) => r.kind === 'deduction' && r.amount > 0);
    const gross = result.grossMonthly;
    const hasBar = gross > 0 && result.netMonthly > 0;

    if (gross <= 0) {
        return <p className="text-white/40 text-sm">Podaj kwotę, aby zobaczyć wynik.</p>;
    }

    return (
        <div className="space-y-4">
            {/* Wielka liczba */}
            <div>
                <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{netLabel}</p>
                <p className="text-emerald-400 font-bold text-4xl mt-1 tracking-tight">
                    {formatMoney(result.netMonthly)} zł
                </p>
                <p className="text-white/40 text-xs mt-1">
                    z {formatMoney(gross)} zł — potrącenia to {result.effectiveBurdenPct.toLocaleString('pl-PL')}%
                </p>
            </div>

            {/* Pasek podziału */}
            {hasBar && (
                <div className="space-y-2">
                    <div className="flex h-3 rounded-full overflow-hidden border border-white/10">
                        <div className="bg-emerald-400" style={{ width: `${(result.netMonthly / gross) * 100}%` }} />
                        {deductions.map((row) => (
                            <div
                                key={row.key}
                                className={COLOR_BY_KEY[row.key] ?? 'bg-white/40'}
                                style={{ width: `${(row.amount / gross) * 100}%` }}
                            />
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Na rękę {formatMoney(result.netMonthly)} zł
                        </span>
                        {deductions.map((row) => (
                            <span key={row.key} className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${COLOR_BY_KEY[row.key] ?? 'bg-white/40'}`} />
                                {row.label.split(' (')[0]} {formatMoney(row.amount)} zł
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Dodatkowe statystyki (B2B: faktura brutto/VAT, stawka netto za godzinę) */}
            {extraStats && extraStats.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {extraStats.map((s) => (
                        <div key={s.label} className="bg-white/5 rounded-[5px] p-4">
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{s.label}</p>
                            <p className="text-white font-bold text-lg mt-1">{s.value}</p>
                            {s.hint && <p className="text-white/40 text-[11px] mt-0.5">{s.hint}</p>}
                        </div>
                    ))}
                </div>
            )}

            {/* Porównanie form (B2B) */}
            {compare && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(Object.keys(compare) as TaxForm[]).map((form) => (
                        <button
                            key={form}
                            type="button"
                            onClick={() => onSelectForm?.(form)}
                            className={`text-left bg-white/5 border rounded-[5px] p-4 transition-all ${
                                form === activeForm
                                    ? 'border-emerald-400/60'
                                    : 'border-white/5 hover:border-white/20'
                            }`}
                        >
                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">{FORM_LABEL[form]}</p>
                            <p className={`font-bold text-xl mt-1 ${form === activeForm ? 'text-emerald-400' : 'text-white'}`}>
                                {formatMoney(compare[form].netMonthly)} zł
                            </p>
                        </button>
                    ))}
                </div>
            )}

            {/* Skąd ta kwota? */}
            <div className="border border-white/5 rounded-[5px] overflow-hidden">
                <button
                    type="button"
                    onClick={() => setShowBreakdown(!showBreakdown)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-surface/50 hover:bg-white/5 transition-all text-xs font-bold text-white/70"
                >
                    <span>Skąd ta kwota?</span>
                    {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showBreakdown && (
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="text-white/40 text-left border-t border-white/5">
                                <th className="px-4 py-2 font-medium">Pozycja</th>
                                <th className="px-2 py-2 font-medium text-right">Podstawa</th>
                                <th className="px-2 py-2 font-medium text-right">Stawka</th>
                                <th className="px-4 py-2 font-medium text-right">Kwota</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.map((row) => (
                                <tr key={row.key} className={`border-t border-white/5 ${row.kind === 'info' ? 'text-white/40' : 'text-white/70'}`}>
                                    <td className="px-4 py-1.5">{row.label}</td>
                                    <td className="px-2 py-1.5 text-right">{row.base !== undefined ? `${formatMoney(row.base)} zł` : '—'}</td>
                                    <td className="px-2 py-1.5 text-right">{row.ratePct !== undefined ? `${row.ratePct.toLocaleString('pl-PL')}%` : '—'}</td>
                                    <td className="px-4 py-1.5 text-right font-medium">{formatMoney(row.amount)} zł</td>
                                </tr>
                            ))}
                            <tr className="border-t border-white/10 text-emerald-400 font-bold">
                                <td className="px-4 py-2">Na rękę</td>
                                <td className="px-2 py-2" />
                                <td className="px-2 py-2" />
                                <td className="px-4 py-2 text-right">{formatMoney(result.netMonthly)} zł</td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </div>

            {/* Uproszczenia / ostrzeżenia */}
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
    );
}
