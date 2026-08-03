import { useMemo, useState } from 'react';
import { uopGrossToNet, uopNetToGross, PARAMS_BY_YEAR, DEFAULT_YEAR, type SalaryResult } from '../../lib/salaryMath';
import { Pills, PresetChips, ToggleRow, inputClass, labelClass, parseNum } from './ui';

type Direction = 'brutto' | 'netto';

export interface UopState {
    direction: Direction;
    setDirection: (d: Direction) => void;
    amount: string;
    setAmount: (v: string) => void;
    ppkOn: boolean;
    setPpkOn: (v: boolean) => void;
    ppkRate: string;
    setPpkRate: (v: string) => void;
    under26: boolean;
    setUnder26: (v: boolean) => void;
    kup: 'standard' | 'increased';
    setKup: (v: 'standard' | 'increased') => void;
    result: SalaryResult;
}

/** Stan + wynik kalkulatora UoP (wyniki live przez useMemo, bez przycisku). */
export function useUopCalculator(): UopState {
    const [direction, setDirection] = useState<Direction>('brutto');
    const [amount, setAmount] = useState('8000');
    const [ppkOn, setPpkOn] = useState(false);
    const [ppkRate, setPpkRate] = useState('2');
    const [under26, setUnder26] = useState(false);
    const [kup, setKup] = useState<'standard' | 'increased'>('standard');

    const result = useMemo(() => {
        const opts = {
            ppkEmployeeRate: ppkOn ? parseNum(ppkRate) / 100 : null,
            under26,
            kup,
        };
        const value = parseNum(amount);
        return direction === 'brutto'
            ? uopGrossToNet({ ...opts, grossMonthly: value })
            : uopNetToGross(value, opts);
    }, [direction, amount, ppkOn, ppkRate, under26, kup]);

    return { direction, setDirection, amount, setAmount, ppkOn, setPpkOn, ppkRate, setPpkRate, under26, setUnder26, kup, setKup, result };
}

const PPK_RATES = ['0,5', '1', '1,5', '2', '3', '4'] as const;

export default function UopInputs({ state }: { state: UopState }) {
    const p = PARAMS_BY_YEAR[DEFAULT_YEAR];
    const presets = [
        { label: `Minimalna ${p.minWage.toLocaleString('pl-PL')}`, value: p.minWage },
        { label: '6000', value: 6000 },
        { label: '8000', value: 8000 },
        { label: '10 000', value: 10000 },
        { label: '12 000', value: 12000 },
    ];

    return (
        <div className="space-y-4">
            <Pills
                options={[['brutto', 'Znam brutto'], ['netto', 'Znam netto (na rękę)']] as const}
                value={state.direction}
                onChange={state.setDirection}
            />

            <div className="space-y-1.5">
                <label className={labelClass}>
                    {state.direction === 'brutto' ? 'Wynagrodzenie brutto (zł/mies.)' : 'Oczekiwane netto (zł/mies.)'}
                </label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={state.amount}
                    onChange={(e) => state.setAmount(e.target.value)}
                    className={inputClass}
                />
            </div>

            {state.direction === 'brutto' && (
                <PresetChips presets={presets} current={state.amount} onSelect={(v) => state.setAmount(String(v))} />
            )}

            <details className="group">
                <summary className="cursor-pointer text-xs font-bold text-white/50 hover:text-white/80 transition-colors list-none flex items-center gap-1">
                    <span className="group-open:rotate-90 transition-transform">▸</span> Opcje zaawansowane (PPK, ulga dla młodych, koszty)
                </summary>
                <div className="mt-3 space-y-3 pl-4 border-l border-white/10">
                    <ToggleRow
                        label="Uczestniczę w PPK"
                        hint={`Wpłata pracodawcy ${(p.ppk.employerDefault * 100).toLocaleString('pl-PL')}% trafia na Twoje konto PPK (i podnosi podstawę PIT)`}
                        checked={state.ppkOn}
                        onChange={state.setPpkOn}
                    />
                    {state.ppkOn && (
                        <div className="space-y-1.5">
                            <span className={labelClass}>Twoja wpłata do PPK (%)</span>
                            <Pills
                                small
                                options={PPK_RATES.map((r) => [r, `${r}%`] as const)}
                                value={state.ppkRate as (typeof PPK_RATES)[number]}
                                onChange={state.setPpkRate}
                            />
                        </div>
                    )}
                    <ToggleRow
                        label="Mam mniej niż 26 lat (ulga dla młodych)"
                        checked={state.under26}
                        onChange={state.setUnder26}
                    />
                    <ToggleRow
                        label="Pracuję poza miejscowością zamieszkania (koszty 300 zł)"
                        checked={state.kup === 'increased'}
                        onChange={(v) => state.setKup(v ? 'increased' : 'standard')}
                    />
                </div>
            </details>
        </div>
    );
}
