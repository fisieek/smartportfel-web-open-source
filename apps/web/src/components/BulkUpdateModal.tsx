import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Modal from './ui/Modal';

interface Investment {
    id: string;
    name: string;
    currentValue: number;
    quantity: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    investments: Investment[];
    onConfirm: (updates: { id: string, marketValue: number }[]) => Promise<void>;
}

export default function BulkUpdateModal({ isOpen, onClose, investments, onConfirm }: Props) {
    const [updates, setUpdates] = useState<Record<string, string>>(
        Object.fromEntries(investments.map(inv => [inv.id, inv.currentValue.toString()]))
    );
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const updateList = Object.entries(updates).map(([id, val]) => ({
                id,
                marketValue: parseFloat(val)
            }));
            await onConfirm(updateList);
            onClose();
        } catch (error) {
            console.error('Błąd w modalu masowej aktualizacji:', error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Zaktualizuj wartości portfela">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                <p className="text-white/20 font-black uppercase tracking-widest text-[10px] mb-6 ml-1 leading-relaxed">
                    Wprowadź aktualną cenę rynkową za jedną sztukę dla każdego instrumentu.
                </p>

                {investments.map(inv => (
                    <div key={inv.id} className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:bg-white/[0.08] hover:border-white/10 group">
                        <div className="flex-1">
                            <p className="text-white font-bold">{inv.name}</p>
                            <p className="text-[10px] text-white/20 font-black uppercase tracking-widest mt-0.5">Ilość: {inv.quantity}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="text-[10px] font-black text-white/40 uppercase tracking-widest">Cena (PLN):</label>
                            <input
                                type="number"
                                step="0.01"
                                value={updates[inv.id] || ''}
                                onChange={e => setUpdates(prev => ({ ...prev, [inv.id]: e.target.value }))}
                                className="w-32 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-right font-black focus:outline-none focus:border-primary/50 transition-all placeholder:text-white/10"
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex gap-3 mt-8 justify-end">
                <button
                    type="button"
                    onClick={onClose}
                    className="py-3 px-8 rounded-xl font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm"
                >
                    Anuluj
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-10 py-3.5 bg-white text-black rounded-2xl font-black hover:bg-gray-200 transition-all shadow-xl shadow-black/20 flex items-center gap-2 disabled:opacity-50 text-xs active:scale-95 uppercase tracking-widest"
                >
                    {submitting && <RefreshCw className="animate-spin" size={18} />}
                    {submitting ? 'Aktualizowanie...' : 'Zaktualizuj wszystko'}
                </button>
            </div>
        </Modal>
    );
}
