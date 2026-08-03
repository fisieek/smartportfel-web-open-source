import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { usePersonalAccounts } from '../../hooks/useQueries';
import InlinePopover from './InlinePopover';

interface InlineAccountEditorProps {
    expenseId: string;
    currentAccountId?: string | null;
    currentAccountName: string;
    editable: boolean;
    onUpdated: () => void;
    className?: string;
}

/**
 * Edycja konta wydatku wprost z listy. Selektor kont + przycisk „Potwierdź".
 * Zmiana woła `PUT /expenses/:id { personalAccountId }`, który po stronie API
 * cofa saldo starego konta i nalicza nowe (przeliczenie OBU kont).
 */
export default function InlineAccountEditor({
    expenseId, currentAccountId, currentAccountName, editable, onUpdated, className
}: InlineAccountEditorProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string | null>(currentAccountId ?? null);
    const [saving, setSaving] = useState(false);
    const { data: accounts = [] } = usePersonalAccounts();
    const { success, error: toastError } = useToast();

    if (!editable) {
        return <span className={className}>{currentAccountName || '—'}</span>;
    }

    const openPopover = () => {
        setSelected(currentAccountId ?? null);
        setOpen(o => !o);
    };

    const confirm = async () => {
        if (saving || !selected || selected === currentAccountId) { setOpen(false); return; }
        setSaving(true);
        try {
            await api.put(`/expenses/${expenseId}`, { personalAccountId: selected });
            success('Konto zaktualizowane');
            setOpen(false);
            onUpdated();
        } catch (err: any) {
            toastError(err?.response?.data?.message || 'Nie udało się zmienić konta');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); openPopover(); }}
                className={`text-left truncate max-w-full cursor-pointer rounded-[4px] -mx-1 px-1 hover:bg-white/5 hover:text-primary transition-colors ${className || ''}`}
                title="Kliknij, aby zmienić konto"
            >
                {currentAccountName || '—'}
            </button>
            <InlinePopover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={240}>
                <div className="py-1 max-h-[320px] overflow-y-auto custom-scrollbar">
                    {(accounts as any[]).map((acc) => {
                        const isSel = selected === acc.id;
                        return (
                            <button
                                key={acc.id}
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSelected(acc.id); }}
                                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-[11px] font-bold transition-colors ${isSel ? 'bg-primary/15 text-white' : 'text-white/70 hover:bg-white/10'}`}
                            >
                                <span className="truncate">{acc.name}</span>
                                {isSel && <Check size={13} className="text-primary shrink-0" />}
                            </button>
                        );
                    })}
                </div>
                <div className="p-2 border-t border-white/10 sticky bottom-0 bg-[#141414]">
                    <button
                        type="button"
                        disabled={saving || !selected || selected === currentAccountId}
                        onClick={(e) => { e.stopPropagation(); confirm(); }}
                        className="w-full h-8 rounded-[4px] bg-primary text-black text-[11px] font-black uppercase tracking-wider transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Zapisywanie...' : 'Potwierdź'}
                    </button>
                </div>
            </InlinePopover>
        </>
    );
}
