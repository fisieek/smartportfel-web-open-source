import { useMemo, useRef, useState, type ReactNode } from 'react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useStores } from '../../hooks/useQueries';
import InlinePopover from './InlinePopover';

interface InlineStoreEditorProps {
    expenseId: string;
    /** Widoczna nazwa wpisu (description) */
    currentName: string;
    editable: boolean;
    onUpdated: () => void;
    /** Klasy dla wyświetlanego tekstu */
    className?: string;
    /** Dodatkowa treść pod nazwą (np. notatka) */
    children?: ReactNode;
}

/**
 * Edycja sklepu wprost z listy — selektor analogiczny do modalu wydatków.
 * Po wyborze sklepu kategoria idzie za sklepem, a widoczna nazwa (description)
 * jest nadpisywana nazwą sklepu (logika po stronie API). Bilansowo neutralne.
 */
export default function InlineStoreEditor({
    expenseId, currentName, editable, onUpdated, className, children
}: InlineStoreEditorProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const { data: stores = [] } = useStores();
    const { success, error: toastError } = useToast();

    const grouped = useMemo(() => {
        const filtered = stores.filter(s =>
            s.name.toLowerCase().includes(search.toLowerCase()) &&
            s.name.toLowerCase() !== 'przewalutowanie'
        );
        const g: Record<string, typeof stores> = {};
        filtered.forEach(s => {
            const cat = s.category?.name || 'Inne';
            (g[cat] ||= []).push(s);
        });
        return g;
    }, [stores, search]);

    if (!editable) {
        return <span className={`truncate max-w-full ${className || ''}`}>{currentName || '—'}{children}</span>;
    }

    const selectStore = async (storeId: string) => {
        if (saving) return;
        setSaving(true);
        try {
            await api.patch(`/expenses/${expenseId}/store`, { storeId });
            success('Sklep zaktualizowany');
            setOpen(false);
            setSearch('');
            onUpdated();
        } catch (err: any) {
            toastError(err?.response?.data?.message || 'Nie udało się zmienić sklepu');
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                className={`text-left truncate max-w-full cursor-pointer rounded-[4px] -mx-1 px-1 hover:bg-white/5 hover:text-primary transition-colors ${className || ''}`}
                title="Kliknij, aby zmienić sklep"
            >
                {currentName || '—'}
            </button>
            {children}
            <InlinePopover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
                <div className="p-2 sticky top-0 bg-[#141414] z-10 border-b border-white/5">
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Szukaj sklepu..."
                        onClick={e => e.stopPropagation()}
                        className="w-full h-8 px-2 bg-white/5 border border-white/10 rounded-[4px] text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                </div>
                {Object.keys(grouped).length === 0 ? (
                    <div className="px-4 py-8 text-[10px] font-black text-white/10 uppercase tracking-[0.2em] text-center">
                        Brak pasujących sklepów
                    </div>
                ) : Object.entries(grouped).map(([cat, items]) => (
                    <div key={cat} className="border-b border-white/5 last:border-0">
                        <div className="px-4 py-1.5 bg-white/5">
                            <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">{cat}</span>
                        </div>
                        {items.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                disabled={saving}
                                onClick={(e) => { e.stopPropagation(); selectStore(s.id); }}
                                className="w-full text-left px-5 py-2.5 hover:bg-white/10 text-[11px] font-bold text-white/70 transition-all disabled:opacity-40"
                            >
                                {s.name}
                            </button>
                        ))}
                    </div>
                ))}
            </InlinePopover>
        </>
    );
}
