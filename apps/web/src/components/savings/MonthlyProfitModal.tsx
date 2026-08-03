import { useState, useEffect } from 'react';
import { PiggyBank, Check, AlertCircle, CheckCircle2, Coins } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';

interface MonthlyProfitModalProps {
    isOpen: boolean;
    onClose: () => void;
    accounts: any[];
    onSuccess: () => void;
    initialAccountId?: string | null;
}

interface Settlement {
    month: string; // YYYY-MM
    status: 'settled' | 'pending';
    amount: number | null;
    markedManually: boolean;
}

const monthLabel = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
};

export default function MonthlyProfitModal({ isOpen, onClose, accounts, onSuccess, initialAccountId }: MonthlyProfitModalProps) {
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [interestAmount, setInterestAmount] = useState('');
    const [amountMode, setAmountMode] = useState<'net' | 'gross'>('net');
    const [taxAmount, setTaxAmount] = useState('');
    const [taxEdited, setTaxEdited] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Status miesięcy + oznaczanie
    const [settlements, setSettlements] = useState<Settlement[]>([]);
    const [loadingSettlements, setLoadingSettlements] = useState(false);
    const [markingMonth, setMarkingMonth] = useState<string | null>(null);

    const BELKA_RATE = 0.19;

    // Podatek Belki: 19% od brutto, chyba że użytkownik nadpisał wartość
    const grossValue = amountMode === 'gross' ? parseFloat(interestAmount) || 0 : 0;
    const effectiveTax = amountMode === 'gross'
        ? (taxEdited ? (parseFloat(taxAmount) || 0) : Math.round(grossValue * BELKA_RATE * 100) / 100)
        : 0;
    const netValue = amountMode === 'gross'
        ? Math.round((grossValue - effectiveTax) * 100) / 100
        : parseFloat(interestAmount) || 0;

    // Aktywny miesiąc do dopisania odsetek (domyślnie poprzedni)
    const [period, setPeriod] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 7); // YYYY-MM
    });

    const { success, error } = useToast();

    const pendingMonths = settlements.filter(s => s.status === 'pending');
    const activePeriodPending = pendingMonths.some(p => p.month === period);

    // ESC key support
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    // Auto-select initial account or first account
    useEffect(() => {
        if (isOpen && accounts.length > 0) {
            if (initialAccountId) {
                setSelectedAccountId(initialAccountId);
            } else if (!selectedAccountId) {
                setSelectedAccountId(accounts[0].id);
            }
        }
    }, [isOpen, accounts, initialAccountId]);

    const fetchSettlements = async (accId: string) => {
        if (!accId) return;
        setLoadingSettlements(true);
        try {
            const res = await api.get(`/savings/${accId}/settlements`);
            setSettlements(res.data?.months || []);
        } catch (err) {
            console.error('Błąd pobierania statusu rozliczeń:', err);
            setSettlements([]);
        } finally {
            setLoadingSettlements(false);
        }
    };

    useEffect(() => {
        if (isOpen && selectedAccountId) {
            fetchSettlements(selectedAccountId);
        }
    }, [isOpen, selectedAccountId]);

    // Po wczytaniu statusu — wybierz najnowszy zaległy miesiąc, jeśli aktualny już rozliczony
    useEffect(() => {
        const pend = settlements.filter(s => s.status === 'pending');
        if (pend.length > 0 && !pend.some(p => p.month === period)) {
            setPeriod(pend[0].month);
        }
    }, [settlements]);

    const getEstimatedInterest = async (accId: string, monthStr: string) => {
        if (!accId) return;
        try {
            const [year, month] = monthStr.split('-');
            const res = await api.get(`/savings/${accId}/forecast?month=${parseInt(month)}&year=${parseInt(year)}`);
            if (res.data && res.data.totalNet) {
                setInterestAmount(res.data.totalNet);
            }
        } catch (err) {
            console.error('Error fetching estimate:', err);
        }
    };

    useEffect(() => {
        if (selectedAccountId && period && activePeriodPending) {
            getEstimatedInterest(selectedAccountId, period);
        }
    }, [selectedAccountId, period, activePeriodPending]);

    const handleSelectMonth = (month: string) => {
        setPeriod(month);
        setInterestAmount('');
        setTaxEdited(false);
        setTaxAmount('');
    };

    const handleMark = async (month: string) => {
        if (!selectedAccountId) return;
        setMarkingMonth(month);
        try {
            await api.post(`/savings/${selectedAccountId}/settle-interest`, {
                markOnly: true,
                date: `${month}-01`
            });
            success(`${monthLabel(month)} — oznaczono jako rozliczone.`);
            await fetchSettlements(selectedAccountId);
            onSuccess();
        } catch (err: any) {
            console.error('Błąd oznaczania miesiąca:', err);
            error(err?.response?.data?.error || 'Nie udało się oznaczyć miesiąca.');
        } finally {
            setMarkingMonth(null);
        }
    };

    const handleSubmit = async () => {
        if (!selectedAccountId || interestAmount === '' || netValue < 0) {
            error('Wybierz miesiąc i podaj poprawną kwotę odsetek.');
            return;
        }
        if (amountMode === 'gross' && (effectiveTax < 0 || effectiveTax > grossValue)) {
            error('Podatek nie może być ujemny ani większy od kwoty brutto.');
            return;
        }

        setSubmitting(true);
        try {
            await api.post(`/savings/${selectedAccountId}/settle-interest`, {
                amount: netValue,
                date: period ? `${period}-01` : new Date().toISOString(),
                note: amountMode === 'gross'
                    ? `Brutto: ${grossValue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN, podatek Belki: ${effectiveTax.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN`
                    : undefined
            });

            success(`Dopisano ${netValue.toLocaleString('pl-PL')} PLN odsetek za ${monthLabel(period)}!`);
            setInterestAmount('');
            setTaxEdited(false);
            setTaxAmount('');
            await fetchSettlements(selectedAccountId);
            onSuccess();
        } catch (err: any) {
            console.error('Błąd dopisywania odsetek:', err);
            error(err?.response?.data?.error || 'Nie udało się dopisać odsetek.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#09090b] border border-white/10 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="h-10 w-10 bg-white/10 rounded-[5px] flex items-center justify-center text-white">
                            <PiggyBank size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white tracking-tight">Rozlicz Odsetki</h2>
                            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Status miesięcy i zysk</p>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Konto Oszczędnościowe</label>
                            <div className="relative group">
                                <select
                                    value={selectedAccountId}
                                    onChange={(e) => setSelectedAccountId(e.target.value)}
                                    className="w-full bg-white/5 border border-white/5 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-white/10 cursor-pointer appearance-none font-medium text-sm transition-all"
                                >
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id} className="bg-[#09090b] text-white py-2">{acc.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Status rozliczeń miesiąc po miesiącu */}
                        <div className="space-y-2">
                            <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Status rozliczeń</label>
                            <div className="bg-white/5 border border-white/5 rounded-[5px] divide-y divide-white/5 max-h-44 overflow-y-auto">
                                {loadingSettlements ? (
                                    <div className="px-4 py-6 text-center text-white/30 text-[10px] uppercase tracking-widest font-bold">Ładowanie…</div>
                                ) : settlements.length === 0 ? (
                                    <div className="px-4 py-6 text-center text-white/30 text-[10px] uppercase tracking-widest font-bold">Brak miesięcy do rozliczenia</div>
                                ) : (
                                    settlements.map(s => (
                                        <div
                                            key={s.month}
                                            className={`flex items-center justify-between gap-2 px-3 py-2.5 transition-colors ${period === s.month && s.status === 'pending' ? 'bg-amber-500/10' : ''}`}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                {s.status === 'settled'
                                                    ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
                                                    : <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />}
                                                <span className="text-xs font-bold text-white/80 capitalize truncate">{monthLabel(s.month)}</span>
                                            </div>
                                            {s.status === 'settled' ? (
                                                <span className="text-[10px] font-black uppercase tracking-wider text-white/40 flex-shrink-0">
                                                    {s.markedManually
                                                        ? 'Rozliczone ręcznie'
                                                        : `+${(s.amount || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectMonth(s.month)}
                                                        className={`text-[9px] font-black uppercase tracking-wider rounded-[4px] px-2 py-1 transition-all ${period === s.month ? 'bg-amber-500/20 text-amber-300' : 'bg-white/5 text-white/50 hover:text-white'}`}
                                                    >
                                                        Rozlicz
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMark(s.month)}
                                                        disabled={markingMonth === s.month}
                                                        className="text-[9px] font-black uppercase tracking-wider rounded-[4px] px-2 py-1 bg-white/5 text-white/30 hover:text-white/70 transition-all disabled:opacity-40 whitespace-nowrap"
                                                        title="Rozliczyłem ręcznie poza aplikacją — saldo bez zmian"
                                                    >
                                                        {markingMonth === s.month ? '…' : 'Pomiń (Rozliczone)'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                            <p className="text-[9px] text-white/25 leading-relaxed px-1 flex items-start gap-1.5">
                                <AlertCircle size={11} className="flex-shrink-0 mt-px" />
                                <span>„Pomiń (Rozliczone)" = odsetki rozliczone ręcznie poza aplikacją (saldo bez zmian).</span>
                            </p>
                        </div>

                        {!loadingSettlements && settlements.length > 0 && pendingMonths.length === 0 && (
                            <div className="flex items-center gap-2 text-emerald-400 text-[10px] font-black uppercase tracking-widest px-1">
                                <CheckCircle2 size={14} /> Wszystkie miesiące rozliczone
                            </div>
                        )}

                        {/* Formularz dopisania odsetek za wybrany miesiąc */}
                        {activePeriodPending && (
                            <div className="bg-white/5 border border-white/5 rounded-[5px] p-5 relative group transition-all hover:bg-white/[0.07]">
                                <div className="flex items-center gap-2 mb-4 text-[9px] font-black text-amber-400/90 uppercase tracking-[0.15em]">
                                    <Coins size={12} />
                                    Odsetki za <span className="text-white capitalize">{monthLabel(period)}</span>
                                </div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">
                                        Kwota ({amountMode === 'net' ? 'Netto' : 'Brutto'})
                                    </label>
                                    <div className="flex bg-white/5 rounded-[5px] p-0.5">
                                        {(['net', 'gross'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => { setAmountMode(mode); setTaxEdited(false); setTaxAmount(''); }}
                                                className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-[4px] transition-all ${amountMode === mode ? 'bg-white/15 text-white' : 'text-white/30 hover:text-white/60'}`}
                                            >
                                                {mode === 'net' ? 'Netto' : 'Brutto'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-white/20 font-light text-lg">PLN</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={interestAmount}
                                        onChange={(e) => setInterestAmount(e.target.value)}
                                        className="w-full bg-transparent border-none p-0 pl-12 text-3xl font-black text-white focus:ring-0 placeholder:text-white/5 appearance-none-all tracking-tight"
                                        placeholder="0.00"
                                    />
                                </div>
                                {amountMode === 'gross' && (
                                    <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <label className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em]">Podatek Belki (19%)</label>
                                            <div className="relative w-32">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={taxEdited ? taxAmount : effectiveTax.toFixed(2)}
                                                    onChange={(e) => { setTaxEdited(true); setTaxAmount(e.target.value); }}
                                                    className="w-full bg-white/5 border border-white/10 rounded-[5px] px-2 py-1.5 text-right text-sm font-bold text-white focus:outline-none focus:border-white/30"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-[0.2em]">Netto do dopisania</span>
                                            <span className="text-sm font-black text-emerald-400">
                                                {netValue.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {interestAmount && amountMode === 'net' && (
                                    <div className="mt-3 flex items-center gap-2 text-[9px] text-white/40 uppercase tracking-wider font-medium">
                                        <AlertCircle size={10} />
                                        <span>Podpowiedź z symulacji</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 mt-8 pt-4 border-t border-white/5">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 text-white/40 hover:text-white text-[10px] font-black uppercase tracking-[0.2em] transition-colors"
                        >
                            Zamknij
                        </button>
                        {activePeriodPending && (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                className="flex-1 py-3 bg-white hover:bg-white/90 text-black rounded-[2px] font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'Zapisywanie...' : (
                                    <>
                                        <Check size={14} strokeWidth={3} />
                                        Dopisz zysk
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
