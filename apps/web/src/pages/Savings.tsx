import { useState } from 'react';
import {
    Plus,
    Trash2,
    PiggyBank,
    ArrowRightLeft,
    Check,
    Pencil,
    Archive,
    RotateCcw,
    ChevronDown,
    ChevronRight,
    Coins,
    Clock
} from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useSavingsAccounts, useSavingsSummary, useInvalidateQueries } from '../hooks/useQueries';
import type { SavingsAccountItem } from '../hooks/useQueries';
import ConfirmModal from '../components/ui/ConfirmModal';
import ArchiveAccountModal from '../components/ArchiveAccountModal';
import MonthlyProfitModal from '../components/savings/MonthlyProfitModal';
import SettleDepositModal from '../components/savings/SettleDepositModal';
import SavingsAccountModal from '../components/savings/SavingsAccountModal';
import SimulationModal from '../components/savings/SimulationModal';
import GoalsSection from '../components/savings/GoalsSection';

type Account = SavingsAccountItem;

export default function Savings() {
    const { success, error: toastError } = useToast();
    const { invalidateSavingsData } = useInvalidateQueries();

    const { data: accountsData, isLoading } = useSavingsAccounts();
    const accounts = accountsData ?? [];
    const { data: summaryData } = useSavingsSummary();
    const totalSavingsPLN = Number(summaryData?.total || 0);

    // Modal dodawania/edycji konta
    const [isAddingAccount, setIsAddingAccount] = useState(false);
    const [editingAccount, setEditingAccount] = useState<Account | null>(null);

    // Symulacja
    const [simulatingAccountId, setSimulatingAccountId] = useState<string | null>(null);

    // Archiwizacja (zamykanie) kont
    const [accountToArchive, setAccountToArchive] = useState<Account | null>(null);
    const [showArchived, setShowArchived] = useState(false);

    // Rozliczanie odsetek
    const [isSettlingInterest, setIsSettlingInterest] = useState(false);
    const [settlingDepositId, setSettlingDepositId] = useState<string | null>(null);
    const [initialSettlementAccountId, setInitialSettlementAccountId] = useState<string | null>(null);

    // Confirm Modal state (usuwanie konta)
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

    const openAddAccount = () => {
        setEditingAccount(null);
        setIsAddingAccount(true);
    };

    const handleEditAccount = (account: Account) => {
        setEditingAccount(account);
        setIsAddingAccount(true);
    };

    const handleCloseAccountModal = () => {
        setIsAddingAccount(false);
        setEditingAccount(null);
    };

    const handleDeleteAccount = (id: string) => {
        const account = accounts.find(a => a.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń konto',
            message: `Czy na pewno chcesz usunąć konto "${account?.name}"? Tych zmian nie można cofnąć.`,
            onConfirm: async () => {
                try {
                    await api.delete(`/savings/${id}`);
                    invalidateSavingsData();
                    setIsAddingAccount(false);
                    setEditingAccount(null);
                    success('Konto zostało usunięte');
                } catch (error) {
                    console.error('Błąd usuwania konta:', error);
                    toastError('Nie udało się usunąć konta');
                }
            },
            type: 'danger'
        });
    };

    const handleArchiveConfirm = async (closedAt: string) => {
        if (!accountToArchive) return;
        try {
            await api.patch(`/savings/${accountToArchive.id}/archive`, { closedAt });
            invalidateSavingsData();
            success('Konto zostało zamknięte');
        } catch (err: any) {
            toastError(err?.response?.data?.error || 'Nie udało się zamknąć konta');
            throw err;
        }
    };

    const handleUnarchive = async (account: Account) => {
        try {
            await api.patch(`/savings/${account.id}/unarchive`);
            invalidateSavingsData();
            success('Konto zostało przywrócone');
        } catch (err) {
            console.error('Błąd przywracania konta:', err);
            toastError('Nie udało się przywrócić konta');
        }
    };

    if (isLoading) return <div className="text-white p-8">Ładowanie...</div>;

    const activeAccounts = accounts.filter(a => !a.closedAt);
    const archivedAccounts = accounts.filter(a => a.closedAt);

    const renderArchivedCard = (account: Account) => {
        const closedLabel = account.closedAt
            ? new Date(account.closedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
        return (
            <div
                key={account.id}
                className="group relative bg-white/[0.02] border border-white/5 rounded-[5px] p-4 flex flex-col justify-between opacity-60 hover:opacity-100 transition-opacity"
            >
                <div className="flex items-start justify-between mb-4 min-w-0">
                    <div className="min-w-0">
                        <h3 className="text-white/70 font-bold text-xs leading-tight whitespace-normal break-words line-through decoration-white/30">{account.name}</h3>
                        <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{account.bank}</p>
                    </div>
                    <button
                        onClick={() => handleUnarchive(account)}
                        className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-emerald-400 transition-colors shrink-0 ml-2"
                        title="Przywróć konto"
                    >
                        <RotateCcw size={11} />
                        Przywróć
                    </button>
                </div>
                <div className="space-y-1">
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-xl font-black tracking-tight text-white/50">
                            {Number(account.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] font-black text-white/20 uppercase">{account.currency || 'PLN'}</span>
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-500/50">Zamknięte · {closedLabel}</p>
                </div>
            </div>
        );
    };

    const renderDepositAccounts = () => {
        const depositAccounts = activeAccounts.filter(a => a.type === 'deposit' && a.status !== 'SETTLED');

        if (depositAccounts.length === 0) {
            return (
                <div className="bg-surface/30 border border-white/5 border-dashed rounded-[5px] p-8 text-center shadow-inner">
                    <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">Brak aktywnych lokat</p>
                </div>
            );
        }

        return depositAccounts.map((account) => {
            const startDate = account.depositStartDate ? new Date(account.depositStartDate) : new Date();
            const duration = Number(account.depositDurationMonths || 3);
            const endDate = new Date(startDate.getTime());
            endDate.setMonth(endDate.getMonth() + duration);

            const now = new Date();
            const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const elapsedDays = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            const remainingDays = Math.max(0, totalDays - elapsedDays);
            const isFinished = now >= endDate;

            const estimatedProfit = Number(account.balance) * (Number(account.interestRate || 0) / 100) * (totalDays / 365) * 0.81;

            return (
                <div
                    key={account.id}
                    onClick={() => setSimulatingAccountId(account.id)}
                    className={`group relative bg-white/5 border rounded-[5px] p-4 transition-all cursor-pointer hover:bg-white/[0.08] hover:shadow-2xl hover:shadow-black/40 flex flex-col justify-between ${isFinished && account.status !== 'SETTLED' ? 'border-white/30 ring-1 ring-white/10' : 'border-white/5'}`}
                >
                    <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all z-20">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEditAccount(account);
                            }}
                            className="p-1.5 text-white/20 hover:text-white transition-colors"
                            title="Edytuj"
                        >
                            <Pencil size={12} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setAccountToArchive(account);
                            }}
                            className="p-1.5 text-white/20 hover:text-amber-500 transition-colors"
                            title="Zamknij konto"
                        >
                            <Archive size={12} />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAccount(account.id);
                            }}
                            className="p-1.5 text-white/20 hover:text-rose-500 transition-colors"
                            title="Usuń"
                        >
                            <Trash2 size={12} />
                        </button>
                    </div>

                    <div>
                        <div className="flex items-center gap-3">
                            <div className={`h-8 w-8 rounded-[5px] flex items-center justify-center flex-shrink-0 ${isFinished && account.status !== 'SETTLED' ? 'bg-white/10 text-white' : 'bg-white/5 text-white/40'}`}>
                                <ArrowRightLeft size={16} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-white font-bold text-xs leading-tight truncate">{account.name}</h3>
                                <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{account.bank}</p>
                            </div>
                        </div>

                        <div className="space-y-3 mb-4 mt-4">
                            <div>
                                <p className="text-white/20 text-[9px] font-black uppercase tracking-widest mb-1.5">Kwota lokaty:</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black tracking-tight text-white">
                                        {Number(account.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                    <span className="text-xs font-black text-white/30 uppercase">{account.currency || 'PLN'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {account.interestRate && Number(account.interestRate) > 0 && (
                                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                        Oprocentowanie: <span className="text-white/80 font-black">{account.interestRate}%</span>
                                    </p>
                                )}
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                    Czas trwania: <span className="text-white/80 font-black">{duration} {duration === 1 ? 'miesiąc' : duration < 5 ? 'miesiące' : 'miesięcy'}</span>
                                </p>
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                    Pozostało do końca lokaty: <span className="text-white/80 font-black">{remainingDays} {remainingDays === 1 ? 'dzień' : 'dni'}</span>
                                </p>
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest leading-relaxed">
                                    Szacowany zysk (netto): <span className="text-white/80 font-black">
                                        {estimatedProfit.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                                    </span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                            <p className="text-[8px] font-bold text-white/10 uppercase tracking-[0.2em]">
                                Data otwarcia: {startDate.toLocaleDateString('pl-PL')}
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSimulatingAccountId(account.id);
                                    }}
                                    className="transition-all text-[8px] font-black text-white/40 hover:text-white uppercase tracking-[0.2em] border border-white/10 rounded-[4px] px-2 py-1 flex items-center gap-1.5"
                                >
                                    Symulacja
                                </button>
                            </div>
                        </div>

                        {isFinished && account.status !== 'SETTLED' && (
                            <>
                                {/* Nienachalny pasek rozliczenia — nie zasłania karty, edycja pozostaje dostępna */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSettlingDepositId(account.id);
                                    }}
                                    className="group/nudge w-full mt-3 flex items-center justify-between gap-2 bg-white/10 hover:bg-white/[0.16] border border-white/15 rounded-[5px] px-3 py-2 transition-all"
                                >
                                    <span className="flex items-center gap-2 text-[10px] font-black text-white/70 uppercase tracking-[0.15em]">
                                        <Check size={12} strokeWidth={3} />
                                        Lokata zakończona
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] font-black text-white uppercase tracking-[0.15em] opacity-80 group-hover/nudge:opacity-100 transition-opacity">
                                        Rozlicz lokatę
                                        <ChevronRight size={12} />
                                    </span>
                                </button>
                                {/* Status Badge */}
                                <div className="absolute -top-1.5 -right-1.5 bg-white text-black text-[7px] font-black px-1.5 py-0.5 rounded-[3px] uppercase tracking-tighter shadow-lg shadow-white/20 z-40">
                                    Zakończona
                                </div>
                            </>
                        )}
                    </div>
                </div>
            );
        });
    };


    return (
        <div className="p-4 md:p-8 max-w-[1600px] mx-auto">
            {/* Nagłówek Sumaryczny - Styl ujednolicony z Kontami Osobistymi */}
            <div className="bg-white/5 border border-white/5 rounded-[5px] p-3 md:p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl mb-8">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-white/10 rounded-[5px] flex items-center justify-center hidden sm:flex">
                        <PiggyBank size={20} className="text-white" />
                    </div>
                    <div>
                        <p className="text-white/30 text-[9px] font-black uppercase tracking-widest leading-none mb-1.5">Suma oszczędności</p>
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-baseline gap-2 leading-none">
                            {totalSavingsPLN.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs text-white/30 font-bold uppercase">PLN</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={openAddAccount}
                        className="flex-1 sm:flex-none bg-white hover:bg-white/90 text-black font-black uppercase tracking-widest text-[10px] h-9 px-6 rounded-[2px] shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                    >
                        <Plus size={14} strokeWidth={3} />
                        Dodaj
                    </button>
                </div>
            </div>

            {/* Sekcja kont - Split na kolumny */}
            <div className="space-y-12">
                {/* Modal dodawania/edycji konta */}
                <SavingsAccountModal
                    isOpen={isAddingAccount}
                    onClose={handleCloseAccountModal}
                    editingAccount={editingAccount}
                    onSaved={invalidateSavingsData}
                    onRequestDelete={handleDeleteAccount}
                />

                {/* Lista kont i lokat - Zunifikowana Siatka */}
                {/* Układ dwukolumnowy: Konta vs Lokaty - Styl ze zrzutu ekranu */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
                    {/* Lewa Kolumna: Konta Oszczędnościowe */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-1 mb-4">
                            <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Konta Oszczędnościowe</h3>
                            <div className="h-px w-full bg-white/5"></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeAccounts.filter(a => a.type !== 'deposit').length === 0 ? (
                                <div className="bg-surface/30 border border-white/5 border-dashed rounded-[5px] p-8 text-center shadow-inner">
                                    <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">Brak aktywnych kont</p>
                                </div>
                            ) : (
                                activeAccounts.filter(a => a.type !== 'deposit').map((account) => {
                                    const now = new Date();
                                    const promoEnd = account.promoEndsAt ? new Date(account.promoEndsAt) : null;
                                    const hasPromo = !!promoEnd && account.postPromoInterestRate != null;
                                    const promoActive = hasPromo && !!promoEnd && promoEnd >= now;
                                    const effectiveRate = promoActive
                                        ? account.interestRate
                                        : (hasPromo ? account.postPromoInterestRate : account.interestRate);
                                    const daysLeft = promoActive && promoEnd
                                        ? Math.max(0, Math.ceil((promoEnd.getTime() - now.getTime()) / 86400000))
                                        : 0;
                                    return (
                                    <div
                                        key={account.id}
                                        onClick={() => setSimulatingAccountId(account.id)}
                                        className="group relative bg-white/5 border border-white/5 rounded-[5px] p-4 transition-all cursor-pointer hover:bg-white/[0.08] hover:shadow-2xl hover:shadow-black/40 flex flex-col justify-between"
                                    >
                                        <div className="absolute top-3 right-3 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all z-20">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditAccount(account);
                                                }}
                                                className="p-1.5 text-white/20 hover:text-white transition-colors"
                                                title="Edytuj"
                                            >
                                                <Pencil size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAccountToArchive(account);
                                                }}
                                                className="p-1.5 text-white/20 hover:text-amber-500 transition-colors"
                                                title="Zamknij konto"
                                            >
                                                <Archive size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteAccount(account.id);
                                                }}
                                                className="p-1.5 text-white/20 hover:text-rose-500 transition-colors"
                                                title="Usuń"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>

                                        <div>
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-8 w-8 rounded-[5px] flex items-center justify-center flex-shrink-0 bg-white/10 text-white">
                                                    <PiggyBank size={16} strokeWidth={2.5} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-white font-bold text-xs leading-tight whitespace-normal break-words">{account.name}</h3>
                                                    <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{account.bank}</p>
                                                </div>
                                            </div>

                                            <div className="space-y-3 mb-4 mt-4">
                                                <div>
                                                    <p className="text-white/20 text-[9px] font-black uppercase tracking-widest mb-1.5">Saldo:</p>
                                                    <div className="flex items-baseline gap-2">
                                                        <span className="text-2xl font-black tracking-tight text-white">
                                                            {Number(account.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </span>
                                                        <span className="text-xs font-black text-white/30 uppercase">{account.currency || 'PLN'}</span>
                                                    </div>
                                                </div>

                                                {effectiveRate != null && Number(effectiveRate) > 0 && (
                                                    <div>
                                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2 flex-wrap">
                                                            <span>Oprocentowanie: <span className="text-white/80 font-black">{effectiveRate}%</span></span>
                                                            {promoActive && (
                                                                <span className="text-[8px] font-black uppercase tracking-[0.1em] text-amber-400 bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 rounded-[4px]">Promo</span>
                                                            )}
                                                        </p>
                                                        {promoActive && promoEnd && (
                                                            <div className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-amber-400/90 bg-amber-500/[0.08] border border-amber-500/20 rounded-[5px] px-2 py-1.5">
                                                                <Clock size={11} className="shrink-0" />
                                                                <span>
                                                                    do {promoEnd.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })} · {daysLeft} {daysLeft === 1 ? 'dzień' : 'dni'} · potem <span className="text-white/80 font-black">{account.postPromoInterestRate}%</span>
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Przypomnienie o nierozliczonych odsetkach — nienachalny pasek, nie zasłania karty */}
                                        {account.hasUnsettledMonths && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setInitialSettlementAccountId(account.id);
                                                    setIsSettlingInterest(true);
                                                }}
                                                className="group/nudge w-full mb-3 flex items-center justify-between gap-2 bg-amber-500/10 hover:bg-amber-500/[0.16] border border-amber-500/20 rounded-[5px] px-3 py-2 transition-all"
                                            >
                                                <span className="flex items-center gap-2 text-[10px] font-black text-amber-400/90 uppercase tracking-[0.15em]">
                                                    <Coins size={12} />
                                                    Zysk do rozliczenia{account.unsettledMonthsCount ? ` · ${account.unsettledMonthsCount} mies.` : ''}
                                                </span>
                                                <span className="flex items-center gap-1 text-[10px] font-black text-amber-300 uppercase tracking-[0.15em] opacity-80 group-hover/nudge:opacity-100 transition-opacity">
                                                    Rozlicz
                                                    <ChevronRight size={12} />
                                                </span>
                                            </button>
                                        )}

                                        <div className="flex items-center justify-between pt-3 border-t border-white/5">
                                            <p className="text-[8px] font-bold text-white/10 uppercase tracking-[0.2em]">
                                                Ost. aktualizacja: {new Date(account.updatedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </p>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSimulatingAccountId(account.id);
                                                }}
                                                className="transition-all text-[8px] font-black text-white/40 hover:text-white uppercase tracking-[0.2em] border border-white/10 rounded-[4px] px-2 py-1 flex items-center gap-1.5"
                                            >
                                                Symulacja
                                            </button>
                                        </div>
                                    </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Prawa Kolumna: Lokaty Terminowe */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 px-1 mb-4">
                            <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Lokaty Terminowe</h3>
                            <div className="h-px w-full bg-white/5"></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {renderDepositAccounts()}
                        </div>
                    </div>
                </div>


                {/* Sekcja zamkniętych kont */}
                {archivedAccounts.length > 0 && (
                    <div className="space-y-3 -mt-8 mb-12">
                        <button
                            onClick={() => setShowArchived(v => !v)}
                            className="flex items-center gap-3 px-1 w-full group/arch"
                        >
                            <Archive size={12} className="text-white/20 shrink-0" />
                            <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap group-hover/arch:text-white/40 transition-colors">
                                Zamknięte konta · {archivedAccounts.length}
                            </h3>
                            <div className="h-px w-full bg-white/5"></div>
                            <ChevronDown size={14} className={`text-white/20 shrink-0 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                        </button>
                        {showArchived && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {archivedAccounts.map(renderArchivedCard)}
                            </div>
                        )}
                    </div>
                )}

                {/* Modal Symulacji */}
                <SimulationModal
                    accountId={simulatingAccountId}
                    promoEndsAt={accounts.find(a => a.id === simulatingAccountId)?.promoEndsAt}
                    onClose={() => setSimulatingAccountId(null)}
                />

            </div>

            {/* Sekcja Celów (samowystarczalna: lista, add/edit, transfer, podgląd) */}
            <GoalsSection />

            {/* Modale kont */}
            <MonthlyProfitModal
                isOpen={isSettlingInterest}
                onClose={() => {
                    setIsSettlingInterest(false);
                    setInitialSettlementAccountId(null);
                }}
                accounts={accounts.filter(a => a.type === 'savings')}
                onSuccess={invalidateSavingsData}
                initialAccountId={initialSettlementAccountId}
            />

            <SettleDepositModal
                isOpen={!!settlingDepositId}
                onClose={() => setSettlingDepositId(null)}
                depositId={settlingDepositId}
                onSuccess={invalidateSavingsData}
            />

            <ArchiveAccountModal
                isOpen={!!accountToArchive}
                onClose={() => setAccountToArchive(null)}
                accountName={accountToArchive?.name || ''}
                onConfirm={handleArchiveConfirm}
            />

            {
                confirmConfig.isOpen && (
                    <ConfirmModal
                        isOpen={confirmConfig.isOpen}
                        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                        onConfirm={confirmConfig.onConfirm}
                        title={confirmConfig.title}
                        message={confirmConfig.message}
                        variant={confirmConfig.type || 'danger'}
                    />
                )
            }
        </div >

    );
}
