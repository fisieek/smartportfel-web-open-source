import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import Modal from './ui/Modal';
import { Button } from './ui/button';

interface ArchiveAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    accountName: string;
    // Wywoływane z datą zamknięcia (YYYY-MM-DD). Rzuca, by zablokować zamknięcie modalu przy błędzie.
    onConfirm: (closedAt: string) => Promise<void>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function ArchiveAccountModal({ isOpen, onClose, accountName, onConfirm }: ArchiveAccountModalProps) {
    const [date, setDate] = useState(todayISO());
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen) setDate(todayISO());
    }, [isOpen]);

    const handleConfirm = async () => {
        if (!date) return;
        setSubmitting(true);
        try {
            await onConfirm(date);
            onClose();
        } catch {
            // błąd obsłuży rodzic (toast); zostawiamy modal otwarty
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Zamknij konto" subtitle={accountName} maxWidth="max-w-md">
            <div className="space-y-4">
                <p className="text-white/50 text-xs leading-relaxed">
                    Konto zostanie oznaczone jako <span className="text-white/80 font-semibold">zamknięte</span> i zniknie z sum
                    majątku. Historia i transakcje pozostaną zachowane — konto możesz później przywrócić.
                </p>
                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Data zamknięcia</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                        <input
                            type="date"
                            value={date}
                            max={todayISO()}
                            onChange={(e) => setDate(e.target.value)}
                            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium [color-scheme:dark] text-sm cursor-pointer"
                        />
                    </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>Anuluj</Button>
                    <Button variant="destructive" onClick={handleConfirm} disabled={submitting || !date}>
                        {submitting ? 'Zamykanie…' : 'Zamknij konto'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
