import { useMemo, useState } from 'react';
import { zlecenieGrossToNet, type SalaryResult } from '../../lib/salaryMath';
import { PresetChips, ToggleRow, inputClass, labelClass, parseNum } from './ui';

export interface ZlecenieState {
    amount: string;
    setAmount: (v: string) => void;
    student: boolean;
    setStudent: (v: boolean) => void;
    chorobowa: boolean;
    setChorobowa: (v: boolean) => void;
    pit2: boolean;
    setPit2: (v: boolean) => void;
    result: SalaryResult;
}

/** Stan + wynik kalkulatora umowy zlecenia. */
export function useZlecenieCalculator(): ZlecenieState {
    const [amount, setAmount] = useState('5000');
    const [student, setStudent] = useState(false);
    const [chorobowa, setChorobowa] = useState(false);
    const [pit2, setPit2] = useState(false);

    const result = useMemo(
        () =>
            zlecenieGrossToNet({
                grossMonthly: parseNum(amount),
                studentUnder26: student,
                chorobowa,
                applyTaxReducing: pit2,
            }),
        [amount, student, chorobowa, pit2]
    );

    return { amount, setAmount, student, setStudent, chorobowa, setChorobowa, pit2, setPit2, result };
}

export default function ZlecenieInputs({ state }: { state: ZlecenieState }) {
    const presets = [
        { label: '3000', value: 3000 },
        { label: '5000', value: 5000 },
        { label: '8000', value: 8000 },
        { label: '12 000', value: 12000 },
    ];

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <label className={labelClass}>Kwota brutto na umowie (zł/mies.)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={state.amount}
                    onChange={(e) => state.setAmount(e.target.value)}
                    className={inputClass}
                />
            </div>

            <PresetChips presets={presets} current={state.amount} onSelect={(v) => state.setAmount(String(v))} />

            <ToggleRow
                label="Jestem uczniem/studentem i mam mniej niż 26 lat"
                hint="Zero składek ZUS i zero podatku — dostajesz całe brutto"
                checked={state.student}
                onChange={state.setStudent}
            />

            {!state.student && (
                <details className="group">
                    <summary className="cursor-pointer text-xs font-bold text-white/50 hover:text-white/80 transition-colors list-none flex items-center gap-1">
                        <span className="group-open:rotate-90 transition-transform">▸</span> Opcje zaawansowane (chorobowa, PIT-2)
                    </summary>
                    <div className="mt-3 space-y-3 pl-4 border-l border-white/10">
                        <ToggleRow
                            label="Dobrowolna składka chorobowa"
                            hint="Daje prawo do zasiłku chorobowego, obniża netto o 2,45% brutto"
                            checked={state.chorobowa}
                            onChange={state.setChorobowa}
                        />
                        <ToggleRow
                            label="Złożyłem/-am PIT-2 u tego zleceniodawcy"
                            hint="Kwota zmniejszająca podatek 300 zł/mies. — tylko u jednego płatnika"
                            checked={state.pit2}
                            onChange={state.setPit2}
                        />
                    </div>
                </details>
            )}
        </div>
    );
}
