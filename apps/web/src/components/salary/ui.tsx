// Wspólne drobiazgi UI kalkulatorów wynagrodzeń.
// Style skopiowane 1:1 z components/LoanCalculator.tsx (ciemny panel) —
// celowo NIE refaktorujemy LoanCalculatora, to żywa, zaindeksowana strona.

export const inputClass =
    'w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium';

export const labelClass = 'text-[9px] font-black text-white/50 uppercase tracking-widest ml-1';

export const parseNum = (value: string) => {
    const n = parseFloat(value.replace(',', '.').replace(/\s/g, ''));
    return isNaN(n) ? 0 : n;
};

interface PillsProps<T extends string> {
    options: ReadonlyArray<readonly [T, string]>;
    value: T;
    onChange: (value: T) => void;
    small?: boolean;
}

/** Rządek przycisków-pigułek (jedna aktywna) — wzorzec z LoanCalculatora. */
export function Pills<T extends string>({ options, value, onChange, small }: PillsProps<T>) {
    return (
        <div className="flex gap-2 flex-wrap">
            {options.map(([val, label]) => (
                <button
                    key={val}
                    type="button"
                    onClick={() => onChange(val)}
                    className={`${small ? 'px-3 py-1' : 'px-3 py-1.5'} text-xs rounded-[4px] border transition-all ${
                        value === val
                            ? 'bg-white border-white text-black font-bold'
                            : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

interface PresetChipsProps {
    presets: Array<{ label: string; value: number }>;
    current: string;
    onSelect: (value: number) => void;
}

/** Chipy szybkiego wyboru kwoty (np. minimalna krajowa, 8000…). */
export function PresetChips({ presets, current, onSelect }: PresetChipsProps) {
    return (
        <div className="flex gap-2 flex-wrap">
            {presets.map((p) => (
                <button
                    key={p.label}
                    type="button"
                    onClick={() => onSelect(p.value)}
                    className={`px-3 py-1 text-xs rounded-full border transition-all ${
                        parseNum(current) === p.value
                            ? 'bg-white border-white text-black font-bold'
                            : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                    }`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    );
}

interface ToggleRowProps {
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    hint?: string;
}

/** Wiersz z checkboxem do sekcji „opcje zaawansowane". */
export function ToggleRow({ label, checked, onChange, hint }: ToggleRowProps) {
    return (
        <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/20 bg-transparent accent-white"
            />
            <span className="text-sm text-white/70 group-hover:text-white transition-colors">
                {label}
                {hint && <span className="block text-xs text-white/40">{hint}</span>}
            </span>
        </label>
    );
}
