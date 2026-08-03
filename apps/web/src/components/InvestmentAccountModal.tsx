import { useState } from 'react';
import Modal from './ui/Modal';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Landmark } from 'lucide-react';
import { useInvalidateQueries } from '../hooks/useQueries';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface InvestmentAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const PROVIDERS = [
    { id: 'REVOLUT', name: 'Revolut', desc: 'Akcje, krypto, ETFy' },
    { id: 'XTB', name: 'XTB', desc: 'Akcje, ETFy' },
    { id: 'GOLDSAVER', name: 'Goldsaver', desc: 'Złoto fizyczne' },
    { id: 'PKO', name: 'Obligacje Skarbowe PKO', desc: 'Obligacje' },
    { id: 'IKE_PKO', name: 'IKE Obligacje Skarbowe PKO', desc: 'Obligacje 10-letnie EDO' }
];

const ACCOUNT_TYPES = [
    { id: 'STANDARD', name: 'Standardowe', desc: 'Zwykłe konto maklerskie' },
    { id: 'IKE', name: 'IKE', desc: 'Limit roczny, zysk bez podatku Belki' },
    { id: 'IKZE', name: 'IKZE', desc: 'Limit roczny + ulga w PIT' }
];

export default function InvestmentAccountModal({ isOpen, onClose, onSuccess }: InvestmentAccountModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        name: '',
        provider: '',
        balance: '0',
        currency: 'PLN',
        accountType: 'STANDARD',
        ikzeBusiness: false
    });

    const { success, error: toastError } = useToast();
    const { invalidateInvestmentAccounts } = useInvalidateQueries();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.provider) {
            toastError('Wybierz brokera');
            return;
        }

        setSubmitting(true);
        try {
            const providerName = PROVIDERS.find(p => p.id === form.provider)?.name;
            await api.post('/investment-accounts', {
                ...form,
                balance: parseFloat(form.balance.toString().replace(',', '.')),
                name: form.name || providerName
            });
            success('Konto inwestycyjne utworzone');

            // Invalidate cache dla kont inwestycyjnych
            invalidateInvestmentAccounts();

            onSuccess();
            onClose();
            setForm({ name: '', provider: '', balance: '0', currency: 'PLN', accountType: 'STANDARD', ikzeBusiness: false });
        } catch (error) {
            console.error('Błąd tworzenia konta:', error);
            toastError('Nie udało się utworzyć konta');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Nowe konto inwestycyjne">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Wybierz brokera / instytucję</label>
                    <Select value={form.provider} onValueChange={(val) => setForm({ ...form, provider: val })}>
                        <SelectTrigger className="h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                            <SelectValue placeholder="Wybierz instytucję" />
                        </SelectTrigger>
                        <SelectContent className="z-[101]">
                            {PROVIDERS.map((p) => (
                                <SelectItem key={p.id} value={p.id} className="text-xs">
                                    <div className="flex flex-col">
                                        <span className="font-bold">{p.name}</span>
                                        <span className="text-[10px] text-white/40">{p.desc}</span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Typ konta</label>
                    <div className="grid grid-cols-3 gap-1.5">
                        {ACCOUNT_TYPES.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setForm({ ...form, accountType: t.id, ikzeBusiness: t.id === 'IKZE' ? form.ikzeBusiness : false })}
                                className={`flex flex-col items-start gap-0.5 p-2.5 rounded-[5px] border transition-all text-left ${form.accountType === t.id ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:border-white/15'}`}
                            >
                                <span className={`text-[11px] font-black ${form.accountType === t.id ? 'text-white' : 'text-white/70'}`}>{t.name}</span>
                                <span className="text-[8px] text-white/40 leading-tight">{t.desc}</span>
                            </button>
                        ))}
                    </div>
                    {form.accountType === 'IKZE' && (
                        <label className="flex items-center gap-2 mt-1.5 ml-1 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={form.ikzeBusiness}
                                onChange={(e) => setForm({ ...form, ikzeBusiness: e.target.checked })}
                                className="accent-white w-3.5 h-3.5"
                            />
                            <span className="text-[10px] text-white/60 font-medium">Prowadzę działalność gospodarczą (wyższy limit wpłat)</span>
                        </label>
                    )}
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Nazwa własna (opcjonalnie)</label>
                    <div className="relative group">
                        <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors" size={14} />
                        <Input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder="np. Moje akcje w XTB"
                            className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Saldo początkowe (PLN)</label>
                    <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 font-black text-[10px]">PLN</span>
                        <Input
                            type="number"
                            value={form.balance}
                            onChange={(e) => setForm({ ...form, balance: e.target.value })}
                            placeholder="0.00"
                            className="h-10 pl-11 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10 appearance-none-all"
                        />
                    </div>
                    <p className="text-[9px] text-white/30 mt-1.5 ml-1 leading-tight font-medium">Konta brokerskie (XTB, Revolut) są wielowalutowe - walutę wybierasz przy każdej inwestycji</p>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                    <Button
                        variant="ghost"
                        type="button"
                        onClick={onClose}
                        className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest"
                    >
                        Anuluj
                    </Button>
                    <Button
                        type="submit"
                        disabled={submitting}
                        className="h-9 px-6 bg-white text-black rounded-[5px] font-black hover:bg-gray-200 transition-all shadow-xl disabled:opacity-50 text-[10px] uppercase tracking-widest"
                    >
                        {submitting ? '...' : 'Dodaj brokera'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
