import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Calendar, Landmark, FileText, ArrowRightLeft, Info } from 'lucide-react';
import api from '../lib/api';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { useToast } from '../context/ToastContext';
import Modal from './ui/Modal';

interface PersonalAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
    currency?: string;
    isMultiCurrency: boolean;
    availableCurrencies: string[];
    balances?: { currency: string; balance: number }[];
}

// Etykieta sald konta: wszystkie waluty, nie tylko główna
const formatAccountBalances = (acc: PersonalAccount) => {
    const balances = acc.balances && acc.balances.length > 0
        ? acc.balances
        : [{ currency: acc.currency || 'PLN', balance: acc.balance }];
    return balances
        .map(b => `${Number(b.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${b.currency}`)
        .join(' • ');
};

interface CurrencyExchangeModalProps {
    onSuccess: () => void;
    onClose: () => void;
    initialAccount?: PersonalAccount | null;
}

export default function CurrencyExchangeModal({ onSuccess, onClose, initialAccount }: CurrencyExchangeModalProps) {
    const [personalAccounts, setPersonalAccounts] = useState<PersonalAccount[]>([]);
    const [personalAccountId, setPersonalAccountId] = useState(initialAccount?.id || '');
    const [currency, setCurrency] = useState('EUR');
    const [targetCurrency, setTargetCurrency] = useState('PLN');
    const [amount, setAmount] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [description, setDescription] = useState('Przewalutowanie');
    const [note, setNote] = useState('');

    const [loading, setLoading] = useState(false);
    const [fetchingRates, setFetchingRates] = useState(false);
    const { success, error: toastError } = useToast();


    // Fetch accounts
    const fetchAccounts = useCallback(async () => {
        try {
            const res = await api.get('/personal-accounts');
            setPersonalAccounts(res.data);
            if (!personalAccountId && res.data.length > 0) {
                setPersonalAccountId(res.data[0].id);
            }
        } catch (error) {
            console.error('Błąd pobierania kont:', error);
        }
    }, [personalAccountId]);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    // Fetch rates and suggest target amount
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0 || fetchingRates) return;

        const timer = setTimeout(async () => {
            setFetchingRates(true);
            try {
                // Fetch rate for source -> PLN
                let fromPlnRate = 1;
                if (currency !== 'PLN') {
                    const res = await api.get(`/expenses/exchange-rate?currency=${currency}&date=${date}`);
                    fromPlnRate = res.data.rate;
                }

                // Fetch rate for target -> PLN
                let toPlnRate = 1;
                if (targetCurrency !== 'PLN') {
                    const res = await api.get(`/expenses/exchange-rate?currency=${targetCurrency}&date=${date}`);
                    toPlnRate = res.data.rate;
                }

                // Calculate target amount: amount * (fromPlnRate / toPlnRate)
                const calculated = (parseFloat(amount) * fromPlnRate) / toPlnRate;
                setTargetAmount(calculated.toFixed(2));
            } catch (err) {
                console.warn('Błąd pobierania kursów NBP:', err);
            } finally {
                setFetchingRates(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [amount, currency, targetCurrency, date, fetchingRates]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!amount || !targetAmount || !personalAccountId) {
            toastError('Wypełnij wszystkie pola');
            return;
        }

        setLoading(true);
        try {
            await api.post('/expenses', {
                type: 'exchange',
                amount: parseFloat(amount),
                currency,
                targetAmount: parseFloat(targetAmount),
                targetCurrency,
                description,
                date,
                personalAccountId,
                note: note || undefined
            });

            success('Przewalutowanie wykonane pomyślnie');
            onSuccess();
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Błąd przewalutowania');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={true}
            onClose={onClose}
            title="Przewalutowanie"
            subtitle="Wymiana walut w ramach jednego konta"
            maxWidth="max-w-xl"
            variant="dark"
        >
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Account Selection */}
                    <div className="md:col-span-2 space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Konto</label>
                        <div className="relative group">
                            <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/10 group-focus-within:text-blue-400 transition-colors" />
                            <select
                                value={personalAccountId}
                                onChange={(e) => setPersonalAccountId(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 text-white rounded-[5px] py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all appearance-none cursor-pointer font-bold"
                            >
                                <option value="" disabled className="bg-[#0a0a0a]">Wybierz konto</option>
                                {personalAccounts.filter(acc => acc.isMultiCurrency || acc.name === 'Gotówka').map(acc => (
                                    <option key={acc.id} value={acc.id} className="bg-[#0a0a0a]">
                                        {acc.name} ({acc.bank}) - {formatAccountBalances(acc)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Source Side */}
                    <div className="space-y-4 p-4 bg-white/[0.02] rounded-[5px] border border-white/5">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-white/20">Sprzedaję</label>
                        </div>
                        <div className="space-y-4">
                            <div className="relative group">
                                <select
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className="w-full bg-white/5 border border-white/5 text-white rounded-[5px] py-1.5 px-3 focus:outline-none transition-all font-bold appearance-none cursor-pointer text-xs"
                                >
                                    {SUPPORTED_CURRENCIES.map(c => (
                                        <option key={c} value={c} className="bg-[#0a0a0a]">{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="relative group">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-transparent border-b border-white/10 text-white py-2 px-0 text-center text-3xl font-black focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-white/5"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Target Side */}
                    <div className="space-y-4 p-4 bg-blue-500/5 rounded-[5px] border border-blue-500/10">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black uppercase tracking-widest text-blue-400/40">Kupuję</label>
                            {fetchingRates && <div className="text-[10px] text-blue-400 animate-pulse font-black uppercase tracking-widest">Pobieranie...</div>}
                        </div>
                        <div className="space-y-4">
                            <div className="relative group">
                                <select
                                    value={targetCurrency}
                                    onChange={(e) => setTargetCurrency(e.target.value)}
                                    className="w-full bg-white/5 border border-blue-500/10 text-white rounded-[5px] py-1.5 px-3 focus:outline-none transition-all font-bold appearance-none cursor-pointer text-xs"
                                >
                                    {SUPPORTED_CURRENCIES.map(c => (
                                        <option key={c} value={c} className="bg-[#0a0a0a]">{c}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="relative group">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={targetAmount}
                                    onChange={(e) => setTargetAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-transparent border-b border-blue-400/20 text-white py-2 px-0 text-center text-3xl font-black focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-blue-400/10"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    {/* Date & Description */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Data</label>
                        <div className="relative group">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/10 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 text-white rounded-[5px] py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-bold"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Opis</label>
                        <div className="relative group">
                            <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/10 group-focus-within:text-blue-400 transition-colors" />
                            <input
                                type="text"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-white/5 border border-white/5 text-white rounded-[5px] py-2.5 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all font-bold"
                                required
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/20 ml-1">Notatka (opcjonalnie)</label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="w-full bg-white/5 border border-white/5 text-white rounded-[5px] py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all h-24 resize-none font-medium text-sm"
                        placeholder="Dodaj notatkę..."
                    />
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-3 p-4 bg-blue-500/5 rounded-[5px] border border-blue-500/10">
                    <Info className="w-5 h-5 text-blue-400/40 mt-0.5" />
                    <p className="text-[10px] text-white/30 leading-relaxed font-medium">
                        Pobierany kurs walut pochodzi z NBP i ma charakter orientacyjny.
                        Wprowadź rzeczywistą kwotę, jaką otrzymałeś/aś od kantoru lub banku, aby zachować poprawność salda.
                    </p>
                </div>

                {/* Submit & Cancel */}
                <div className="flex gap-4 pt-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-9 px-6 rounded-[5px] text-white/40 font-black hover:bg-white/5 transition-all uppercase tracking-widest text-[10px]"
                    >
                        Anuluj
                    </button>
                    <button
                        type="submit"
                        disabled={loading || fetchingRates}
                        className={`h-9 px-6 rounded-[5px] text-white font-black transition-all shadow-xl flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] ${loading || fetchingRates
                            ? 'bg-white/5 text-white/10 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20 active:scale-[0.98]'
                            }`}
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <ArrowRightLeft className="w-4 h-4" />
                                Wykonaj wymianę
                            </>
                        )}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
