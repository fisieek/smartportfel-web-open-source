import { useEffect, useState, useCallback, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Search, Filter, Trash2, Edit2, Calendar, TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useOutletContext } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../context/CurrencyContext';
import { useTransactionFilters } from '../context/TransactionFiltersContext';
import { matchesAmount } from '../lib/transactionSearch';
import ConfirmModal from '../components/ui/ConfirmModal';
import Modal from '../components/ui/Modal';
import AddExpenseModal from '../components/AddExpenseModal';
import AddIncomeModal from '../components/AddIncomeModal';
import { GlowCard } from '../components/ui/spotlight-card';
import MonthlyPlanningWidget from '../components/MonthlyPlanningWidget';
import CategoryBadge from '../components/ui/CategoryBadge';
import { useCategories, usePersonalAccounts, queryKeys, type Transaction, type PlanItem } from '../hooks/useQueries';
import { useQueryClient } from '@tanstack/react-query';
import InlineStoreEditor from '../components/inline/InlineStoreEditor';
import InlineAccountEditor from '../components/inline/InlineAccountEditor';
import InlineAmountEditor from '../components/inline/InlineAmountEditor';
import { isInlineEditable } from '../components/inline/InlinePopover';
import type { LucideIcon } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';
import { formatMoney } from '../lib/formatters';

// Local UI-specific Transaction extension if needed, otherwise use from queries
export interface ExtendedTransaction extends Transaction {
    _originalId?: string; // For virtual entries
    _side?: 'source' | 'target' | 'exchange_source' | 'exchange_target';
}

interface AvailableFilter {
    year: number;
    month: number;
}

interface AccountFilter {
    id: string;
    name: string;
    bank: string;
    type?: string;
}

export default function Transactions() {
    const [editingTransaction, setEditingTransaction] = useState<ExtendedTransaction | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isIncomeEditModalOpen, setIsIncomeEditModalOpen] = useState(false);
    const [actionSheetTx, setActionSheetTx] = useState<ExtendedTransaction | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressFired = useRef(false);
    const pressStart = useRef<{ x: number; y: number } | null>(null);

    const { refreshTrigger } = useOutletContext<{ refreshTrigger: number }>();
    const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);
    const [transactions, setTransactions] = useState<ExtendedTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // TanStack Query hooks - dane statyczne z cache
    const { data: categoriesRaw = [] } = useCategories();
    const { data: accountsRaw = [] } = usePersonalAccounts();

    // Mapowanie do lokalnych typów
    const categories = useMemo(() => categoriesRaw, [categoriesRaw]);
    const personalAccounts = useMemo(() => accountsRaw as AccountFilter[], [accountsRaw]);
    const queryClient = useQueryClient();

    const { success, error: toastError } = useToast();

    // Confirm Modal state
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

    // Filtry
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [accountFilter, setAccountFilter] = useState<string>('all');
    // Filtr okresu żyje PONAD stroną — modal dodawania (w Layoutcie) ustawia z niego datę
    // początkowej transakcji, gdy przeglądany miesiąc nie jest bieżący.
    const { monthFilter: timeFilter, setMonthFilter: setTimeFilter } = useTransactionFilters();
    const [availableMonths, setAvailableMonths] = useState<AvailableFilter[]>([]);
    const [plannedStats, setPlannedStats] = useState({ income: 0, expenses: 0 });
    // Widok gospodarstwa: 'mine' | 'shared' | 'all' (przełącznik widoczny tylko dla członków household)
    const [scopeFilter, setScopeFilter] = useState<'mine' | 'shared' | 'all'>('all');
    const [inHousehold, setInHousehold] = useState(false);



    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const [year, month] = timeFilter.split('-');
            const params: Record<string, string> = {};
            if (month && year) {
                params.month = month;
                params.year = year;
            }
            if (accountFilter !== 'all') {
                params.personalAccountId = accountFilter;
            }
            if (inHousehold && scopeFilter !== 'all') {
                params.scope = scopeFilter;
            }

            const res = await api.get('/expenses', { params });
            setTransactions(res.data);

            // Fetch planned stats
            if (month && year) {
                const planRes = await api.get<{ items: PlanItem[] }>('/planning/monthly-plan', { params: { month, year } });
                const planItems = planRes.data?.items || [];
                // Sumy planowane trzymamy w PLN; pozycje w innych walutach pomijamy (v1)
                const isPlnItem = (item: PlanItem) => !item.currency || item.currency === 'PLN';
                const plannedIncome = planItems
                    .filter(item => item.type === 'income' && isPlnItem(item))
                    .reduce((sum, item) => sum + Number(item.amount), 0);
                const plannedExpenses = planItems
                    .filter(item => item.type === 'expense' && isPlnItem(item))
                    .reduce((sum, item) => sum + Number(item.amount), 0);
                setPlannedStats({ income: plannedIncome, expenses: plannedExpenses });
            }
        } catch (err) {
            console.error('Error fetching transactions', err);
        } finally {
            setLoading(false);
        }
    }, [timeFilter, accountFilter, scopeFilter, inHousehold]);

    // Fetch tylko dynamiczne dane (available-months pozostaje)
    const fetchAvailableMonths = useCallback(async () => {
        try {
            const monthsRes = await api.get('/expenses/available-months');
            setAvailableMonths(monthsRes.data);
        } catch (err) {
            console.error('Error fetching available months', err);
        }
    }, []);

    // Odświeżenie po edycji inline z listy (kwota/sklep/konto)
    const handleInlineUpdated = useCallback(() => {
        fetchTransactions();
        fetchAvailableMonths();
        setLocalRefreshTrigger(prev => prev + 1);
        queryClient.invalidateQueries({ queryKey: queryKeys.personalAccounts });
    }, [fetchTransactions, fetchAvailableMonths, queryClient]);

    useEffect(() => {
        fetchAvailableMonths();
    }, [fetchAvailableMonths]);

    // Czy użytkownik jest w gospodarstwie — decyduje o widoczności przełącznika widoku
    useEffect(() => {
        let active = true;
        api.get('/household')
            .then(res => { if (active) setInHousehold(!!res.data?.household); })
            .catch(() => { if (active) setInHousehold(false); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        fetchTransactions();
        fetchAvailableMonths();
    }, [fetchTransactions, fetchAvailableMonths, refreshTrigger]);



    const handleEdit = (tx: ExtendedTransaction) => {
        // If it's a virtual entry, we edit the original
        const transactionToEdit = tx._originalId ? { ...tx, id: tx._originalId } : tx;
        setEditingTransaction(transactionToEdit);
        if (tx.type === 'income') {
            setIsIncomeEditModalOpen(true);
        } else {
            setIsEditModalOpen(true);
        }
    };

    // Long-press (mobile): przytrzymanie wiersza otwiera menu kontekstowe (Edytuj/Usuń)
    const clearLongPress = () => {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    };
    const handleRowPointerDown = (e: ReactPointerEvent, tx: ExtendedTransaction) => {
        if (e.button !== 0) return;
        longPressFired.current = false;
        pressStart.current = { x: e.clientX, y: e.clientY };
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            setActionSheetTx(tx);
        }, 450);
    };
    const handleRowPointerMove = (e: ReactPointerEvent) => {
        if (!pressStart.current) return;
        if (Math.abs(e.clientX - pressStart.current.x) > 10 || Math.abs(e.clientY - pressStart.current.y) > 10) clearLongPress();
    };
    const handleRowClick = (tx: ExtendedTransaction) => {
        if (longPressFired.current) { longPressFired.current = false; return; }
        handleEdit(tx);
    };

    const handleDelete = (id: string, description: string) => {
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń transakcję',
            message: `Czy na pewno chcesz usunąć transakcję "${description}"? Operacji nie można cofnąć.`,
            onConfirm: async () => {
                try {
                    await api.delete(`/expenses/${id}`);
                    await Promise.all([fetchTransactions(), fetchAvailableMonths()]);
                    setLocalRefreshTrigger(prev => prev + 1);
                    success('Transakcja została usunięta');
                } catch (error) {
                    console.error('Błąd podczas usuwania transakcji', error);
                    toastError('Nie udało się usunąć transakcji');
                }
            },
            type: 'danger'
        });
    };

    // Frontend secondary filtering (for Category search and specific Income sources)
    const filteredTransactions = transactions.filter(tx => {
        const matchesCategory = categoryFilter === 'all' || tx.category?.name === categoryFilter;
        if (!matchesCategory) return false;

        const query = searchTerm.trim().toLowerCase();
        if (!query) return true;

        const matchesText = Boolean(
            tx.description?.toLowerCase().includes(query) ||
            tx.category?.name?.toLowerCase().includes(query) ||
            tx.store?.toLowerCase().includes(query)
        );

        return matchesText || matchesAmount(tx, query);
    });

    const { displayCurrency, convertFromPLN, rateStale, rateAsOf } = useCurrency();

    // Sumuj wszystkie transakcje po wartości w PLN, na końcu konwersja do waluty wyświetlania
    const statsPLN = filteredTransactions.reduce((acc, tx) => {
        const isNonMonetary = tx.personalAccount?.type &&
            !['BANK', 'CASH'].includes(tx.personalAccount.type);
        if (isNonMonetary || tx.currency === 'PKT') return acc;

        // rekordy PLN mają plnAmount === amount; fallback na amount dla starych rekordów PLN
        const amountPLN = Number(tx.plnAmount || tx.amount);
        if (tx.type === 'income') {
            acc.income += amountPLN;
        } else if (tx.type === 'expense') {
            acc.expenses += amountPLN;
        } else if ((tx.type as string) === 'savings_transfer' && !tx._side) {
            acc.savings += amountPLN;
        } else if ((tx.type as string) === 'investment_transfer' && !tx._side) {
            acc.investments += amountPLN;
        }
        return acc;
    }, { income: 0, expenses: 0, savings: 0, investments: 0 });

    const stats = {
        income: convertFromPLN(statsPLN.income),
        expenses: convertFromPLN(statsPLN.expenses),
        savings: convertFromPLN(statsPLN.savings),
        investments: convertFromPLN(statsPLN.investments),
    };

    const balance = stats.income - stats.expenses - stats.savings - stats.investments;


    interface SummaryTileProps {
        title: string;
        amount: number;
        icon: LucideIcon;
        color: string;
        subtitle: string;
        currency: string;
    }

    const SummaryTile = ({ title, amount, icon: Icon, color, subtitle, currency }: SummaryTileProps) => (
        <GlowCard className="h-full">
            <div className="h-[100px] flex flex-col bg-surface/50 border border-white/5 rounded-[5px] relative overflow-hidden group">
                <Icon size={72} className={`md:hidden absolute -right-2 -bottom-3 ${color} opacity-[0.07] pointer-events-none`} />
                <div className="hidden md:block absolute right-0 top-0 p-3 opacity-10">
                    <div className={`h-10 w-10 ${color.replace('text-', 'bg-')} rounded-full blur-xl`}></div>
                </div>
                <div className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-0">
                    <div className="flex items-center gap-1.5">
                        <Icon size={12} className={`${color} sm:w-[14px] sm:h-[14px]`} />
                        <p className="text-gray-400 text-[10px] sm:text-xs font-medium truncate uppercase tracking-wider">{title}</p>
                    </div>
                </div>
                <div className="px-3 sm:px-4 pt-1 pb-2.5 mt-auto relative z-10">
                    <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 tracking-tight truncate tabular-nums">
                        {formatMoney(amount)} <span className="text-[10px] sm:text-sm font-normal text-gray-400">{currency}</span>
                    </h3>
                    <p className="text-[9px] sm:text-[10px] text-gray-500 truncate font-medium">{subtitle}</p>
                </div>
            </div>
        </GlowCard>
    );


    const getMonthName = (month: number) => {
        return new Date(2000, month - 1).toLocaleString('pl-PL', { month: 'long' });
    };

    return (
        <div className="space-y-6">
            {/* Edit Modals */}
            {isEditModalOpen && (
                <Modal
                    isOpen={isEditModalOpen}
                    onClose={() => { setIsEditModalOpen(false); setEditingTransaction(null); }}
                    title="Edytuj transakcję"
                >
                    <AddExpenseModal
                        transaction={editingTransaction}
                        onClose={() => { setIsEditModalOpen(false); setEditingTransaction(null); }}
                        onDelete={() => { const t = editingTransaction; setIsEditModalOpen(false); setEditingTransaction(null); if (t) handleDelete(t.id, t.description); }}
                        onSuccess={() => {
                            fetchTransactions();
                            fetchAvailableMonths();
                            setLocalRefreshTrigger(prev => prev + 1);
                            setIsEditModalOpen(false);
                            setEditingTransaction(null);
                        }}
                    />
                </Modal>
            )}

            {isIncomeEditModalOpen && (
                <Modal
                    isOpen={isIncomeEditModalOpen}
                    onClose={() => { setIsIncomeEditModalOpen(false); setEditingTransaction(null); }}
                    title="Edytuj wpływ"
                >
                    <AddIncomeModal
                        transaction={editingTransaction}
                        onClose={() => { setIsIncomeEditModalOpen(false); setEditingTransaction(null); }}
                        onDelete={() => { const t = editingTransaction; setIsIncomeEditModalOpen(false); setEditingTransaction(null); if (t) handleDelete(t.id, t.description); }}
                        onSuccess={() => {
                            fetchTransactions();
                            fetchAvailableMonths();
                            setLocalRefreshTrigger(prev => prev + 1);
                            setIsIncomeEditModalOpen(false);
                            setEditingTransaction(null);
                        }}
                    />
                </Modal>
            )}

            {/* Mobilne menu kontekstowe (long-press) */}
            {actionSheetTx && (
                <div className="fixed inset-0 z-[120] md:hidden" onClick={() => setActionSheetTx(null)}>
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-[#15151c] border-t border-white/10 rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-9 h-1 rounded-full bg-white/15 mx-auto mb-3" />
                        <div className="flex items-center justify-between gap-2 px-1 pb-3 mb-1 border-b border-white/5">
                            <span className="text-white text-sm font-semibold truncate">{actionSheetTx.description}</span>
                            <span className="text-gray-400 text-xs shrink-0 whitespace-nowrap">{formatMoney(Number(actionSheetTx.amount))} {actionSheetTx.currency || 'PLN'}</span>
                        </div>
                        <button
                            onClick={() => { const tx = actionSheetTx; setActionSheetTx(null); handleEdit(tx); }}
                            className="w-full flex items-center gap-3 px-2 py-3.5 rounded-lg text-white text-sm hover:bg-white/5 active:bg-white/10 transition-colors"
                        >
                            <Edit2 size={19} className="text-gray-400" /> Edytuj
                        </button>
                        <button
                            onClick={() => { const tx = actionSheetTx; setActionSheetTx(null); handleDelete(tx.id, tx.description); }}
                            className="w-full flex items-center gap-3 px-2 py-3.5 rounded-lg text-rose-400 text-sm hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors"
                        >
                            <Trash2 size={19} /> Usuń
                        </button>
                        <button
                            onClick={() => setActionSheetTx(null)}
                            className="w-full flex items-center justify-center px-2 py-3 mt-2 rounded-lg bg-white/5 text-gray-400 text-sm font-medium hover:bg-white/10 transition-colors"
                        >
                            Anuluj
                        </button>
                    </div>
                </div>
            )}



            {/* Ostrzeżenie: kwoty w walucie wyświetlania po nieaktualnym kursie NBP (z cache) */}
            {displayCurrency !== 'PLN' && rateStale && (
                <div
                    className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-[5px] px-3 py-2"
                    title="API NBP było niedostępne — przeliczenie na walutę wyświetlania po ostatnim znanym kursie z cache."
                >
                    <TrendingDown size={14} className="shrink-0" />
                    <span>Kurs {displayCurrency} nieaktualny — wg kursu z {rateAsOf ?? 'ostatniego dostępnego dnia'}.</span>
                </div>
            )}

            {/* Kafelki podsumowania */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <SummaryTile
                    title="Bilans"
                    amount={balance}
                    icon={Wallet}
                    color="text-blue-400"
                    subtitle="Różnica wpływów i kosztów"
                    currency={displayCurrency}
                />
                <SummaryTile
                    title="Wydatki"
                    amount={stats.expenses}
                    icon={TrendingDown}
                    color="text-danger"
                    subtitle={`Prognozowane wydatki: ${formatMoney(convertFromPLN(plannedStats.expenses))} ${displayCurrency}`}
                    currency={displayCurrency}
                />
                <SummaryTile
                    title="Inwestycje"
                    amount={stats.investments}
                    icon={TrendingUp}
                    color="text-success"
                    subtitle="Realnie zainwestowano (mc)"
                    currency={displayCurrency}
                />
                <SummaryTile
                    title="Wpływ"
                    amount={stats.income}
                    icon={TrendingUp}
                    color="text-green-400"
                    subtitle={`Prognozowane wpływy: ${formatMoney(convertFromPLN(plannedStats.income))} ${displayCurrency}`}
                    currency={displayCurrency}
                />
            </div>

            <div className="sticky top-[72px] z-20 bg-[#0B0B0F] -mx-4 px-4 pb-4 border-b border-white/5 shadow-sm">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-surface/50 border border-white/5 rounded-[5px] p-3 shadow-xl">
                        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
                            {/* Wyszukiwarka */}
                            <div className="relative w-full md:w-48 shrink-0">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                                <Input
                                    type="text"
                                    placeholder="Opis, kwota, sklep…"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-9 h-auto py-2.5 rounded-[5px] bg-surface/50 border-white/10 text-gray-300 focus-visible:ring-primary/50 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-3">
                                {/* Zakres gospodarstwa — jako filtr */}
                                {inHousehold && (
                                    <div className="col-span-2 md:col-span-1">
                                        <div className="flex items-center gap-1 bg-black/20 border border-white/10 rounded-[5px] p-1">
                                            {([['all', 'Wszystko'], ['mine', 'Moje'], ['shared', 'Wspólne']] as const).map(([val, label]) => (
                                                <button
                                                    key={val}
                                                    onClick={() => setScopeFilter(val)}
                                                    className={`flex-1 px-3 py-2 text-xs font-bold rounded-[4px] transition-all ${scopeFilter === val
                                                        ? 'bg-white text-black'
                                                        : 'text-white/40 hover:text-white'
                                                        }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {/* Konto */}
                                <div className="col-span-2 xs:col-span-1 min-w-[160px]">
                                    <Select value={accountFilter} onValueChange={setAccountFilter}>
                                        <SelectTrigger className="h-auto py-2.5 rounded-[5px] bg-surface/50 border-white/10 text-gray-300 focus:ring-primary/50">
                                            <div className="flex items-center gap-2">
                                                <Wallet size={14} className="text-gray-500" />
                                                <SelectValue placeholder="Wszystkie konta" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Wszystkie konta</SelectItem>
                                            {personalAccounts.map(acc => (
                                                <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Okres */}
                                <div className="col-span-2 xs:col-span-1 min-w-[160px]">
                                    <Select value={timeFilter} onValueChange={setTimeFilter}>
                                        <SelectTrigger className="h-auto py-2.5 rounded-[5px] bg-surface/50 border-white/10 text-gray-300 focus:ring-primary/50 capitalize">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-gray-500" />
                                                <SelectValue placeholder="Dowolny czas" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="-">Dowolny czas</SelectItem>
                                            {(() => {
                                                const options: AvailableFilter[] = [];
                                                const now = new Date();
                                                const currentYear = now.getFullYear();
                                                const currentMonth = now.getMonth();

                                                for (let i = 3; i >= 0; i--) {
                                                    const d = new Date(currentYear, currentMonth + i, 1);
                                                    options.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
                                                }

                                                availableMonths.forEach(am => {
                                                    if (!options.find(o => o.year === am.year && o.month === am.month)) {
                                                        options.push(am);
                                                    }
                                                });

                                                return options
                                                    .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)
                                                    .map(m => (
                                                        <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                                                            {getMonthName(m.month)} {m.year}
                                                        </SelectItem>
                                                    ));
                                            })()}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Kategoria */}
                                <div className="col-span-2 xs:col-span-1 min-w-[160px]">
                                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                        <SelectTrigger className="h-auto py-2.5 rounded-[5px] bg-surface/50 border-white/10 text-gray-300 focus:ring-primary/50">
                                            <div className="flex items-center gap-2">
                                                <Filter size={14} className="text-gray-500" />
                                                <SelectValue placeholder="Wszystkie kategorie" />
                                            </div>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Wszystkie kategorie</SelectItem>
                                            {categories.map(cat => (
                                                <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="hidden lg:flex items-center">
                        <h3 className="text-xl font-bold text-white">Planowanie miesiąca</h3>
                    </div>
                </div>
            </div>

            {/* Main Content Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-4">
                    {/* Mobile List View - Removed pb-20 */}
                    <div className="md:hidden flex flex-col gap-3">
                        {loading ? (
                            <div className="text-center py-8 text-gray-500 text-sm">Ładowanie...</div>
                        ) : filteredTransactions.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 text-sm">Brak transakcji</div>
                        ) : (
                            filteredTransactions.map((tx) => {
                                const isPositive = tx.type === 'income' || tx._side === 'target' || tx._side === 'exchange_target';
                                const editable = isInlineEditable(tx);
                                return (
                                    <div
                                        key={tx.id}
                                        onPointerDown={(e) => handleRowPointerDown(e, tx)}
                                        onPointerMove={handleRowPointerMove}
                                        onPointerUp={clearLongPress}
                                        onPointerLeave={clearLongPress}
                                        onPointerCancel={clearLongPress}
                                        onClick={() => handleRowClick(tx)}
                                        className="bg-surface border border-white/5 rounded-[5px] p-4 active:bg-white/5 transition-colors cursor-pointer select-none"
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                                    <InlineStoreEditor
                                                        expenseId={tx.id}
                                                        currentName={tx.description}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                        className="font-bold text-white text-sm min-w-0 flex-1 pr-2"
                                                    />
                                                    <span className={`font-bold whitespace-nowrap text-sm shrink-0 ${isPositive ? 'text-emerald-400' : 'text-white'}`}>
                                                        <InlineAmountEditor
                                                            expenseId={tx.id}
                                                            amount={Number(tx.amount)}
                                                            editable={editable}
                                                            onUpdated={handleInlineUpdated}
                                                            currencyLabel={tx.currency || 'PLN'}
                                                        >
                                                            {tx.currency !== 'PLN' ? (
                                                                <span className="flex flex-col items-end leading-tight">
                                                                    <span>{isPositive ? '+' : '-'}{formatMoney(Number(tx.amount))} {tx.currency}</span>
                                                                    {(tx.currency !== 'PKT') && (
                                                                        <span className="text-[10px] text-gray-500 font-normal italic">
                                                                            ({isPositive ? '+' : '-'}{formatMoney(Number(tx.plnAmount || tx.amount))} PLN)
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            ) : (
                                                                `${isPositive ? '+' : '-'}${formatMoney(Number(tx.amount))} PLN`
                                                            )}
                                                        </InlineAmountEditor>
                                                    </span>
                                                </div>
                                                {tx.note && (
                                                    <span className="text-white/40 text-[10px] italic truncate mt-0.5 mb-1">
                                                        {tx.note}
                                                    </span>
                                                )}
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">{new Date(tx.transactionDate || tx.date || '').toLocaleDateString('pl-PL')}</span>
                                                    {(tx.category || tx.type === 'income') && (
                                                        <CategoryBadge
                                                            name={tx.category?.name || (tx.type === 'income' ? 'Wpływ' : '')}
                                                            color={tx.category?.color}
                                                            icon={tx.category?.icon}
                                                            small
                                                        />
                                                    )}
                                                    {(tx as any).isFromCoMember && (tx as any).authorName && (
                                                        <span className="text-[9px] font-bold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5 shrink-0">
                                                            od {(tx as any).authorName}
                                                        </span>
                                                    )}
                                                    {tx.personalAccount?.name && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                                                            <Wallet size={11} className="text-gray-600" />
                                                            <InlineAccountEditor
                                                                expenseId={tx.id}
                                                                currentAccountId={tx.personalAccount?.id}
                                                                currentAccountName={tx.personalAccount?.name || '—'}
                                                                editable={editable}
                                                                onUpdated={handleInlineUpdated}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>

                    <div className="hidden md:block bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden shadow-2xl [&>div]:overflow-hidden">
                        <Table className="table-fixed w-full">
                            <TableHeader>
                                <TableRow className="bg-surface hover:bg-surface border-white/5">
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-[100px]">Data</TableHead>
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-[28%]">Sklep</TableHead>
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-[16%]">Kategoria</TableHead>
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider w-[17%]">Konto</TableHead>
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right w-[16%]">Kwota</TableHead>
                                    <TableHead className="py-2.5 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right w-[9%]">Akcje</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-8 text-center text-gray-500">Ładowanie...</TableCell>
                                    </TableRow>
                                ) : filteredTransactions.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="py-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-gray-500">
                                                <div className="bg-white/5 p-4 rounded-full mb-3">
                                                    <Filter size={24} />
                                                </div>
                                                <p>Brak transakcji</p>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTransactions.map((tx) => {
                                        const isPositive = tx.type === 'income' || tx._side === 'target' || tx._side === 'exchange_target';
                                        const editable = isInlineEditable(tx);

                                        return (
                                            <TableRow key={tx.id} className="group hover:bg-white/5 border-white/5 transition-colors">
                                                <TableCell className="py-2.5 px-3 text-sm text-gray-400 whitespace-nowrap">
                                                    {new Date(tx.transactionDate || tx.date || '').toLocaleDateString('pl-PL')}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-sm">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <InlineStoreEditor
                                                            expenseId={tx.id}
                                                            currentName={tx.description}
                                                            editable={editable}
                                                            onUpdated={handleInlineUpdated}
                                                            className="text-white font-medium min-w-0 flex-1"
                                                        />
                                                        {(tx as any).isFromCoMember && (tx as any).authorName && (
                                                            <span className="text-[9px] font-bold text-primary/80 bg-primary/10 border border-primary/20 rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0">
                                                                od {(tx as any).authorName}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {tx.note && (
                                                        <div className="text-[10px] text-gray-500 italic truncate mt-0.5 font-medium">
                                                            {tx.note}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-sm">
                                                    {(tx.category || tx.type === 'income') && (
                                                        <CategoryBadge
                                                            name={tx.category?.name || (tx.type === 'income' ? 'Wpływ' : '')}
                                                            color={tx.category?.color}
                                                            icon={tx.category?.icon}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-sm text-gray-400">
                                                    <InlineAccountEditor
                                                        expenseId={tx.id}
                                                        currentAccountId={tx.personalAccount?.id}
                                                        currentAccountName={tx.personalAccount?.name || '—'}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                    />
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "py-2.5 px-3 text-sm font-bold text-right",
                                                    isPositive ? "text-emerald-400" : "text-white"
                                                )}>
                                                    <InlineAmountEditor
                                                        expenseId={tx.id}
                                                        amount={Number(tx.amount)}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                        currencyLabel={tx.currency || 'PLN'}
                                                    >
                                                        {tx.currency !== 'PLN' ? (
                                                            <div className="flex flex-col items-end leading-tight">
                                                                <span>{isPositive ? '+' : '-'}{formatMoney(Number(tx.amount))} {tx.currency}</span>
                                                                {(tx.currency !== 'PKT') && (
                                                                    <span className="text-[10px] text-gray-500 font-normal italic">({isPositive ? '+' : '-'}{formatMoney(Number(tx.plnAmount || tx.amount))} PLN)</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            `${isPositive ? '+' : '-'}${formatMoney(Number(tx.amount))} PLN`
                                                        )}
                                                    </InlineAmountEditor>
                                                </TableCell>
                                                <TableCell className="py-2.5 px-3 text-right">
                                                    <div className="flex justify-end gap-0.5 opacity-100 lg:group-hover:opacity-100 lg:opacity-0 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEdit(tx)}
                                                            className="h-7 w-7 text-gray-500 hover:text-white"
                                                        >
                                                            <Edit2 size={14} />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDelete(tx.id, tx.description)}
                                                            className="h-7 w-7 text-gray-500 hover:text-danger"
                                                        >
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* Sidebar z Planowaniem */}
                <div className="space-y-6 lg:mt-0">
                    <MonthlyPlanningWidget
                        refreshTrigger={refreshTrigger + localRefreshTrigger}
                        timeFilter={timeFilter}
                        hideTitle
                        onSuccess={() => { // Handle success from MonthlyPlanningWidget
                            fetchTransactions();
                            fetchAvailableMonths();
                        }}
                    />
                </div>
            </div>
            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                variant={confirmConfig.type === 'danger' ? 'danger' : 'primary'}
            />
        </div>
    );
}
