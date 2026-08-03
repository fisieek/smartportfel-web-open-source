import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface InlinePopoverProps {
    open: boolean;
    onClose: () => void;
    anchorRef: RefObject<HTMLElement>;
    /** Stała szerokość panelu; domyślnie = szerokość anchora (min. 220px) */
    width?: number;
    children: ReactNode;
}

/**
 * Lekki popover renderowany do `document.body` (portal + fixed) — nie jest
 * przycinany przez `overflow-hidden` kontenerów tabel/kart. Zamyka się przy
 * kliknięciu na zewnątrz, klawiszu Escape i scrollu poza panelem.
 */
export default function InlinePopover({ open, onClose, anchorRef, width, children }: InlinePopoverProps) {
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef.current) {
            // Pozycja wynika z pomiaru DOM (`getBoundingClientRect`), więc jej wyliczenie
            // i wyzerowanie muszą siedzieć w tym samym `useLayoutEffect` — nie da się jej
            // wyprowadzić z propsów w trakcie renderu.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPos(null);
            return;
        }
        const r = anchorRef.current.getBoundingClientRect();
        const w = width ?? Math.max(r.width, 220);
        let left = r.left;
        if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
        if (left < 8) left = 8;
        const spaceBelow = window.innerHeight - r.bottom - 8;
        const spaceAbove = r.top - 8;

        let top: number | undefined = r.bottom + 4;
        let bottom: number | undefined = undefined;
        let maxHeight = 420;

        if (spaceBelow < 300 && spaceAbove > spaceBelow) {
            top = undefined;
            bottom = window.innerHeight - r.top + 4;
            maxHeight = Math.min(420, spaceAbove);
        } else {
            maxHeight = Math.min(420, spaceBelow);
        }

        setPos({ top, bottom, left, width: w, maxHeight });
    }, [open, anchorRef, width]);

    useEffect(() => {
        if (!open) return;

        const isInside = (target: Node | null) =>
            !!(panelRef.current?.contains(target) || anchorRef.current?.contains(target));

        const handleDown = (e: MouseEvent) => { if (!isInside(e.target as Node)) onClose(); };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const handleScroll = (e: Event) => { if (!panelRef.current?.contains(e.target as Node)) onClose(); };

        // setTimeout, by nie złapać klika, który właśnie otworzył popover
        const t = setTimeout(() => {
            window.addEventListener('mousedown', handleDown);
            window.addEventListener('keydown', handleKey);
            window.addEventListener('scroll', handleScroll, true);
        }, 0);

        return () => {
            clearTimeout(t);
            window.removeEventListener('mousedown', handleDown);
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [open, onClose, anchorRef]);

    if (!open || !pos) return null;

    return createPortal(
        <div
            ref={panelRef}
            className={`fixed z-[999] bg-[#141414] border border-white/10 rounded-[5px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-y-auto custom-scrollbar animate-in fade-in duration-200 backdrop-blur-xl ${pos.bottom ? 'slide-in-from-bottom-2 origin-bottom' : 'slide-in-from-top-2 origin-top'}`}
            style={{ 
                top: pos.top, 
                bottom: pos.bottom, 
                left: pos.left, 
                width: pos.width,
                maxHeight: pos.maxHeight
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {children}
        </div>,
        document.body
    );
}

/**
 * Edycja inline z listy dotyczy WYŁĄCZNIE wydatków użytkownika.
 * Wykluczamy wpływy/przelewy (type), wirtualne strony przelewów (_side)
 * oraz wpisy współczłonków gospodarstwa (autorstwo egzekwuje też backend).
 */
export function isInlineEditable(tx: any): boolean {
    return tx?.type === 'expense' && !tx?._side && !tx?.isFromCoMember;
}
