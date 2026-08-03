import { useState, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import Modal from './ui/Modal';
import { Button } from './ui/button';

export interface SellableInvestment {
    id: string;
    name: string;
    quantity: number;
    purchasePrice: number;
    currency?: string;
    account?: { name: string; provider: string } | null;
    isHistorical?: boolean;
}

interface SellInvestmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    investment: SellableInvestment | null;
    // Rzuca, by zablokować zamknięcie modalu przy błędzie (rodzic pokazuje toast).
    onConfirm: (payload: { quantity: number; salePrice: number; saleDate: string }) => Promise<void>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SellInvestmentModal({ isOpen, onClose, investment, onConfirm }: SellInvestmentModalProps) {
    const [quantity, setQuantity] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [date, setDate] = useState(todayISO());
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && investment) {
            setQuantity(String(investment.quantity));
            setSalePrice('');
            setDate(todayISO());
        }
    }, [isOpen, investment]);

    if (!investment) return null;

    const currency = investment.currency || 'PLN';
    const maxQty = Number(investment.quantity);
    const qtyNum = parseFloat(quantity.replace(',', '.'));
    const priceNum = parseFloat(salePrice.replace(',', '.'));
    const validQty = !isNaN(qtyNum) && qtyNum > 0 && qtyNum <= maxQty + 1e-9;
    const validPrice = !isNaN(priceNum) && priceNum >= 0;
    const canSubmit = validQty && validPrice && !!date && !submitting;

    const realized = validQty && validPrice ? (priceNum - Number(investment.purchasePrice)) * qtyNum : null;
    const proceeds = validQty && validPrice ? priceNum * qtyNum : null;
    const realizedPositive = (realized ?? 0) >= 0;

    const handleConfirm = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        try {
            await onConfirm({ quantity: qtyNum, salePrice: priceNum, saleDate: date });
            onClose();
        } catch {
            // błąd obsłuży rodzic (toast)
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sprzedaj pozycję" subtitle={investment.name} maxWidth="max-w-md">
            <div className="space-y-4">
                <p className="text-white/50 text-xs leading-relaxed">
                    Pozycja zostanie oznaczona jako <span className="text-white/80 font-semibold">sprzedana</span> i trafi do historii
                    ze zrealizowanym wynikiem. Posiadasz <span className="text-white/80 font-semibold">{fmt(maxQty)}</span> szt.
                    {!investment.isHistorical && investment.account ? ` Przychód wróci na saldo konta „${investment.account.name}".` : ''}
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Ilość</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            max={maxQty}
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-bold text-sm"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Cena sprzedaży ({currency})</label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={salePrice}
                            onChange={(e) => setSalePrice(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-bold text-sm"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Data sprzedaży</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                        <input
                            type="date"
                            value={date}
                            max={todayISO()}
                            onChange={(e) => setDate(e.target.value)}
                            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] pl-10 pr-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium [color-scheme:dark] text-sm cursor-pointer"
                        />
                    </div>
                </div>

                {realized !== null && (
                    <div className="bg-white/[0.03] border border-white/5 rounded-[5px] p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Zrealizowany wynik</span>
                            <span className={`text-sm font-black ${realizedPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {realizedPositive ? '+' : ''}{fmt(realized)} {currency}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                                {investment.isHistorical || !investment.account ? 'Przychód' : 'Wróci na konto'}
                            </span>
                            <span className="text-xs font-bold text-white/70">{fmt(proceeds ?? 0)} {currency}</span>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 justify-end pt-1">
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>Anuluj</Button>
                    <Button onClick={handleConfirm} disabled={!canSubmit}>
                        {submitting ? 'Sprzedawanie…' : 'Sprzedaj'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
