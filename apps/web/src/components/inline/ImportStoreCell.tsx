import { useMemo, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useStores, type Store } from '../../hooks/useQueries';
import InlinePopover from './InlinePopover';

interface ImportStoreCellProps {
    /** Bieżąca nazwa sklepu w wierszu podglądu */
    store: string;
    editable: boolean;
    /** Wybrano sklep — rodzic aktualizuje lokalny stan (kategoria idzie za sklepem) */
    onPick: (store: Store) => void;
    className?: string;
}

/**
 * Inline wybór sklepu w PODGLĄDZIE importu — analogiczny UX do InlineStoreEditor
 * z listy transakcji, ale wiersze nie są jeszcze zapisane (brak expenseId), więc
 * zamiast PATCH /expenses/:id/store oddajemy wybrany Store przez onPick, a rodzic
 * aktualizuje lokalny parsedData. Kategoria idzie za sklepem (store.category).
 */
export default function ImportStoreCell({ store, editable, onPick, className }: ImportStoreCellProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const { data: stores = [] } = useStores();

    const grouped = useMemo(() => {
        const filtered = stores.filter(s =>
            s.name.toLowerCase().includes(search.toLowerCase()) &&
            s.name.toLowerCase() !== 'przewalutowanie'
        );
        const g: Record<string, Store[]> = {};
        filtered.forEach(s => {
            const cat = s.category?.name || 'Inne';
            (g[cat] ||= []).push(s);
        });
        return g;
    }, [stores, search]);

    if (!editable) {
        return <span className={`truncate ${className || ''}`} title={store}>{store || '—'}</span>;
    }

    const pick = (s: Store) => {
        onPick(s);
        setOpen(false);
        setSearch('');
    };

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
                className={`group/store inline-flex items-center gap-1.5 text-left max-w-full cursor-pointer rounded-[4px] -mx-1 px-1 hover:bg-white/5 hover:text-emerald-300 transition-colors ${className || ''}`}
                title="Kliknij, aby zmienić sklep"
            >
                <span className="truncate">{store || '—'}</span>
                <Pencil size={11} className="shrink-0 text-white/20 group-hover/store:text-emerald-300 transition-colors" />
            </button>
            <InlinePopover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={260}>
                <div className="p-2 sticky top-0 bg-[#141414] z-10 border-b border-white/5">
                    <input
                        autoFocus
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Szukaj sklepu..."
                        onClick={e => e.stopPropagation()}
                        className="w-full h-8 px-2 bg-white/5 border border-white/10 rounded-[4px] text-xs text-white/90 placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
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
                                onClick={(e) => { e.stopPropagation(); pick(s); }}
                                className="w-full text-left px-5 py-2.5 hover:bg-emerald-400/10 text-[11px] font-bold text-white/70 hover:text-white transition-all"
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
