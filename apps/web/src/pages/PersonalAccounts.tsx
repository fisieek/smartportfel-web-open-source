import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, CreditCard, Pencil, Trash2, Wallet, Gift, Star, Archive, RotateCcw, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import AccountHistoryModal from '../components/AccountHistoryModal';
import AccountModal from '../components/AccountModal';
import ArchiveAccountModal from '../components/ArchiveAccountModal';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../context/CurrencyContext';
import ConfirmModal from '../components/ui/ConfirmModal';
import { Button } from '../components/ui/button';
import { CurrencySwitcher } from '../components/ui/CurrencySwitcher';
import { getDisplayBalances } from '../lib/formatters';

interface AccountBalance {
    id: string;
    currency: string;
    balance: number;
}

interface PersonalAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
    isMain: boolean;
    isSystem: boolean;
    isMultiCurrency: boolean;
    type?: string;
    expiryDate?: string;
    currency?: string;
    balances: AccountBalance[];
    updatedAt: string;
    closedAt?: string | null;
    isShared?: boolean;
    // Konto wspólne należące do innego członka gospodarstwa (tylko podgląd + księgowanie).
    isSharedFromHousehold?: boolean;
    ownerName?: string | null;
}

export default function PersonalAccounts() {
    const [accounts, setAccounts] = useState<PersonalAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const { refreshTrigger } = useOutletContext<{ refreshTrigger: number }>();

    // Modal states
    const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
    const [accountToEdit, setAccountToEdit] = useState<PersonalAccount | null>(null);

    const [selectedAccount, setSelectedAccount] = useState<PersonalAccount | null>(null);
    const [accountToArchive, setAccountToArchive] = useState<PersonalAccount | null>(null);
    const [showArchived, setShowArchived] = useState(false);
    const { success, error: toastError } = useToast();

    // Confirm Modal state for deletions
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

    const fetchAccounts = async () => {
        try {
            const response = await api.get('/personal-accounts');
            setAccounts(response.data);
        } catch (error) {
            console.error('Błąd pobierania kont:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, [refreshTrigger]);

    const { displayCurrency, convertFromPLN } = useCurrency();
    const [plnRates, setPlnRates] = useState<Record<string, number>>({});

    // Kursy NBP (PLN za 1 jednostkę) dla walut obcych występujących na kontach
    useEffect(() => {
        const currencies = new Set<string>();
        for (const acc of accounts) {
            const main = acc.currency || 'PLN';
            if (main !== 'PLN' && main !== 'PKT') currencies.add(main);
            for (const bal of acc.balances || []) {
                if (bal.currency !== 'PLN' && bal.currency !== 'PKT') currencies.add(bal.currency);
            }
        }
        const missing = [...currencies].filter(c => !(c in plnRates));
        if (missing.length === 0) return;
        Promise.all(missing.map(async (c) => {
            try {
                const res = await api.get(`/expenses/exchange-rate?currency=${c}`);
                return [c, Number(res.data?.rate) || 1] as const;
            } catch {
                console.warn(`Brak kursu NBP dla ${c}, sumuję po nominale`);
                return [c, 1] as const;
            }
        })).then(entries => {
            setPlnRates(prev => ({ ...prev, ...Object.fromEntries(entries) }));
        });
    }, [accounts]);

    const toPLN = (amount: number, currency: string) =>
        currency === 'PLN' ? amount : amount * (plnRates[currency] || 1);

    // Suma środków monetarnych (jak kafelek KONTA na Dashboardzie) przeliczona na walutę wyświetlania
    const totalBalancePLN = accounts.reduce((sum, acc) => {
        if (acc.closedAt) return sum; // zamknięte konta nie wliczają się do sumy
        const type = acc.type;
        const isMonetary = !type || type === 'BANK' || type === 'CASH' || acc.name === 'Gotówka';
        if (!isMonetary || acc.currency === 'PKT') {
            return sum;
        }

        if (acc.balances && acc.balances.length > 0) {
            for (const bal of acc.balances) {
                if (bal.currency === 'PKT') continue;
                sum += toPLN(Number(bal.balance || 0), bal.currency);
            }
        } else {
            sum += toPLN(Number(acc.balance || 0), acc.currency || 'PLN');
        }

        return sum;
    }, 0);
    const totalBalance = convertFromPLN(totalBalancePLN);

    const handleAddClick = () => {
        setAccountToEdit(null);
        setIsAccountModalOpen(true);
    };

    const handleEditClick = (account: PersonalAccount) => {
        setAccountToEdit(account);
        setIsAccountModalOpen(true);
    };

    const handleDeleteAccount = async (id: string) => {
        const account = accounts.find(a => a.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń konto',
            message: `Czy na pewno chcesz usunąć konto "${account?.name}"? Tych zmian nie można cofnąć.`,
            onConfirm: async () => {
                try {
                    await api.delete(`/personal-accounts/${id}`);
                    await fetchAccounts();
                    success('Konto zostało usunięte');
                } catch (err) {
                    console.error('Błąd usuwania konta:', err);
                    toastError('Nie udało się usunąć konta');
                }
            },
            type: 'danger'
        });
    };

    const handleArchiveConfirm = async (closedAt: string) => {
        if (!accountToArchive) return;
        try {
            await api.patch(`/personal-accounts/${accountToArchive.id}/archive`, { closedAt });
            await fetchAccounts();
            success('Konto zostało zamknięte');
        } catch (err: any) {
            toastError(err?.response?.data?.error || 'Nie udało się zamknąć konta');
            throw err;
        }
    };

    const handleUnarchive = async (account: PersonalAccount) => {
        try {
            await api.patch(`/personal-accounts/${account.id}/unarchive`);
            await fetchAccounts();
            success('Konto zostało przywrócone');
        } catch (err) {
            console.error('Błąd przywracania konta:', err);
            toastError('Nie udało się przywrócić konta');
        }
    };

    if (loading) return <div className="text-white p-8 font-black uppercase tracking-widest text-xs animate-pulse">Ładowanie portfolio...</div>;

    const activeAccounts = accounts.filter(acc => !acc.closedAt);
    const archivedAccounts = accounts.filter(acc => acc.closedAt && !acc.isSharedFromHousehold);

    const monetaryAccounts = activeAccounts.filter(acc => {
        const type = acc.type;
        const isCash = acc.name === 'Gotówka' || type === 'CASH';
        return !type || type === 'BANK' || isCash;
    });
    const nonMonetaryAccounts = activeAccounts.filter(acc => {
        const type = acc.type;
        const isCash = acc.name === 'Gotówka' || type === 'CASH';
        return type && type !== 'BANK' && !isCash;
    });

    const renderArchivedCard = (account: PersonalAccount) => {
        const closedLabel = account.closedAt
            ? new Date(account.closedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';
        const primary = getDisplayBalances(account).find(b => b.currency === (account.currency || 'PLN')) || getDisplayBalances(account)[0];
        return (
            <div
                key={account.id}
                className="group relative bg-white/[0.02] border border-white/5 rounded-[5px] p-4 flex flex-col justify-between h-full opacity-60 hover:opacity-100 transition-opacity"
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
                        <span className="text-base font-black tracking-tight text-white/50">
                            {primary ? Number(primary.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00'}
                        </span>
                        <span className="text-[10px] font-black text-white/20 uppercase">{primary?.currency || 'PLN'}</span>
                    </div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-500/50">Zamknięte · {closedLabel}</p>
                </div>
            </div>
        );
    };

    const renderAccountCard = (account: PersonalAccount) => {

        const getIcon = () => {
            const type = account.type;
            if (type === 'CASH' || account.name === 'Gotówka') return Wallet;
            if (type === 'LOYALTY_CARD') return Star;
            if (type === 'GIFT_CARD' || type === 'VOUCHER') return Gift;
            return CreditCard;
        };
        const Icon = getIcon();

        const displayBalances = getDisplayBalances(account);
        const primaryBalance = displayBalances.find(b => b.currency === (account.currency || 'PLN')) || displayBalances[0];
        const otherBalances = displayBalances.filter(b => b !== primaryBalance);

        return (
            <div
                key={account.id}
                onClick={() => setSelectedAccount(account)}
                className={`group relative bg-white/5 border rounded-[5px] p-4 transition-all cursor-pointer hover:bg-white/[0.08] hover:shadow-2xl hover:shadow-black/40 flex flex-col justify-between h-full ${account.isMain ? 'border-amber-500/20 ring-1 ring-amber-500/10' : 'border-white/5'}`}
            >
                <div>
                    <div className="flex items-start justify-between mb-4 min-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-8 w-8 rounded-[5px] flex items-center justify-center flex-shrink-0 ${account.type === 'LOYALTY_CARD' ? 'bg-amber-500/10 text-amber-500' :
                                (account.type === 'GIFT_CARD' || account.type === 'VOUCHER') ? 'bg-rose-500/10 text-rose-500' : 'bg-white/10 text-white'
                                }`}>
                                <Icon size={16} strokeWidth={2.5} />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-white font-bold text-xs leading-tight whitespace-normal break-words">{account.name}</h3>
                                <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{account.bank}</p>
                            </div>
                        </div>

                        <div className="flex flex-col items-end shrink-0 ml-2">
                            {/* Status indicator for main account */}
                            {account.isMain && (
                                <span className="text-[7px] font-black uppercase tracking-[0.1em] text-amber-500/60 mb-1">
                                    Konto główne
                                </span>
                            )}
                            {/* Konto wspólne współczłonka gospodarstwa */}
                            {account.isSharedFromHousehold && (
                                <span className="text-[7px] font-black uppercase tracking-[0.1em] text-primary/70 mb-1 whitespace-nowrap">
                                    Wspólne{account.ownerName ? ` · ${account.ownerName}` : ''}
                                </span>
                            )}
                            {/* Edycja/usuwanie tylko dla własnych kont — konta współczłonka są tylko do podglądu */}
                            {!account.isSharedFromHousehold && (
                                <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEditClick(account); }}
                                        className="p-1 text-white/30 hover:text-white transition-colors"
                                        title="Edytuj"
                                    >
                                        <Pencil size={11} />
                                    </button>
                                    {!account.isSystem && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setAccountToArchive(account); }}
                                            className="p-1 text-white/30 hover:text-amber-500 transition-colors"
                                            title="Zamknij konto"
                                        >
                                            <Archive size={11} />
                                        </button>
                                    )}
                                    {!account.isSystem && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id); }}
                                            className="p-1 text-white/30 hover:text-rose-500 transition-colors"
                                            title="Usuń"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="space-y-0.5">
                            <p className="text-white/20 text-[8px] font-black uppercase tracking-widest leading-none mb-1">
                                {account.type === 'LOYALTY_CARD' ? 'Punkty' : 'Saldo'}
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <span className={`text-lg font-black tracking-tight ${Number(primaryBalance.balance) >= 0 ? 'text-white' : 'text-rose-500'}`}>
                                    {Number(primaryBalance.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] font-black text-white/30 uppercase">{primaryBalance.currency}</span>
                            </div>
                        </div>

                        {account.isMultiCurrency && otherBalances.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                {otherBalances.map(b => (
                                    <div key={b.currency} className="flex items-baseline gap-1.5">
                                        <span className={`text-lg font-black tracking-tight ${Number(b.balance) >= 0 ? 'text-white/90' : 'text-rose-500/90'}`}>
                                            {Number(b.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[10px] font-black text-blue-400/50 uppercase">{b.currency}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        );
    };

    return (
        <div className="space-y-4 max-w-[1400px] mx-auto pb-8">
            {/* Nowy, kompaktowy Nagłówek */}
            <div className="bg-white/5 border border-white/5 rounded-[5px] p-3 md:p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-white/10 rounded-[5px] flex items-center justify-center hidden sm:flex">
                        <Wallet size={20} className="text-white" />
                    </div>
                    <div>
                        <p className="text-white/30 text-[9px] font-black uppercase tracking-widest leading-none mb-1.5">Na kontach posiadasz:</p>
                        <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-baseline gap-2 leading-none">
                            {totalBalance.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-xs text-white/30 font-bold uppercase">{displayCurrency}</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <CurrencySwitcher />
                    <Button
                        onClick={handleAddClick}
                        className="bg-white hover:bg-white/90 text-black font-black uppercase tracking-widest text-[10px] h-9 px-6 shadow-lg transition-transform active:scale-95"
                    >
                        <Plus size={14} strokeWidth={3} className="mr-2" />
                        Dodaj konto
                    </Button>
                </div>
            </div>

            {/* Grid dla kont */}
            <div className="space-y-6">
                {monetaryAccounts.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 px-1">
                            <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Konta osobiste</h3>
                            <div className="h-px w-full bg-white/5"></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {monetaryAccounts.map(renderAccountCard)}
                        </div>
                    </div>
                )}

                {nonMonetaryAccounts.length > 0 && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-3 px-1">
                            <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Karty lojalnościowe i Vouchery</h3>
                            <div className="h-px w-full bg-white/5"></div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {nonMonetaryAccounts.map(renderAccountCard)}
                        </div>
                    </div>
                )}

                {activeAccounts.length === 0 && (
                    <div className="bg-white/5 border border-white/5 rounded-[5px] p-12 text-center shadow-inner">
                        <div className="bg-white/5 p-4 rounded-full w-fit mx-auto mb-4 border border-white/5">
                            <CreditCard size={32} className="text-white/20" />
                        </div>
                        <p className="text-white font-black uppercase tracking-widest text-xs mb-1">Portfolio puste</p>
                        <p className="text-white/30 text-[10px] font-medium max-w-[200px] mx-auto">Dodaj swoje pierwsze konto bankowe, aby zacząć śledzić wydatki.</p>
                    </div>
                )}

                {archivedAccounts.length > 0 && (
                    <div className="space-y-3 pt-2">
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {archivedAccounts.map(renderArchivedCard)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <AccountModal
                isOpen={isAccountModalOpen}
                onClose={() => setIsAccountModalOpen(false)}
                onSuccess={fetchAccounts}
                accountToEdit={accountToEdit}
            />

            <ArchiveAccountModal
                isOpen={!!accountToArchive}
                onClose={() => setAccountToArchive(null)}
                accountName={accountToArchive?.name || ''}
                onConfirm={handleArchiveConfirm}
            />

            <AccountHistoryModal
                isOpen={!!selectedAccount}
                onClose={() => setSelectedAccount(null)}
                onEdit={selectedAccount ? () => {
                    const acc = selectedAccount;
                    setSelectedAccount(null);
                    setAccountToEdit(acc);
                    setIsAccountModalOpen(true);
                } : undefined}
                account={selectedAccount}
            />

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
