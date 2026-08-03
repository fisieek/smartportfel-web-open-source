import { useState, useEffect } from 'react';
import { Home, Plus, Trash2, Calendar, Landmark, TrendingDown, PiggyBank, Pencil, Calculator } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import Modal from '../components/ui/Modal';
import ConfirmModal from '../components/ui/ConfirmModal';
import { suggestInstallment, generateSchedule, type InstallmentSuggestion } from '../lib/loanMath';
import LoanCalculator from '../components/LoanCalculator';
import LoansSummary from '../components/LoansSummary';

interface MortgagePayment {
    id: string;
    paymentDate: string;
    totalAmount: number;
    principalAmount: number;
    interestAmount: number;
    note?: string;
}

type LoanType = 'MORTGAGE' | 'CASH' | 'CAR' | 'OTHER';
type InstallmentType = 'EQUAL' | 'DECREASING';

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
    MORTGAGE: 'Hipoteczny',
    CASH: 'Gotówkowy',
    CAR: 'Samochodowy',
    OTHER: 'Inny'
};

const INSTALLMENT_TYPE_LABELS: Record<InstallmentType, string> = {
    EQUAL: 'Raty równe',
    DECREASING: 'Raty malejące'
};

interface Mortgage {
    id: string;
    name: string;
    totalAmount: number;
    currentBalance: number;
    startDate: string;
    loanType?: LoanType;
    installmentType?: InstallmentType | null;
    termMonths?: number | null;
    marginRate?: number | null;
    referenceRate?: number | null;
    personalAccountId?: string;
    personalAccount?: {
        name: string;
        bank: string;
        balance: number;
    };
    payments: MortgagePayment[];
    totalPaid: number;
    totalInterest: number;
    percentPaid: number;
}

export default function MortgagePage() {
    const [mortgages, setMortgages] = useState<Mortgage[]>([]);
    const [personalAccounts, setPersonalAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddMortgageOpen, setIsAddMortgageOpen] = useState(false);
    const [editingMortgage, setEditingMortgage] = useState<Mortgage | null>(null);
    const [isAddPaymentOpen, setIsAddPaymentOpen] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [selectedMortgage, setSelectedMortgage] = useState<Mortgage | null>(null);

    const { success, error: toastError } = useToast();

    // Form states
    const emptyMortgageForm = () => ({
        name: '',
        totalAmount: '',
        currentBalance: '',
        startDate: new Date().toISOString().split('T')[0],
        personalAccountId: '',
        loanType: 'MORTGAGE' as LoanType,
        installmentType: '' as '' | InstallmentType,
        termMonths: '',
        marginRate: '',
        referenceRate: ''
    });
    const [mortgageForm, setMortgageForm] = useState(emptyMortgageForm());

    useEffect(() => {
        if (personalAccounts.length > 0 && !mortgageForm.personalAccountId) {
            setMortgageForm(prev => ({ ...prev, personalAccountId: personalAccounts.find(a => a.isMain)?.id || personalAccounts[0].id }));
        }
    }, [personalAccounts, isAddMortgageOpen]);

    const [paymentForm, setPaymentForm] = useState({
        totalAmount: '',
        principalAmount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
        note: '',
        isOverpayment: false
    });
    const [installmentSuggestion, setInstallmentSuggestion] = useState<InstallmentSuggestion | null>(null);

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'danger' | 'warning' | 'info';
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    const fetchMortgages = async () => {
        try {
            const [mortRes, accRes] = await Promise.all([
                api.get('/mortgages'),
                api.get('/personal-accounts')
            ]);
            setMortgages(mortRes.data);
            setPersonalAccounts(accRes.data);
        } catch (error) {
            console.error('Błąd pobierania danych:', error);
            toastError('Nie udało się pobrać danych');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMortgages();
    }, []);

    const handleAddMortgage = async () => {
        if (!mortgageForm.name || !mortgageForm.totalAmount || !mortgageForm.personalAccountId) {
            toastError('Wypełnij nazwę, kwotę i wybierz konto');
            return;
        }

        try {
            const loanFields = {
                loanType: mortgageForm.loanType,
                installmentType: mortgageForm.installmentType || null,
                termMonths: mortgageForm.termMonths ? parseInt(mortgageForm.termMonths) : null,
                marginRate: mortgageForm.marginRate ? parseFloat(mortgageForm.marginRate) : null,
                referenceRate: mortgageForm.referenceRate ? parseFloat(mortgageForm.referenceRate) : null
            };
            if (editingMortgage) {
                await api.put(`/mortgages/${editingMortgage.id}`, {
                    name: mortgageForm.name,
                    totalAmount: parseFloat(mortgageForm.totalAmount),
                    currentBalance: parseFloat(mortgageForm.currentBalance),
                    startDate: mortgageForm.startDate,
                    personalAccountId: mortgageForm.personalAccountId,
                    ...loanFields
                });
                success('Kredyt został zaktualizowany');
            } else {
                await api.post('/mortgages', {
                    name: mortgageForm.name,
                    totalAmount: parseFloat(mortgageForm.totalAmount),
                    currentBalance: mortgageForm.currentBalance ? parseFloat(mortgageForm.currentBalance) : parseFloat(mortgageForm.totalAmount),
                    startDate: mortgageForm.startDate,
                    personalAccountId: mortgageForm.personalAccountId,
                    ...loanFields
                });
                success('Kredyt został dodany');
            }
            await fetchMortgages();
            setMortgageForm(emptyMortgageForm());
            setIsAddMortgageOpen(false);
            setEditingMortgage(null);
        } catch (error) {
            console.error('Błąd zapisu kredytu:', error);
            toastError('Nie udało się zapisać kredytu');
        }
    };

    const handleEditMortgage = (mortgage: Mortgage) => {
        setEditingMortgage(mortgage);
        setMortgageForm({
            name: mortgage.name,
            totalAmount: mortgage.totalAmount.toString(),
            currentBalance: mortgage.currentBalance.toString(),
            startDate: new Date(mortgage.startDate).toISOString().split('T')[0],
            personalAccountId: mortgage.personalAccountId || '',
            loanType: mortgage.loanType || 'MORTGAGE',
            installmentType: mortgage.installmentType || '',
            termMonths: mortgage.termMonths != null ? String(mortgage.termMonths) : '',
            marginRate: mortgage.marginRate != null ? String(mortgage.marginRate) : '',
            referenceRate: mortgage.referenceRate != null ? String(mortgage.referenceRate) : ''
        });
        setIsAddMortgageOpen(true);
    };

    const handleAddPayment = async () => {
        // W trybie nadpłaty cała kwota idzie na kapitał (odsetki = 0)
        if (!selectedMortgage || !paymentForm.totalAmount || (!paymentForm.isOverpayment && !paymentForm.principalAmount)) {
            toastError(paymentForm.isOverpayment ? 'Wpisz kwotę nadpłaty' : 'Wypełnij kwotę raty i część kapitałową');
            return;
        }

        const monthNames = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
        const monthNote = `${monthNames[paymentForm.month - 1]} ${paymentForm.year}`;
        const isOver = paymentForm.isOverpayment;
        const total = parseFloat(paymentForm.totalAmount);
        const principal = isOver ? total : parseFloat(paymentForm.principalAmount);

        // Walidacja mirror reguł serwera (B7) — natychmiastowy feedback.
        // Nadpłata > pozostałe saldo jest OK — serwer przytnie kapitał (auto-clamp).
        if (!Number.isFinite(total) || !Number.isFinite(principal) || total <= 0 || principal <= 0) {
            toastError('Kwoty muszą być dodatnie');
            return;
        }
        if (principal > total) {
            toastError('Część kapitałowa nie może przekraczać kwoty raty');
            return;
        }
        if (paymentForm.paymentDate) {
            const endOfToday = new Date();
            endOfToday.setHours(23, 59, 59, 999);
            if (new Date(paymentForm.paymentDate).getTime() > endOfToday.getTime()) {
                toastError('Data płatności nie może być z przyszłości');
                return;
            }
        }

        try {
            const res = await api.post(`/mortgages/${selectedMortgage.id}/payments`, {
                totalAmount: total,
                principalAmount: principal,
                paymentDate: paymentForm.paymentDate,
                note: isOver ? `Nadpłata (${monthNote})` : monthNote
            });
            await fetchMortgages();
            setPaymentForm({
                totalAmount: '',
                principalAmount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                note: '',
                isOverpayment: false
            });
            setIsAddPaymentOpen(false);
            if (res.data?.clamped) {
                success('Kapitał przycięto do pozostałego salda — kredyt spłacony w całości.');
            } else {
                success(isOver ? 'Nadpłata została zapisana' : 'Rata została dodana');
            }
        } catch (error: any) {
            console.error('Błąd dodawania raty:', error);
            toastError(error?.response?.data?.error || 'Nie udało się dodać raty');
        }
    };

    const handleDeleteMortgage = (mortgage: Mortgage) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń kredyt',
            message: `Czy na pewno chcesz usunąć kredyt "${mortgage.name}"? Usunięte zostaną również wszystkie raty.`,
            onConfirm: async () => {
                try {
                    await api.delete(`/mortgages/${mortgage.id}`);
                    await fetchMortgages();
                    success('Kredyt został usunięty');
                } catch (error) {
                    console.error('Błąd usuwania kredytu:', error);
                    toastError('Nie udało się usunąć kredytu');
                }
            },
            type: 'danger'
        });
    };

    const handleDeletePayment = (mortgage: Mortgage, payment: MortgagePayment) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń ratę',
            message: `Czy na pewno chcesz usunąć ratę z dnia ${new Date(payment.paymentDate).toLocaleDateString('pl-PL')}?`,
            onConfirm: async () => {
                try {
                    await api.delete(`/mortgages/${mortgage.id}/payments/${payment.id}`);
                    await fetchMortgages();
                    success('Rata została usunięta');
                } catch (error) {
                    console.error('Błąd usuwania raty:', error);
                    toastError('Nie udało się usunąć raty');
                }
            },
            type: 'danger'
        });
    };

    const openAddPayment = (mortgage: Mortgage) => {
        setSelectedMortgage(mortgage);
        const suggestion = suggestInstallment({
            currentBalance: Number(mortgage.currentBalance),
            termMonths: mortgage.termMonths,
            marginRate: mortgage.marginRate,
            referenceRate: mortgage.referenceRate,
            installmentType: mortgage.installmentType,
            paymentsMade: mortgage.payments.length,
        });
        setInstallmentSuggestion(suggestion);
        setPaymentForm(prev => ({
            ...prev,
            totalAmount: suggestion ? suggestion.totalAmount.toFixed(2) : '',
            principalAmount: suggestion ? suggestion.principalAmount.toFixed(2) : '',
            isOverpayment: false,
        }));
        setIsAddPaymentOpen(true);
    };

    if (loading) return <div className="text-white p-8">Ładowanie...</div>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div></div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsCalculatorOpen(true)}
                        className="text-gray-400 hover:text-white font-medium py-2 px-4 rounded-[5px] flex items-center gap-2 transition-all border border-white/10 hover:border-white/30 hover:bg-white/5"
                    >
                        <Calculator size={18} />
                        <span>Kalkulator</span>
                    </button>
                    {mortgages.length > 0 && (
                        <button
                            onClick={() => setIsAddMortgageOpen(true)}
                            className="text-gray-400 hover:text-white font-medium py-2 px-4 rounded-[5px] flex items-center gap-2 transition-all border border-white/10 hover:border-white/30 hover:bg-white/5"
                        >
                            <Plus size={18} />
                            <span>Dodaj kredyt</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Zbiorczy widok zobowiązań (≥2 kredyty) */}
            <LoansSummary mortgages={mortgages} />

            {/* Mortgages List */}
            {mortgages.length === 0 ? (
                <div className="text-center h-[60vh] flex flex-col items-center justify-center relative">
                    <div className="bg-white/5 p-4 rounded-full w-fit mx-auto mb-4">
                        <Home size={32} className="text-gray-500" />
                    </div>
                    <p className="text-gray-500 mb-2">Nie masz jeszcze żadnych kredytów</p>
                    <p className="text-gray-600 text-sm max-w-xs mx-auto">Dodaj kredyt — hipoteczny, gotówkowy, samochodowy lub inny — aby śledzić postępy spłaty</p>

                    <button
                        onClick={() => setIsAddMortgageOpen(true)}
                        className="fixed bottom-24 left-4 right-4 md:static md:mt-8 md:w-auto bg-surface hover:bg-white/5 border border-white/10 text-white font-bold py-4 px-8 rounded-[5px] shadow-lg shadow-black/10 active:scale-95 transition-all flex items-center justify-center gap-2 z-40"
                    >
                        <Plus size={20} strokeWidth={2.5} />
                        <span>Dodaj pierwszy kredyt</span>
                    </button>
                </div>
            ) : (
                mortgages.map(mortgage => (
                    <div key={mortgage.id} className="bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden">
                        {/* Mortgage Header */}
                        <div className="p-6 border-b border-white/5">
                            <div className="flex items-start justify-between gap-3 mb-5">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="h-12 w-12 shrink-0 bg-amber-500/10 rounded-[5px] flex items-center justify-center">
                                        <Home size={24} className="text-amber-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-white font-bold text-lg truncate">{mortgage.name}</h3>
                                        <span className="inline-block mt-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-[5px] text-amber-400 text-xs font-bold">
                                            {LOAN_TYPE_LABELS[mortgage.loanType || 'MORTGAGE']}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => openAddPayment(mortgage)}
                                        className="hidden sm:flex hover:opacity-90 text-white font-bold py-3 px-6 rounded-[5px] items-center justify-center gap-2 whitespace-nowrap transition-all shadow-[0_0_20px_rgba(30,179,171,0.4)] hover:shadow-[0_0_30px_rgba(30,179,171,0.6)] active:scale-95"
                                        style={{ backgroundColor: '#1eb3ab' }}
                                    >
                                        <Plus size={20} strokeWidth={2.5} /> Dodaj ratę
                                    </button>
                                    <button
                                        onClick={() => handleEditMortgage(mortgage)}
                                        className="p-2.5 text-gray-500 hover:text-primary hover:bg-white/5 rounded-lg transition-colors"
                                        title="Edytuj kredyt"
                                    >
                                        <Pencil size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteMortgage(mortgage)}
                                        className="p-2.5 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                        title="Usuń kredyt"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="mb-6">
                                <div className="flex justify-between text-sm mb-2">
                                    <span className="text-gray-400 font-medium">Postęp spłaty</span>
                                    <span className="text-primary font-bold">{mortgage.percentPaid.toFixed(1)}%</span>
                                </div>
                                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#1eb3ab] rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(30,179,171,0.3)]"
                                        style={{ width: `${Math.max(Math.min(mortgage.percentPaid, 100), 1)}%` }}
                                    />
                                </div>
                                <div className="flex justify-between items-end mt-4">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-white text-2xl font-bold">
                                            {(Number(mortgage.totalAmount) - Number(mortgage.currentBalance)).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-gray-500 text-sm font-medium">PLN</span>
                                    </div>
                                    <div className="text-gray-500 text-sm">
                                        z {Number(mortgage.totalAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                    </div>
                                </div>
                            </div>

                            {/* Szczegóły */}
                            <div className="border-t border-white/5 pt-5 mb-6">
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Szczegóły</p>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                                    {(mortgage.marginRate != null || mortgage.referenceRate != null) && (
                                        <div>
                                            <p className="text-[11px] text-gray-500 mb-0.5">Oprocentowanie</p>
                                            <p className="text-sm text-white font-semibold">{(Number(mortgage.marginRate || 0) + Number(mortgage.referenceRate || 0)).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%</p>
                                            <p className="text-[11px] text-gray-600 mt-0.5">marża {Number(mortgage.marginRate || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}% + ref. {Number(mortgage.referenceRate || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })}%</p>
                                        </div>
                                    )}
                                    {mortgage.termMonths != null && (
                                        <div>
                                            <p className="text-[11px] text-gray-500 mb-0.5">Okres</p>
                                            <p className="text-sm text-white font-semibold">{mortgage.termMonths} mies.</p>
                                        </div>
                                    )}
                                    <div>
                                        <p className="text-[11px] text-gray-500 mb-0.5">Start</p>
                                        <p className="text-sm text-white font-semibold">{new Date(mortgage.startDate).toLocaleDateString('pl-PL')}</p>
                                    </div>
                                    {mortgage.installmentType && (
                                        <div>
                                            <p className="text-[11px] text-gray-500 mb-0.5">Typ rat</p>
                                            <p className="text-sm text-white font-semibold">{INSTALLMENT_TYPE_LABELS[mortgage.installmentType]}</p>
                                        </div>
                                    )}
                                </div>
                                {mortgage.personalAccount && (
                                    <div className="mt-4 flex items-center justify-between gap-3 bg-white/[0.03] border border-white/5 rounded-[5px] p-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <Landmark size={16} className="text-gray-400 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[11px] text-gray-500">Konto spłaty</p>
                                                <p className="text-sm text-white font-semibold truncate">{mortgage.personalAccount.name} ({mortgage.personalAccount.bank})</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-[11px] text-gray-500">Saldo</p>
                                            <p className={`text-sm font-semibold whitespace-nowrap ${Number(mortgage.personalAccount.balance) > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                                {Number(mortgage.personalAccount.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-surface/50 rounded-[5px] p-4">
                                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                        <Landmark size={14} />
                                        <span>Kwota kredytu</span>
                                    </div>
                                    <p className="text-white font-bold text-base sm:text-lg tabular-nums">
                                        {Number(mortgage.totalAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[11px] sm:text-sm text-gray-500 font-normal">PLN</span>
                                    </p>
                                </div>
                                <div className="bg-surface/50 rounded-[5px] p-4">
                                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                        <TrendingDown size={14} />
                                        <span>Pozostało</span>
                                    </div>
                                    <p className="text-amber-400 font-bold text-base sm:text-lg tabular-nums">
                                        {Number(mortgage.currentBalance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[11px] sm:text-sm text-gray-500 font-normal">PLN</span>
                                    </p>
                                </div>
                                <div className="bg-surface/50 rounded-[5px] p-4">
                                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                                        <PiggyBank size={14} />
                                        <span>Spłacony kapitał</span>
                                    </div>
                                    <p className="text-primary font-bold text-base sm:text-lg tabular-nums">
                                        {mortgage.totalPaid.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[11px] sm:text-sm text-gray-500 font-normal">PLN</span>
                                    </p>
                                </div>
                                <div className="bg-surface/50 rounded-[5px] p-4">
                                    <div className="flex items-center gap-2 text-rose-400 text-xs mb-1">
                                        <TrendingDown size={14} />
                                        <span>Odsetki</span>
                                    </div>
                                    <p className="text-rose-400 font-bold text-base sm:text-lg tabular-nums">
                                        {mortgage.totalInterest.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[11px] sm:text-sm text-gray-500 font-normal">PLN</span>
                                    </p>
                                </div>
                            </div>

                            {/* Dodaj ratę — pełna szerokość na mobile */}
                            <button
                                onClick={() => openAddPayment(mortgage)}
                                className="sm:hidden mt-6 w-full hover:opacity-90 text-white font-bold py-3 px-6 rounded-[5px] flex items-center justify-center gap-2 transition-all active:scale-95"
                                style={{ backgroundColor: '#1eb3ab' }}
                            >
                                <Plus size={20} strokeWidth={2.5} /> Dodaj ratę
                            </button>
                        </div>

                        {/* Payments List */}
                        {mortgage.payments.length > 0 && (
                            <div className="p-4">
                                <h4 className="text-gray-400 text-sm font-medium mb-3 px-2">Historia rat ({mortgage.payments.length})</h4>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {mortgage.payments.map(payment => (
                                        <div key={payment.id} className="flex items-center justify-between bg-surface/50 rounded-[5px] p-3 group">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 bg-primary/10 rounded-[5px] flex items-center justify-center">
                                                    <Calendar size={14} className="text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-white text-sm font-medium">
                                                        {payment.note || new Date(payment.paymentDate).toLocaleDateString('pl-PL')}
                                                    </p>
                                                    <p className="text-gray-500 text-xs">
                                                        {new Date(payment.paymentDate).toLocaleDateString('pl-PL')}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-white font-bold">
                                                        {Number(payment.totalAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        Kapitał: <span className="text-primary">{Number(payment.principalAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> |
                                                        Odsetki: <span className="text-rose-400">{Number(payment.interestAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeletePayment(mortgage, payment)}
                                                    className="p-2 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))
            )}

            {/* Loan Calculator Modal */}
            <Modal
                isOpen={isCalculatorOpen}
                onClose={() => setIsCalculatorOpen(false)}
                title="Kalkulator kredytu"
                subtitle="Rata, koszt całkowity, nadpłaty i zmiany stawki"
                maxWidth="max-w-2xl"
            >
                <LoanCalculator />
            </Modal>

            {/* Add/Edit Mortgage Modal */}
            <Modal
                isOpen={isAddMortgageOpen}
                onClose={() => {
                    setIsAddMortgageOpen(false);
                    setEditingMortgage(null);
                    setMortgageForm(emptyMortgageForm());
                }}
                title={editingMortgage ? "Edytuj kredyt" : "Nowy kredyt"}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Nazwa kredytu</label>
                            <input
                                type="text"
                                placeholder="np. Kredyt mieszkaniowy PKO"
                                value={mortgageForm.name}
                                onChange={e => setMortgageForm({ ...mortgageForm, name: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Typ kredytu</label>
                            <select
                                value={mortgageForm.loanType}
                                onChange={e => setMortgageForm({ ...mortgageForm, loanType: e.target.value as LoanType })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50 cursor-pointer"
                            >
                                {(Object.keys(LOAN_TYPE_LABELS) as LoanType[]).map(t => (
                                    <option key={t} value={t}>{LOAN_TYPE_LABELS[t]}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Kwota całkowita (PLN)</label>
                            <input
                                type="number"
                                placeholder="500000"
                                value={mortgageForm.totalAmount}
                                onChange={e => setMortgageForm({ ...mortgageForm, totalAmount: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Aktualne saldo (PLN)</label>
                            <input
                                type="number"
                                placeholder="Zostaw puste = kwota całkowita"
                                value={mortgageForm.currentBalance}
                                onChange={e => setMortgageForm({ ...mortgageForm, currentBalance: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Marża banku (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="np. 2,00"
                                value={mortgageForm.marginRate}
                                onChange={e => setMortgageForm({ ...mortgageForm, marginRate: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Stawka ref. WIBOR/WIRON (%)</label>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="np. 5,75"
                                value={mortgageForm.referenceRate}
                                onChange={e => setMortgageForm({ ...mortgageForm, referenceRate: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                        </div>
                    </div>
                    {(mortgageForm.marginRate || mortgageForm.referenceRate) && (
                        <p className="text-xs text-gray-500 -mt-2 ml-1">
                            Oprocentowanie łączne: <span className="text-primary font-bold">
                                {((parseFloat(mortgageForm.marginRate) || 0) + (parseFloat(mortgageForm.referenceRate) || 0)).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                            </span>
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Okres kredytowania (mies.)</label>
                            <input
                                type="number"
                                step="1"
                                min="1"
                                placeholder="np. 300"
                                value={mortgageForm.termMonths}
                                onChange={e => setMortgageForm({ ...mortgageForm, termMonths: e.target.value })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                            />
                            {mortgageForm.termMonths && parseInt(mortgageForm.termMonths) > 0 && (
                                <p className="text-xs text-gray-500 mt-1 ml-1">≈ {(parseInt(mortgageForm.termMonths) / 12).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} lat</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Typ rat</label>
                            <select
                                value={mortgageForm.installmentType}
                                onChange={e => setMortgageForm({ ...mortgageForm, installmentType: e.target.value as '' | InstallmentType })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50 cursor-pointer"
                            >
                                <option value="">Nie określono</option>
                                {(Object.keys(INSTALLMENT_TYPE_LABELS) as InstallmentType[]).map(t => (
                                    <option key={t} value={t}>{INSTALLMENT_TYPE_LABELS[t]}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2">Data zaciągnięcia</label>
                        <input
                            type="date"
                            value={mortgageForm.startDate}
                            onChange={e => setMortgageForm({ ...mortgageForm, startDate: e.target.value })}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2">Konto do spłaty rat</label>
                        <select
                            value={mortgageForm.personalAccountId}
                            onChange={e => setMortgageForm({ ...mortgageForm, personalAccountId: e.target.value })}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50 cursor-pointer"
                        >
                            <option value="" disabled>Wybierz konto</option>
                            {personalAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                    {acc.name} ({acc.bank}) - {Number(acc.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                </option>
                            ))}
                        </select>
                        {personalAccounts.length === 0 && (
                            <p className="text-xs text-rose-400 mt-1">Musisz najpierw dodać konto osobiste, aby powiązać je z kredytem.</p>
                        )}
                    </div>
                    <div className="flex items-center justify-end gap-4 pt-6">
                        <button
                            onClick={() => setIsAddMortgageOpen(false)}
                            className="px-8 py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={handleAddMortgage}
                            className="px-10 py-3.5 bg-surface text-white rounded-[5px] font-bold border border-white/10 hover:bg-white/5 transition-all shadow-lg shadow-black/10 active:scale-95 text-sm"
                        >
                            {editingMortgage ? "Zapisz zmiany" : "Dodaj kredyt"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Add Payment Modal */}
            <Modal isOpen={isAddPaymentOpen} onClose={() => setIsAddPaymentOpen(false)} title={paymentForm.isOverpayment ? 'Dodaj nadpłatę' : 'Dodaj ratę'}>
                <div className="space-y-4">
                    {/* Tryb: rata / nadpłata */}
                    <div className="flex gap-2">
                        {([[false, 'Rata'], [true, 'Nadpłata']] as const).map(([over, label]) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => setPaymentForm(prev => ({ ...prev, isOverpayment: over }))}
                                className={`flex-1 px-3 py-2 text-sm rounded-[5px] border transition-all ${paymentForm.isOverpayment === over
                                    ? 'bg-white border-white text-black font-bold'
                                    : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {!paymentForm.isOverpayment ? (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">Kwota raty (PLN)</label>
                                    <input
                                        type="number"
                                        placeholder="np. 2 133,00"
                                        value={paymentForm.totalAmount}
                                        onChange={e => setPaymentForm({ ...paymentForm, totalAmount: e.target.value })}
                                        className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">Część kapitałowa (PLN)</label>
                                    <input
                                        type="number"
                                        placeholder="np. 1 500,00"
                                        value={paymentForm.principalAmount}
                                        onChange={e => setPaymentForm({ ...paymentForm, principalAmount: e.target.value })}
                                        className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                                    />
                                </div>
                            </div>
                            {installmentSuggestion && (
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs text-gray-500">
                                        Obliczono z parametrów kredytu (pozostało {installmentSuggestion.remainingMonths} rat)
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentForm(prev => ({
                                            ...prev,
                                            totalAmount: installmentSuggestion.totalAmount.toFixed(2),
                                            principalAmount: installmentSuggestion.principalAmount.toFixed(2),
                                        }))}
                                        className="text-xs text-gray-400 hover:text-white border border-white/10 hover:border-white/30 rounded-[5px] px-3 py-1.5 transition-colors shrink-0"
                                    >
                                        Przelicz z parametrów
                                    </button>
                                </div>
                            )}
                            {paymentForm.totalAmount && paymentForm.principalAmount && (
                                <p className="text-sm text-gray-500">
                                    Część odsetkowa: <span className="text-rose-400 font-bold">
                                        {(parseFloat(paymentForm.totalAmount) - parseFloat(paymentForm.principalAmount)).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                    </span>
                                </p>
                            )}
                            {(() => {
                                if (!installmentSuggestion || !paymentForm.totalAmount || !paymentForm.principalAmount) return null;
                                const impliedInterest = parseFloat(paymentForm.totalAmount) - parseFloat(paymentForm.principalAmount);
                                if (!Number.isFinite(impliedInterest)) return null;
                                const expected = installmentSuggestion.interestAmount;
                                const deviation = Math.abs(impliedInterest - expected);
                                if (deviation <= 50 || deviation <= Math.abs(expected) * 0.25) return null;
                                return (
                                    <p className="text-xs text-amber-400">
                                        Część odsetkowa odbiega od wyliczonej z oprocentowania
                                        (~{expected.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN)
                                    </p>
                                );
                            })()}
                        </>
                    ) : (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2">Kwota nadpłaty (PLN)</label>
                                <input
                                    type="number"
                                    placeholder="np. 10 000,00"
                                    value={paymentForm.totalAmount}
                                    onChange={e => setPaymentForm({ ...paymentForm, totalAmount: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-primary/50"
                                />
                                <p className="text-xs text-gray-500 mt-2">Cała kwota zmniejsza kapitał (bez odsetek), a harmonogram zostanie przeliczony.</p>
                            </div>
                            {(() => {
                                if (!selectedMortgage) return null;
                                const over = parseFloat(paymentForm.totalAmount);
                                if (!Number.isFinite(over) || over <= 0) return null;
                                const currentBalance = Number(selectedMortgage.currentBalance);
                                const newBalance = Math.max(0, currentBalance - over);
                                const fmtPln = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

                                const after = suggestInstallment({
                                    currentBalance: newBalance,
                                    termMonths: selectedMortgage.termMonths,
                                    marginRate: selectedMortgage.marginRate,
                                    referenceRate: selectedMortgage.referenceRate,
                                    installmentType: selectedMortgage.installmentType ?? null,
                                    paymentsMade: selectedMortgage.payments.length,
                                });

                                // Harmonogram prognozowany: model „obniż ratę przy zachowaniu okresu"
                                // (spójny z 'nowa rata z parametrów'). Reużywamy generateSchedule.
                                const installmentType = selectedMortgage.installmentType ?? null;
                                const remainingMonths = Math.max(1, (selectedMortgage.termMonths ?? 0) - selectedMortgage.payments.length);
                                const annualRatePercent = Number(selectedMortgage.marginRate ?? 0) + Number(selectedMortgage.referenceRate ?? 0);
                                const baseSchedule = after && installmentType ? generateSchedule({ principal: currentBalance, termMonths: remainingMonths, annualRatePercent, installmentType }) : null;
                                const afterSchedule = after && installmentType && newBalance > 0 ? generateSchedule({ principal: newBalance, termMonths: remainingMonths, annualRatePercent, installmentType }) : null;
                                const interestSaved = baseSchedule && afterSchedule ? baseSchedule.totalInterest - afterSchedule.totalInterest : null;

                                return (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-[5px] p-3 space-y-1.5">
                                        <p className="text-sm text-white/80">
                                            Saldo po nadpłacie: <span className="font-bold text-emerald-400">{fmtPln(newBalance)} PLN</span>
                                        </p>
                                        {after ? (
                                            <>
                                                <p className="text-sm text-white/80">
                                                    Nowa rata (z parametrów): <span className="font-bold text-emerald-400">{fmtPln(after.totalAmount)} PLN</span>
                                                    {installmentSuggestion && (
                                                        <span className="text-white/40"> ({after.totalAmount <= installmentSuggestion.totalAmount ? '−' : '+'}{fmtPln(Math.abs(installmentSuggestion.totalAmount - after.totalAmount))} PLN)</span>
                                                    )}
                                                </p>
                                                {interestSaved != null && interestSaved > 0.005 && (
                                                    <p className="text-sm text-white/80">
                                                        Odsetki zaoszczędzone: <span className="font-bold text-emerald-400">{fmtPln(interestSaved)} PLN</span>
                                                    </p>
                                                )}
                                                {afterSchedule && afterSchedule.rows.length > 0 && (
                                                    <details className="mt-1">
                                                        <summary className="text-xs text-emerald-300/80 cursor-pointer select-none">Pokaż harmonogram prognozowany</summary>
                                                        <div className="mt-2 max-h-56 overflow-y-auto rounded-[5px] border border-white/5">
                                                            <table className="w-full text-[11px]">
                                                                <thead className="sticky top-0 bg-[#101012] text-white/40 uppercase tracking-wider text-[9px]">
                                                                    <tr>
                                                                        <th className="text-left px-2 py-1.5 font-bold">Mies.</th>
                                                                        <th className="text-right px-2 py-1.5 font-bold">Rata</th>
                                                                        <th className="text-right px-2 py-1.5 font-bold">Kapitał</th>
                                                                        <th className="text-right px-2 py-1.5 font-bold">Odsetki</th>
                                                                        <th className="text-right px-2 py-1.5 font-bold">Saldo</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-white/5 text-white/70">
                                                                    {afterSchedule.rows.map(row => (
                                                                        <tr key={row.month}>
                                                                            <td className="px-2 py-1 text-left">{row.month}</td>
                                                                            <td className="px-2 py-1 text-right">{fmtPln(row.payment)}</td>
                                                                            <td className="px-2 py-1 text-right">{fmtPln(row.principal)}</td>
                                                                            <td className="px-2 py-1 text-right">{fmtPln(row.interest)}</td>
                                                                            <td className="px-2 py-1 text-right">{fmtPln(row.balance)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </details>
                                                )}
                                            </>
                                        ) : newBalance === 0 ? (
                                            <p className="text-sm font-bold text-emerald-400">Kredyt zostanie w pełni spłacony 🎉</p>
                                        ) : (
                                            <p className="text-xs text-amber-300/80 leading-snug">
                                                Uzupełnij parametry kredytu (typ raty, okres, oprocentowanie), aby zobaczyć prognozę raty i harmonogram.
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}
                        </>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Miesiąc</label>
                            <select
                                value={paymentForm.month}
                                onChange={e => setPaymentForm({ ...paymentForm, month: parseInt(e.target.value) })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50"
                            >
                                <option value={1}>Styczeń</option>
                                <option value={2}>Luty</option>
                                <option value={3}>Marzec</option>
                                <option value={4}>Kwiecień</option>
                                <option value={5}>Maj</option>
                                <option value={6}>Czerwiec</option>
                                <option value={7}>Lipiec</option>
                                <option value={8}>Sierpień</option>
                                <option value={9}>Wrzesień</option>
                                <option value={10}>Październik</option>
                                <option value={11}>Listopad</option>
                                <option value={12}>Grudzień</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2">Rok</label>
                            <select
                                value={paymentForm.year}
                                onChange={e => setPaymentForm({ ...paymentForm, year: parseInt(e.target.value) })}
                                className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50"
                            >
                                {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2">Data wpłaty</label>
                        <input
                            type="date"
                            value={paymentForm.paymentDate}
                            onChange={e => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-primary/50"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-4 pt-6">
                        <button
                            onClick={() => setIsAddPaymentOpen(false)}
                            className="px-8 py-3 text-gray-500 font-medium hover:text-gray-700 transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={handleAddPayment}
                            className="px-10 py-3.5 bg-surface text-white rounded-[5px] font-bold border border-white/10 hover:bg-white/5 transition-all shadow-lg shadow-black/10 active:scale-95 text-sm"
                        >
                            {paymentForm.isOverpayment ? 'Dodaj nadpłatę' : 'Dodaj ratę'}
                        </button>
                    </div>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                variant={confirmConfig.type as any}
            />
        </div>
    );
}
