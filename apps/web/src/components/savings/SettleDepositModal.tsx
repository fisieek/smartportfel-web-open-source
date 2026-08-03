import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useTransactionFormData } from '../../hooks/useQueries';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../ui/select';
import { ArrowRightLeft, PiggyBank } from 'lucide-react';

interface SettleDepositModalProps {
    isOpen: boolean;
    onClose: () => void;
    depositId: string | null;
    onSuccess: () => void;
}

export default function SettleDepositModal({ isOpen, onClose, depositId, onSuccess }: SettleDepositModalProps) {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [deposit, setDeposit] = useState<any>(null);
    const {
        personalAccounts,
        savingsAccounts,
        investmentAccounts
    } = useTransactionFormData();

    const [targetAccountId, setTargetAccountId] = useState('');
    const [finalInterest, setFinalInterest] = useState<string>('');
    const { success, error: toastError } = useToast();

    useEffect(() => {
        if (isOpen && depositId) {
            fetchData();
        }
    }, [isOpen, depositId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const depositRes = await api.get(`/savings/${depositId}`);
            const dep = depositRes.data;
            setDeposit(dep);

            // Domyślne konto docelowe (pierwsze główne konto osobiste lub pierwsze z brzegu)
            if (personalAccounts.length > 0 && !targetAccountId) {
                const mainAccount = personalAccounts.find((a: any) => a.isMain);
                if (mainAccount) {
                    setTargetAccountId(mainAccount.id);
                } else {
                    setTargetAccountId(personalAccounts[0].id);
                }
            }

            // Dokładniejsze wyliczenie odsetek (Netto)
            const startDate = dep.depositStartDate ? new Date(dep.depositStartDate) : new Date();
            const duration = Number(dep.depositDurationMonths || 3);
            const endDate = new Date(startDate.getTime());
            endDate.setMonth(endDate.getMonth() + duration);

            const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const grossInterest = dep.balance * (dep.interestRate / 100) * (totalDays / 365);
            const netInterest = grossInterest * 0.81; // 19% podatku

            setFinalInterest(netInterest.toFixed(2));

        } catch (error) {
            console.error('Błąd pobierania danych do rozliczenia:', error);
            toastError('Nie udało się pobrać danych lokaty');
        } finally {
            setLoading(false);
        }
    };

    const handleSettle = async () => {
        if (!targetAccountId || !finalInterest) {
            toastError('Wybierz konto docelowe i wprowadź kwotę odsetek');
            return;
        }

        setSubmitting(true);
        try {
            await api.post(`/savings/${depositId}/settle`, {
                targetAccountId,
                finalInterest: Number(finalInterest)
            });
            success('Lokata została pomyślnie rozliczona!');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Błąd rozliczania lokaty:', error);
            toastError(error.response?.data?.error || 'Nie udało się rozliczyć lokaty');
        } finally {
            setSubmitting(false);
        }
    };

    if (!deposit && loading) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Rozlicz lokatę">
            <div className="space-y-6">
                {/* Podsumowanie lokaty */}
                <div className="bg-white/5 border border-white/10 rounded-[2px] p-3 flex items-center justify-between">
                    <div>
                        <p className="text-[9px] text-white/40 uppercase tracking-widest font-bold mb-0.5">Kwota lokaty</p>
                        <p className="text-lg font-black text-white">{Number(deposit?.balance || 0).toLocaleString()} <span className="text-[10px] text-white/40">PLN</span></p>
                    </div>
                    <div className="h-9 w-9 bg-white/10 rounded-[2px] flex items-center justify-center text-white border border-white/5">
                        <PiggyBank size={18} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/5 border border-white/5 rounded-[2px] p-2.5">
                        <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-0.5">Oprocentowanie</p>
                        <p className="text-xs font-bold text-white">{deposit?.interestRate}% <span className="text-[8px] text-white/40 font-normal">w skali roku</span></p>
                    </div>
                    <div className="bg-white/5 border border-white/5 rounded-[2px] p-2.5">
                        <p className="text-[9px] text-white/20 uppercase tracking-widest font-black mb-0.5">Okres</p>
                        <p className="text-xs font-bold text-white">{deposit?.depositDurationMonths} m-cy</p>
                    </div>
                </div>

                <div className="flex justify-center py-2">
                    <div className="h-8 w-8 bg-white/5 rounded-[2px] flex items-center justify-center text-white/20 border border-white/10">
                        <ArrowRightLeft size={16} />
                    </div>
                </div>

                {/* Formularz rozliczenia */}
                <div className="space-y-3">
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Konto docelowe</label>
                        <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                            <SelectTrigger className="h-10 bg-white/5 border-white/5 text-sm font-bold text-white/90 rounded-[2px]">
                                <SelectValue placeholder="Wybierz konto" />
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                                {personalAccounts.filter((acc: any) => acc.type === 'BANK' || acc.type === 'CASH' || !acc.type).length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1 tracking-widest">Konta</SelectLabel>
                                        {personalAccounts.filter((acc: any) => (acc.type === 'BANK' || acc.type === 'CASH' || !acc.type) && !!acc.id).map((acc: any) => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {savingsAccounts.filter((acc: any) => acc.id !== depositId).length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1 tracking-widest">Oszczędnościowe</SelectLabel>
                                        {savingsAccounts.filter((acc: any) => acc.id !== depositId).map((acc: any) => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {personalAccounts.filter((acc: any) => acc.type && ['LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'].includes(acc.type)).length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1 tracking-widest">Lojalnościowe</SelectLabel>
                                        {personalAccounts.filter((acc: any) => acc.type && ['LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'].includes(acc.type) && !!acc.id).map((acc: any) => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                                {investmentAccounts.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1 tracking-widest">Inwestycyjne</SelectLabel>
                                        {investmentAccounts.filter((acc: any) => !!acc.id).map((acc: any) => (
                                            <SelectItem key={acc.id} value={acc.id} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>
                        {(() => {
                            const selectedAcc = [...personalAccounts, ...savingsAccounts, ...investmentAccounts].find(a => a.id === targetAccountId);
                            if (!selectedAcc) return null;
                            return (
                                <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1.5 ml-1">
                                    Dostępne: {Number(selectedAcc.balance || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
                                </div>
                            );
                        })()}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-1.5 ml-1 uppercase tracking-widest text-[9px]">Naliczone odsetki (Netto - po podatku)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black text-xs">PLN</span>
                            <input
                                type="number"
                                step="0.01"
                                value={finalInterest}
                                onChange={(e) => setFinalInterest(e.target.value)}
                                className="w-full h-10 bg-surface/50 border border-white/5 rounded-[2px] pl-14 pr-4 py-2 text-white focus:outline-none focus:border-white/40 focus:bg-white/[0.08] font-black text-lg transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 rounded-[2px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-xs uppercase tracking-widest"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleSettle}
                        disabled={submitting || !targetAccountId}
                        className="flex-[1.5] py-3 bg-white text-black rounded-[2px] font-black hover:bg-white/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-widest"
                    >
                        {submitting ? 'Przetwarzanie...' : 'Rozlicz i przenieś'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
