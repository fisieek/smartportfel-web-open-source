import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import { useToast } from '../context/ToastContext';
import { ArrowRightLeft } from 'lucide-react';
import { usePersonalAccounts, useInvestmentAccounts } from '../hooks/useQueries';
import api from '../lib/api';
import { transferSchema } from '../lib/validations';

interface InvestmentTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function InvestmentTransferModal({ isOpen, onClose, onSuccess }: InvestmentTransferModalProps) {
    const { data: allPersonalAccounts = [], isLoading: loadingPersonal } = usePersonalAccounts();
    const { data: allInvestmentAccounts = [], isLoading: loadingInvestment } = useInvestmentAccounts();

    // Tylko konta pieniężne — bez kart lojalnościowych/podarunkowych, kont punktowych (PKT) i zamkniętych
    const personalAccounts = allPersonalAccounts.filter((acc: any) =>
        (!acc.type || acc.type === 'BANK' || acc.type === 'CASH') && acc.currency !== 'PKT' && !acc.closedAt
    );
    // Pomijaj zamknięte konta inwestycyjne jako cel transferu
    const investmentAccounts = allInvestmentAccounts.filter((acc: any) => !acc.closedAt);
    const loading = loadingPersonal || loadingInvestment;
    const { success, error: toastError } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState({
        personalAccountId: '',
        investmentAccountId: '',
        amount: ''
    });
    const [errors, setErrors] = useState<Record<string, string>>({});

    const validate = () => {
        const formData = {
            amount: form.amount,
            date: new Date().toISOString().slice(0, 10),
            fromAccountId: form.personalAccountId,
            toAccountId: form.investmentAccountId,
        };

        const result = transferSchema.safeParse(formData);

        if (!result.success) {
            const newErrors: Record<string, string> = {};
            result.error.issues.forEach((issue) => {
                const path = issue.path[0];
                if (typeof path === 'string') {
                    newErrors[path] = issue.message;
                }
            });
            setErrors(newErrors);
            return false;
        }

        setErrors({});
        return true;
    };

    // Auto-select first accounts when loaded
    useEffect(() => {
        if (isOpen && personalAccounts.length > 0 && !form.personalAccountId) {
            setForm(f => ({ ...f, personalAccountId: personalAccounts[0].id }));
        }
    }, [isOpen, personalAccounts, form.personalAccountId]);

    useEffect(() => {
        if (isOpen && investmentAccounts.length > 0 && !form.investmentAccountId) {
            setForm(f => ({ ...f, investmentAccountId: investmentAccounts[0].id }));
        }
    }, [isOpen, investmentAccounts, form.investmentAccountId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setSubmitting(true);
        try {
            await api.post('/investment-accounts/transfer', { ...form, date: new Date().toISOString().slice(0, 10) });
            success('Przelew zakończony pomyślnie');
            onSuccess();
            onClose();
            setForm({ personalAccountId: '', investmentAccountId: '', amount: '' });
        } catch (error: any) {
            toastError(error.response?.data?.error || 'Błąd przelewu');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Zasil konto inwestycyjne">
            {loading ? (
                <div className="p-8 text-center text-white/20 font-black uppercase tracking-widest text-xs">Ładowanie kont...</div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Z konta osobistego</label>
                        <select
                            value={form.personalAccountId}
                            onChange={(e) => setForm({ ...form, personalAccountId: e.target.value })}
                            className="w-full bg-white/5 border border-white/5 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-medium cursor-pointer transition-all"
                        >
                            {personalAccounts.map(acc => (
                                <option key={acc.id} value={acc.id} className="bg-[#0a0a0a]">
                                    {acc.name} ({acc.bank}) - {Number(acc.balance).toLocaleString()} {acc.currency || 'PLN'}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-center py-1">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 text-primary">
                            <ArrowRightLeft size={20} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Na konto inwestycyjne</label>
                        <select
                            value={form.investmentAccountId}
                            onChange={(e) => setForm({ ...form, investmentAccountId: e.target.value })}
                            className="w-full bg-white/5 border border-white/5 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-medium cursor-pointer transition-all"
                        >
                            {investmentAccounts.map(acc => (
                                <option key={acc.id} value={acc.id} className="bg-[#0a0a0a]">
                                    {acc.name} - Saldo: {Number(acc.balance).toLocaleString()} PLN
                                </option>
                            ))}
                        </select>
                        {errors.toAccountId && <p className="text-[9px] text-danger font-bold uppercase tracking-wider ml-1 mt-1">{errors.toAccountId}</p>}
                    </div>

                    <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">PLN</span>
                        <input
                            type="number"
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => setForm({ ...form, amount: e.target.value })}
                            placeholder="0.00"
                            className="w-full bg-white/5 border border-white/5 rounded-[5px] pl-14 pr-4 py-3 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-black text-2xl placeholder:text-white/10"
                        />
                        {errors.amount && <p className="text-[9px] text-danger font-bold uppercase tracking-wider ml-1 mt-1">{errors.amount}</p>}
                    </div>

                    <div className="flex gap-3 justify-end pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest"
                        >
                            Anuluj
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="h-9 px-6 bg-white text-black rounded-[5px] font-black hover:bg-gray-200 transition-all shadow-xl shadow-black/20 disabled:opacity-50 text-[10px] active:scale-95 uppercase tracking-widest"
                        >
                            {submitting ? 'Przesyłanie...' : 'Wykonaj transfer'}
                        </button>
                    </div>
                    {personalAccounts.length === 0 && (
                        <p className="text-[10px] text-amber-500/60 text-center font-black uppercase tracking-widest italic mt-4">
                            Musisz mieć przynajmniej jedno konto osobiste z balansem.
                        </p>
                    )}
                </form>
            )}
        </Modal>
    );
}
