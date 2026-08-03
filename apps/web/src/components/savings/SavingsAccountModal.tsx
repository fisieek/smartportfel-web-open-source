import { useState, useEffect } from 'react';
import { Calendar, Trash2 } from 'lucide-react';
import api from '../../lib/api';
import { SUPPORTED_CURRENCIES } from '../../lib/currencies';
import { useToast } from '../../context/ToastContext';
import Modal from '../ui/Modal';
import type { SavingsAccountItem } from '../../hooks/useQueries';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Konto do edycji lub null dla nowego. */
    editingAccount: SavingsAccountItem | null;
    /** Wołane po udanym zapisie (inwalidacja cache). */
    onSaved: () => void;
    /** Prośba o usunięcie edytowanego konta (kontener otwiera ConfirmModal). */
    onRequestDelete: (id: string) => void;
}

type AccountForm = {
    name: string;
    type: 'savings' | 'personal' | 'deposit';
    balance: string | number;
    currency: string;
    bank: string;
    interestRate: string;
    capitalizationType: string;
    promoEndsAt: string;
    postPromoInterestRate: string;
    depositStartDate: string;
    depositDurationMonths: string;
};

const emptyForm = (): AccountForm => ({
    name: '',
    type: 'savings',
    balance: '',
    currency: 'PLN',
    bank: '',
    interestRate: '',
    capitalizationType: 'monthly',
    promoEndsAt: '',
    postPromoInterestRate: '',
    depositStartDate: new Date().toISOString().split('T')[0],
    depositDurationMonths: '3'
});

const formFromAccount = (account: SavingsAccountItem): AccountForm => ({
    name: account.name,
    type: account.type,
    balance: account.balance.toString(),
    currency: account.currency || 'PLN',
    bank: account.bank || '',
    interestRate: account.interestRate?.toString() || '',
    capitalizationType: account.capitalizationType || (account.type === 'deposit' ? 'at_end' : 'monthly'),
    promoEndsAt: account.promoEndsAt ? new Date(account.promoEndsAt).toISOString().split('T')[0] : '',
    postPromoInterestRate: account.postPromoInterestRate?.toString() || '',
    depositStartDate: account.depositStartDate ? new Date(account.depositStartDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    depositDurationMonths: account.depositDurationMonths?.toString() || '3'
});

export default function SavingsAccountModal({ isOpen, onClose, editingAccount, onSaved, onRequestDelete }: Props) {
    const { error: toastError } = useToast();
    const [form, setForm] = useState<AccountForm>(emptyForm);
    const [submitting, setSubmitting] = useState(false);

    // Prefill przy otwarciu (edycja) / reset (nowe konto)
    useEffect(() => {
        if (!isOpen) return;
        setForm(editingAccount ? formFromAccount(editingAccount) : emptyForm());
    }, [isOpen, editingAccount]);

    const handleSave = async () => {
        if (!form.name || !form.bank || form.balance === '') {
            toastError('Wypełnij wszystkie pola poprawnie.');
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                ...form,
                balance: Number(form.balance),
                interestRate: form.interestRate ? Number(form.interestRate) : 0,
                capitalizationType: form.capitalizationType,
                promoEndsAt: form.promoEndsAt || null,
                postPromoInterestRate: form.postPromoInterestRate ? Number(form.postPromoInterestRate) : null,
                depositStartDate: form.type === 'deposit' ? form.depositStartDate : null,
                depositDurationMonths: form.type === 'deposit' ? Number(form.depositDurationMonths) : null
            };

            if (editingAccount) {
                await api.put(`/savings/${editingAccount.id}`, payload);
            } else {
                await api.post('/savings', payload);
            }
            onSaved();
            onClose();
        } catch (error: any) {
            console.error('Błąd zapisywania konta:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || 'Błąd serwera';
            toastError(`Nie udało się zapisać konta: ${msg}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingAccount ? 'Edytuj' : 'Dodaj'}
        >
            <div className="space-y-4">
                {/* Zakładki Typu (KONTO / LOKATA) */}
                {!editingAccount && (
                    <div className="flex bg-white/5 p-1 rounded-[5px] mb-4">
                        <button
                            onClick={() => setForm({ ...form, type: 'savings' })}
                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-[4px] transition-all ${form.type === 'savings' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Konto
                        </button>
                        <button
                            onClick={() => setForm({ ...form, type: 'deposit', capitalizationType: 'at_end' })}
                            className={`flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-[4px] transition-all ${form.type === 'deposit' ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}
                        >
                            Lokata
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Nazwa</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            placeholder={form.type === 'deposit' ? "np. Lokata Dynamiczna" : "np. Konto Oszczędnościowe"}
                            className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Bank</label>
                        <select
                            value={form.bank}
                            onChange={(e) => setForm({ ...form, bank: e.target.value })}
                            className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] appearance-none cursor-pointer font-medium transition-all text-sm"
                        >
                            <option value="" disabled className="bg-[#0a0a0a]">Wybierz bank</option>
                            {[
                                "Alior Bank", "Bank Millennium", "Bank Pekao", "Bank Pocztowy",
                                "BNP Paribas", "Citi Handlowy", "Credit Agricole", "Erste Bank Polska",
                                "ING Bank Śląski", "mBank", "Nest Bank", "PKO Bank Polski",
                                "Revolut", "Toyota Bank", "VeloBank", "Inny"
                            ].map(bank => (
                                <option key={bank} value={bank} className="bg-[#0a0a0a]">{bank}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">
                            {form.type === 'deposit' ? 'Kwota lokaty' : 'Saldo'}
                        </label>
                        <div className="flex gap-2">
                            <select
                                value={form.currency}
                                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                                className="bg-surface/50 border border-white/5 rounded-[5px] px-2 py-2.5 text-white/60 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] appearance-none cursor-pointer font-black text-xs transition-all shrink-0"
                            >
                                {SUPPORTED_CURRENCIES.map(c => (
                                    <option key={c} value={c} className="bg-[#0a0a0a]">{c}</option>
                                ))}
                            </select>
                            <input
                                type="number"
                                value={form.balance}
                                onChange={(e) => setForm({ ...form, balance: e.target.value })}
                                placeholder="0.00"
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-black text-base transition-all"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Oprocentowanie (%)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-bold text-xs">%</span>
                            <input
                                type="number"
                                step="0.01"
                                value={form.interestRate}
                                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                                placeholder="np. 7.00"
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium text-sm"
                            />
                        </div>
                    </div>
                </div>

                {form.type === 'deposit' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
                        <div>
                            <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Data otwarcia</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                                <input
                                    type="date"
                                    value={form.depositStartDate}
                                    onChange={(e) => setForm({ ...form, depositStartDate: e.target.value })}
                                    onClick={(e) => (e.target as any).showPicker?.()}
                                    className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium [color-scheme:dark] text-sm cursor-pointer"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Czas trwania (miesiące)</label>
                            <select
                                value={form.depositDurationMonths}
                                onChange={(e) => setForm({ ...form, depositDurationMonths: e.target.value })}
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] cursor-pointer font-medium transition-all text-sm"
                            >
                                {[1, 2, 3, 4, 6, 9, 12, 18, 24, 36].map(m => (
                                    <option key={m} value={m} className="bg-[#0a0a0a]">{m} {m === 1 ? 'miesiąc' : m < 5 ? 'miesiące' : 'miesięcy'}</option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Kapitalizacja</label>
                            <div className="flex bg-white/5 p-1 rounded-[5px]">
                                <button
                                    onClick={() => setForm({ ...form, capitalizationType: 'at_end' })}
                                    className={`flex-1 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-[4px] transition-all ${form.capitalizationType === 'at_end' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white'}`}
                                >
                                    Na koniec okresu
                                </button>
                                <button
                                    onClick={() => setForm({ ...form, capitalizationType: 'monthly' })}
                                    className={`flex-1 py-1.5 text-[8px] font-black uppercase tracking-widest rounded-[4px] transition-all ${form.capitalizationType === 'monthly' ? 'bg-white/10 text-white border border-white/10' : 'text-white/40 hover:text-white'}`}
                                >
                                    Miesięczna
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {form.type === 'savings' && (
                    <div className="pt-4 border-t border-white/5">
                        <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Koniec Promocji (Opcjonalnie)</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                            <input
                                type="date"
                                value={form.promoEndsAt}
                                onChange={(e) => {
                                    const newDate = e.target.value;
                                    const shouldSetDefaultRate = newDate && !form.postPromoInterestRate;
                                    setForm({
                                        ...form,
                                        promoEndsAt: newDate,
                                        ...(shouldSetDefaultRate ? { postPromoInterestRate: '1' } : {})
                                    });
                                }}
                                onClick={(e) => (e.target as any).showPicker?.()}
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium [color-scheme:dark] text-sm cursor-pointer"
                            />
                        </div>
                        {form.promoEndsAt && (
                            <div className="mt-4">
                                <label className="block text-sm font-medium text-white/30 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Oprocentowanie po promocji</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-bold text-xs">%</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={form.postPromoInterestRate}
                                        onChange={(e) => setForm({ ...form, postPromoInterestRate: e.target.value })}
                                        placeholder="np. 1.00"
                                        className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-4 mt-6 justify-end items-center">
                    {editingAccount && (
                        <button
                            onClick={() => onRequestDelete(editingAccount.id)}
                            className="mr-auto py-2 px-4 rounded-[5px] font-bold text-rose-500 hover:bg-rose-500/10 transition-all text-[9px] uppercase tracking-widest flex items-center gap-2"
                        >
                            <Trash2 size={12} />
                            <span>Usuń</span>
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="py-2 px-6 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-xs"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={submitting}
                        className="px-8 py-2.5 bg-white text-black rounded-[5px] font-black hover:bg-white/90 transition-all disabled:opacity-50 active:scale-95 uppercase tracking-widest text-[9px]"
                    >
                        {submitting ? 'Zapisywanie...' : editingAccount ? 'Zapisz zmiany' : 'Zapisz'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
