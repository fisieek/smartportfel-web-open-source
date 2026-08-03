import { useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface InlineAmountEditorProps {
    expenseId: string;
    /** Surowa kwota w walucie transakcji */
    amount: number;
    editable: boolean;
    onUpdated: () => void;
    /** Sformatowany widok kwoty (tryb tylko-do-odczytu / trigger) */
    children: ReactNode;
    /** Skrót waluty pokazany przy inpucie (np. PLN, EUR, PKT) */
    currencyLabel?: string;
}

/**
 * Edycja kwoty wprost z listy. Zapis woła `PUT /expenses/:id { amount }`,
 * który przelicza saldo konta i sprawdza limit debetu (400 → toast + revert).
 */
export default function InlineAmountEditor({
    expenseId, amount, editable, onUpdated, children, currencyLabel
}: InlineAmountEditorProps) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(String(amount));
    const [saving, setSaving] = useState(false);
    const { success, error: toastError } = useToast();

    if (!editable) {
        return <>{children}</>;
    }

    const startEditing = () => {
        setValue(String(amount));
        setEditing(true);
    };

    const cancel = () => { setEditing(false); setValue(String(amount)); };

    const save = async () => {
        if (saving) return;
        const parsed = parseFloat(value.replace(',', '.'));
        if (isNaN(parsed) || parsed <= 0) {
            toastError('Kwota musi być liczbą większą od zera');
            return;
        }
        if (parsed === amount) { setEditing(false); return; }
        setSaving(true);
        try {
            await api.put(`/expenses/${expenseId}`, { amount: parsed });
            success('Kwota zaktualizowana');
            setEditing(false);
            onUpdated();
        } catch (err: any) {
            toastError(err?.response?.data?.message || 'Nie udało się zmienić kwoty');
            cancel();
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); startEditing(); }}
                className="cursor-pointer rounded-[4px] px-1 -mx-1 hover:bg-white/5 transition-colors"
                title="Kliknij, aby zmienić kwotę"
            >
                {children}
            </button>
        );
    }

    return (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <input
                autoFocus
                type="number"
                step="0.01"
                min="0"
                value={value}
                disabled={saving}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); save(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
                }}
                className="w-24 h-8 px-2 text-right bg-white/5 border border-white/15 rounded-[4px] text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {currencyLabel && <span className="text-[10px] text-gray-500 font-normal">{currencyLabel}</span>}
            <button
                type="button"
                disabled={saving}
                onClick={(e) => { e.stopPropagation(); save(); }}
                className="h-8 w-8 flex items-center justify-center rounded-[4px] bg-primary text-black hover:opacity-90 disabled:opacity-40 transition-opacity"
                title="Zapisz"
            >
                <Check size={14} />
            </button>
            <button
                type="button"
                disabled={saving}
                onClick={(e) => { e.stopPropagation(); cancel(); }}
                className="h-8 w-8 flex items-center justify-center rounded-[4px] bg-white/5 text-gray-400 hover:bg-white/10 transition-colors"
                title="Anuluj"
            >
                <X size={14} />
            </button>
        </div>
    );
}
