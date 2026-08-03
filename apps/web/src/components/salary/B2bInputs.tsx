import { useMemo, useState } from 'react';
import {
    b2bMonthly,
    b2bCompareForms,
    PARAMS_BY_YEAR,
    DEFAULT_YEAR,
    type SalaryResult,
    type TaxForm,
    type ZusVariant,
} from '../../lib/salaryMath';
import { Pills, ToggleRow, inputClass, labelClass, parseNum } from './ui';
import { formatMoney } from '../../lib/formatters';
import type { ExtraStat } from './ResultPanel';

const round2 = (v: number) => Math.round(v * 100) / 100;

export interface B2bState {
    revenue: string;
    setRevenue: (v: string) => void;
    costs: string;
    setCosts: (v: string) => void;
    taxForm: TaxForm;
    setTaxForm: (v: TaxForm) => void;
    ryczaltRate: string;
    setRyczaltRate: (v: string) => void;
    zusVariant: ZusVariant;
    setZusVariant: (v: ZusVariant) => void;
    chorobowa: boolean;
    setChorobowa: (v: boolean) => void;
    vatRate: string;
    setVatRate: (v: string) => void;
    hours: string;
    setHours: (v: string) => void;
    result: SalaryResult;
    compare: Record<TaxForm, SalaryResult>;
    extraStats: ExtraStat[];
}

/** Stan + wynik kalkulatora B2B (z porównaniem 3 form opodatkowania). */
export function useB2bCalculator(): B2bState {
    const [revenue, setRevenue] = useState('15000');
    const [costs, setCosts] = useState('250');
    const [taxForm, setTaxForm] = useState<TaxForm>('liniowy');
    const [ryczaltRate, setRyczaltRate] = useState('12');
    const [zusVariant, setZusVariant] = useState<ZusVariant>('duzy');
    const [chorobowa, setChorobowa] = useState(true);
    const [vatRate, setVatRate] = useState('23');
    const [hours, setHours] = useState('168');

    const base = useMemo(
        () => ({
            monthlyRevenue: parseNum(revenue),
            monthlyCosts: parseNum(costs),
            zusVariant,
            chorobowa,
        }),
        [revenue, costs, zusVariant, chorobowa]
    );

    const rate = parseNum(ryczaltRate) / 100;
    const result = useMemo(
        () => b2bMonthly({ ...base, taxForm, ryczaltRate: rate }),
        [base, taxForm, rate]
    );
    const compare = useMemo(() => b2bCompareForms(base, rate), [base, rate]);

    // Faktura brutto/VAT (informacyjnie — VAT jest neutralny dla dochodu) + stawka netto/godz.
    const extraStats = useMemo<ExtraStat[]>(() => {
        const revenueNum = parseNum(revenue);
        if (revenueNum <= 0) return [];
        const vat = vatRate === 'zw' ? 0 : parseNum(vatRate) / 100;
        const vatAmount = round2(revenueNum * vat);
        const brutto = round2(revenueNum + vatAmount);
        const h = parseNum(hours);
        const netPerHour = h > 0 ? round2(result.netMonthly / h) : 0;
        return [
            {
                label: 'Faktura brutto',
                value: `${formatMoney(brutto)} zł`,
                hint: vatRate === 'zw' ? 'zwolniony z VAT' : `VAT ${vatRate}%: ${formatMoney(vatAmount)} zł`,
            },
            {
                label: 'Stawka netto / godz.',
                value: `${formatMoney(netPerHour)} zł`,
                hint: h > 0 ? `na rękę przy ${h} h/mies.` : 'podaj liczbę godzin',
            },
        ];
    }, [revenue, vatRate, hours, result.netMonthly]);

    return {
        revenue, setRevenue, costs, setCosts, taxForm, setTaxForm,
        ryczaltRate, setRyczaltRate, zusVariant, setZusVariant,
        chorobowa, setChorobowa, vatRate, setVatRate, hours, setHours,
        result, compare, extraStats,
    };
}

export default function B2bInputs({ state }: { state: B2bState }) {
    const p = PARAMS_BY_YEAR[DEFAULT_YEAR];
    const ryczaltOptions = p.b2b.ryczaltRates.map(
        (r) => [String(r * 100).replace('.', ','), `${(r * 100).toLocaleString('pl-PL')}%`] as const
    );

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className={labelClass}>Przychód netto — bez VAT (zł/mies.)</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={state.revenue}
                        onChange={(e) => state.setRevenue(e.target.value)}
                        className={inputClass}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Usługi księgowe i inne koszty działalności (zł/mies.)</label>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={state.costs}
                        onChange={(e) => state.setCosts(e.target.value)}
                        className={inputClass}
                        placeholder="250"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <span className={labelClass}>Stawka VAT (do faktury brutto)</span>
                    <Pills
                        small
                        options={[['23', '23%'], ['8', '8%'], ['5', '5%'], ['zw', 'zw.']] as const}
                        value={state.vatRate}
                        onChange={state.setVatRate}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className={labelClass}>Godziny pracy (h/mies.)</label>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={state.hours}
                        onChange={(e) => state.setHours(e.target.value)}
                        className={inputClass}
                        placeholder="168"
                    />
                </div>
            </div>

            <div className="space-y-1.5">
                <span className={labelClass}>Forma opodatkowania</span>
                <Pills
                    options={[['skala', 'Skala 12/32%'], ['liniowy', 'Liniowy 19%'], ['ryczalt', 'Ryczałt']] as const}
                    value={state.taxForm}
                    onChange={state.setTaxForm}
                />
            </div>

            {state.taxForm === 'ryczalt' && (
                <div className="space-y-1.5">
                    <span className={labelClass}>Stawka ryczałtu (zależna od branży)</span>
                    <Pills small options={ryczaltOptions} value={state.ryczaltRate} onChange={state.setRyczaltRate} />
                </div>
            )}

            <div className="space-y-1.5">
                <span className={labelClass}>Składki ZUS</span>
                <Pills
                    options={[
                        ['ulga_na_start', 'Ulga na start'],
                        ['preferencyjny', 'Preferencyjny'],
                        ['duzy', 'Pełny ZUS'],
                    ] as const}
                    value={state.zusVariant}
                    onChange={state.setZusVariant}
                />
            </div>

            {state.zusVariant !== 'ulga_na_start' && (
                <details className="group">
                    <summary className="cursor-pointer text-xs font-bold text-white/50 hover:text-white/80 transition-colors list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform">▸</span> Opcje zaawansowane
                    </summary>
                    <div className="mt-3 pl-4 border-l border-white/10">
                        <ToggleRow
                            label="Dobrowolna składka chorobowa"
                            hint="Prawo do zasiłku chorobowego"
                            checked={state.chorobowa}
                            onChange={state.setChorobowa}
                        />
                    </div>
                </details>
            )}
        </div>
    );
}
