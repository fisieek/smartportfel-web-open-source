import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, LineChart, RefreshCw, Upload, Pencil, TrendingUp, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import {
    useInvestmentsList,
    useInvestmentPositions,
    useInvestmentHistory,
    useSoldInvestments,
    useInvestmentAccounts,
    useInvalidateQueries,
    useMarketDataCapabilities,
} from '../hooks/useQueries';
import { useToast } from '../context/ToastContext';
import InvestmentChart from '../components/InvestmentChart';
import BulkUpdateModal from '../components/BulkUpdateModal';
import InvestmentAccountModal from '../components/InvestmentAccountModal';
import InvestmentTransferModal from '../components/InvestmentTransferModal';
import ArchiveAccountModal from '../components/ArchiveAccountModal';
import SellInvestmentModal, { type SellableInvestment } from '../components/SellInvestmentModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import InvestmentImportModal from '../components/InvestmentImportModal';
import Modal from '../components/ui/Modal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import PortfolioKPIs from '../components/investments/PortfolioKPIs';
import AllocationDonut from '../components/investments/AllocationDonut';
import PositionsTable from '../components/investments/PositionsTable';
import SoldPositionsSection from '../components/investments/SoldPositionsSection';
import AccountsSection from '../components/investments/AccountsSection';
import AddInvestmentModal from '../components/investments/AddInvestmentModal';
import type { PositionsResponse, SoldPositionsResponse } from '@smartportfel/shared';

interface Investment {
    id: string;
    name: string;
    type: string;
    country?: string;
    currency?: string;
    purchaseDate: string;
    purchasePrice: number;
    currentValue: number;
    quantity: number;
    updatedAt: string;
    accountId: string;
    isHistorical?: boolean;
    bondDuration?: number;
    bondInterestRate?: number;
    account?: {
        name: string;
        provider: string;
    };
}

interface InvestmentAccount {
    id: string;
    name: string;
    provider: string;
    balance: number;
    accountType?: 'STANDARD' | 'IKE' | 'IKZE';
    closedAt?: string | null;
}

export default function Investments() {
    const [isAdding, setIsAdding] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isAddingAccount, setIsAddingAccount] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [filterType, setFilterType] = useState<string>('ALL');
    const [filterAccount, setFilterAccount] = useState<string>('ALL');

    const [isBulkUpdating, setIsBulkUpdating] = useState(false);
    const [isRefreshingPrices, setIsRefreshingPrices] = useState(false);
    const [investmentToDelete, setInvestmentToDelete] = useState<string | null>(null);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [editingAccountBalance, setEditingAccountBalance] = useState<{ id: string, name: string, balance: string | number, investmentCount: number, closedAt?: string | null } | null>(null);
    const [accountToArchive, setAccountToArchive] = useState<{ id: string, name: string } | null>(null);
    const [investmentToSell, setInvestmentToSell] = useState<SellableInvestment | null>(null);
    const [updatingMarketPrice, setUpdatingMarketPrice] = useState<{ id: string, name: string, currentValue: number, currency?: string } | null>(null);
    const [newMarketPrice, setNewMarketPrice] = useState<string>('');

    const { success, error: toastError } = useToast();

    // Warstwa danych: TanStack Query. Filtry (typ/konto) są częścią kluczy cache,
    // więc zmiana filtra automatycznie refetchuje odpowiednie zapytania.
    const filters = { type: filterType, accountId: filterAccount };
    const listQuery = useInvestmentsList(filters);
    const positionsQuery = useInvestmentPositions(filters);
    const historyQuery = useInvestmentHistory(filters);
    const soldQuery = useSoldInvestments();
    const accountsQuery = useInvestmentAccounts();
    const { invalidateInvestmentData } = useInvalidateQueries();

    // Instancja bez dostawcy notowań nie ma czego odświeżać ani czego szukać — chowamy
    // te funkcje, zamiast pozwolić kliknąć i pokazać puste wyniki. Do czasu odpowiedzi
    // zakładamy brak (jeden refresh UI zamiast migającego przycisku, który nie działa).
    const capabilitiesQuery = useMarketDataCapabilities();
    const hasLiveQuotes = capabilitiesQuery.data?.liveQuotes === true;

    // Inwestycje posortowane malejąco po dacie zakupu (jak wcześniej w fetchInvestments).
    const investments = useMemo<Investment[]>(
        () => [...(listQuery.data ?? [])].sort(
            (a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime()
        ),
        [listQuery.data]
    );
    // Shared InvestmentAccount nie zawiera closedAt — używamy lokalnego, bogatszego kształtu.
    const accounts = (accountsQuery.data ?? []) as unknown as InvestmentAccount[];
    const historyData = historyQuery.data ?? [];
    const positionsData: PositionsResponse | null = positionsQuery.data ?? null;
    const soldData: SoldPositionsResponse | null = soldQuery.data ?? null;
    const loading = listQuery.isLoading || accountsQuery.isLoading || positionsQuery.isLoading || historyQuery.isLoading || soldQuery.isLoading;

    const hasFetchError = listQuery.isError || accountsQuery.isError || positionsQuery.isError || historyQuery.isError || soldQuery.isError;
    useEffect(() => {
        if (hasFetchError) {
            toastError('Nie udało się pobrać danych inwestycji');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasFetchError]);

    const handleSellConfirm = async (payload: { quantity: number; salePrice: number; saleDate: string }) => {
        if (!investmentToSell) return;
        try {
            await api.post(`/investments/${investmentToSell.id}/sell`, payload);
            invalidateInvestmentData();
            success('Pozycja sprzedana');
        } catch (err: any) {
            toastError(err?.response?.data?.error || 'Nie udało się sprzedać pozycji');
            throw err;
        }
    };

    // Odświeżenie wartości rynkowej pozycji „na żywo" (dostawca notowań / NBP) — jednym kliknięciem.
    const handleRefreshPrices = async () => {
        setIsRefreshingPrices(true);
        try {
            const res = await api.post('/investments/refresh-prices');
            const { investmentsUpdated = 0, failures = [] } = res.data || {};
            invalidateInvestmentData();
            if (investmentsUpdated > 0) {
                success(`Odświeżono ceny: ${investmentsUpdated} pozycji${failures.length ? ` (pominięto ${failures.length})` : ''}`);
            } else {
                toastError(failures.length ? 'Nie udało się pobrać notowań' : 'Brak pozycji z notowaniami do odświeżenia');
            }
        } catch {
            toastError('Nie udało się odświeżyć cen');
        } finally {
            setIsRefreshingPrices(false);
        }
    };

    const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
    const [editForm, setEditForm] = useState<any>(null);

    const handleEditClick = (inv: Investment) => {
        setEditingInvestment(inv);
        setEditForm({
            name: inv.name,
            purchaseDate: new Date(inv.purchaseDate).toISOString().split('T')[0],
            purchasePrice: inv.purchasePrice.toString(),
            currentValue: inv.currentValue.toString(),
            quantity: inv.quantity.toString(),
            accountId: inv.accountId,
            type: inv.type,
            country: inv.country || 'PL',
            bondDuration: inv.bondDuration || 10,
            bondInterestRate: (inv.bondInterestRate || 6.0).toString()
        });
    };

    const handleSaveEdit = async () => {
        if (!editingInvestment) return;
        try {
            const payload = {
                ...editForm,
                purchasePrice: parseFloat(editForm.purchasePrice.toString().replace(',', '.')),
                currentValue: parseFloat(editForm.currentValue.toString().replace(',', '.')),
                quantity: parseFloat(editForm.quantity.toString().replace(',', '.')),
                bondInterestRate: parseFloat(editForm.bondInterestRate.toString().replace(',', '.'))
            };
            await api.put(`/investments/${editingInvestment.id}`, payload);
            success('Zmiany zapisane');
            setEditingInvestment(null);
            invalidateInvestmentData();
        } catch (error) {
            console.error('Błąd edycji:', error);
            toastError('Nie udało się zapisać zmian');
        }
    };

    const handleSaveAccountBalance = async () => {
        if (!editingAccountBalance) return;
        try {
            await api.put(`/investment-accounts/${editingAccountBalance.id}/balance`, {
                name: editingAccountBalance.name,
                balance: parseFloat(editingAccountBalance.balance.toString().replace(',', '.'))
            });
            success('Konto zaktualizowane');
            setEditingAccountBalance(null);
            invalidateInvestmentData();
        } catch (error) {
            console.error('Błąd aktualizacji konta:', error);
            toastError('Nie udało się zaktualizować konta');
        }
    };

    const handleDeleteAccount = async () => {
        if (!editingAccountBalance) return;
        try {
            await api.delete(`/investment-accounts/${editingAccountBalance.id}`);
            success('Konto usunięte');
            setEditingAccountBalance(null);
            invalidateInvestmentData();
        } catch (error: any) {
            console.error('Błąd usuwania konta:', error);
            const msg = error.response?.data?.error || 'Nie udało się usunąć konta';
            toastError(msg);
        }
    };

    const handleArchiveConfirm = async (closedAt: string) => {
        if (!accountToArchive) return;
        try {
            await api.patch(`/investment-accounts/${accountToArchive.id}/archive`, { closedAt });
            success('Konto zostało zamknięte');
            setAccountToArchive(null);
            invalidateInvestmentData();
        } catch (err: any) {
            toastError(err?.response?.data?.error || 'Nie udało się zamknąć konta');
            throw err;
        }
    };

    const handleUnarchiveAccount = async (id: string) => {
        try {
            await api.patch(`/investment-accounts/${id}/unarchive`);
            success('Konto zostało przywrócone');
            setEditingAccountBalance(null);
            invalidateInvestmentData();
        } catch (error) {
            console.error('Błąd przywracania konta:', error);
            toastError('Nie udało się przywrócić konta');
        }
    };

    const activeAccounts = accounts.filter(a => !a.closedAt);
    const archivedAccounts = accounts.filter(a => a.closedAt);
    const totalAssetsValue = investments.reduce((s, i) => s + Number(i.currentValue) * Number(i.quantity), 0);
    const totalCash = activeAccounts.reduce((s, a) => s + Number(a.balance), 0);
    const totalPortfolioValue = totalAssetsValue + totalCash;
    const totalCost = investments.reduce((s, i) => s + Number(i.purchasePrice) * Number(i.quantity), 0);
    const totalProfit = totalAssetsValue - totalCost;
    const totalChange = totalCost > 0 ? (totalProfit / totalCost) * 100 : 0;

    // Gdy mamy dane z /positions, używamy FX-poprawnych totali (spójne z KPI);
    // fallback do naiwnej kalkulacji klienta, dopóki dane się nie załadują.
    const fxTotals = positionsData?.totals;
    const dispEquity = fxTotals?.equityPLN ?? totalPortfolioValue;
    const dispInstruments = fxTotals?.currentValuePLN ?? totalAssetsValue;
    const dispCash = fxTotals?.cashPLN ?? totalCash;
    const dispProfit = fxTotals?.plPLN ?? totalProfit;
    const dispChange = fxTotals?.plPct ?? totalChange;

    const handleDeleteClick = (id: string) => {
        setInvestmentToDelete(id);
    };

    const confirmDelete = async () => {
        if (!investmentToDelete) return;
        try {
            await api.delete(`/investments/${investmentToDelete}`);
            invalidateInvestmentData();
            success('Inwestycja usunięta');
        } catch (error) {
            console.error('Błąd usuwania inwestycji:', error);
            toastError('Nie udało się usunąć inwestycji');
        } finally {
            setInvestmentToDelete(null);
        }
    };

    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedIds(new Set());
    };

    const toggleSelected = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(prev => prev.size === investments.length ? new Set() : new Set(investments.map(i => i.id)));
    };

    const confirmBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        const count = selectedIds.size;
        try {
            await api.post('/investments/bulk-delete', { ids: [...selectedIds] });
            invalidateInvestmentData();
            success(`Usunięto ${count} ${count === 1 ? 'transakcję' : 'transakcje'}`);
            exitSelectMode();
        } catch (error) {
            console.error('Błąd hurtowego usuwania:', error);
            toastError('Nie udało się usunąć zaznaczonych transakcji');
        } finally {
            setBulkDeleteConfirm(false);
        }
    };

    const handleUpdateValue = async (id: string, newValue: number) => {
        try {
            await api.put(`/investments/${id}`, { currentValue: newValue });
            invalidateInvestmentData();
            success('Wartość zaktualizowana');
            setUpdatingMarketPrice(null);
            setNewMarketPrice('');
        } catch (error) {
            console.error('Błąd aktualizacji:', error);
            toastError('Nie udało się zaktualizować wartości');
        }
    };

    const handleBulkUpdate = async (updates: { id: string, marketValue: number }[]) => {
        try {
            await api.post('/investments/bulk-update', { updates });
            invalidateInvestmentData();
            success('Wszystkie wartości zostały zaktualizowane');
        } catch (error) {
            console.error('Błąd masowej aktualizacji:', error);
            toastError('Błąd podczas masowej aktualizacji');
            throw error;
        }
    };

    if (loading) return <div className="text-white p-8">Ładowanie...</div>;

    return (
        <div className="space-y-6">
            {/* Nagłówek z sumą */}
            <div className="bg-white/5 border border-white/5 rounded-[5px] p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-1 w-full text-center md:text-left">
                    <p className="text-white/40 text-[10px] mb-1.5 uppercase tracking-widest font-medium">Całkowita wartość portfela (Equity)</p>
                    <h2 className="text-2xl md:text-3xl font-black text-white mb-2">
                        {dispEquity.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm md:text-base text-white/40 font-normal">PLN</span>
                    </h2>
                    <div className="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-1 text-[9px] md:text-[10px] text-white/40 uppercase tracking-wider mb-2">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60"></span>
                            Instrumenty: <span className="text-white/70 font-bold">{dispInstruments.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
                            Gotówka: <span className="text-white/70 font-bold">{dispCash.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</span>
                        </div>
                    </div>
                    <div className="flex justify-center md:justify-start">
                        <p className={`text-xs flex items-center gap-1.5 px-2.5 py-1 rounded-full ${dispChange >= 0 ? 'text-green-400 bg-green-400/10' : 'text-rose-400 bg-rose-400/10'}`}>
                            <TrendingUp size={12} className={dispChange < 0 ? 'rotate-180' : ''} />
                            <span className="font-bold">{dispProfit.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</span>
                            <span className="text-[10px] opacity-70">({dispChange >= 0 ? '+' : ''}{dispChange.toFixed(2)}%)</span>
                        </p>
                    </div>
                    {positionsData?.totals?.staleRate && (
                        <div className="flex justify-center md:justify-start mt-2">
                            <p
                                className="text-[10px] flex items-center gap-1.5 px-2.5 py-1 rounded-full text-amber-400 bg-amber-400/10"
                                title="API NBP było niedostępne — wartości przeliczone po ostatnim znanym kursie z cache."
                            >
                                <AlertTriangle size={11} />
                                Kurs NBP niedostępny — wartości wg kursu z {positionsData.totals.rateAsOf ?? 'ostatniego dostępnego dnia'}
                            </p>
                        </div>
                    )}
                </div>
                <div className="hidden md:flex h-12 w-12 bg-white/5 rounded-[5px] items-center justify-center shrink-0">
                    <LineChart size={24} className="text-white/60" />
                </div>
            </div>

            {/* KPI portfela (FX-poprawne) */}
            {positionsData?.positions?.length ? (
                <PortfolioKPIs totals={positionsData.totals} positions={positionsData.positions} />
            ) : null}

            {/* Alokacja + wykres historyczny */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {positionsData?.positions?.length ? (
                    <AllocationDonut data={positionsData.allocationByType} equityPLN={positionsData.totals.equityPLN} cashPLN={positionsData.totals.cashPLN} />
                ) : null}
                <div className={positionsData?.positions?.length ? '' : 'lg:col-span-2'}>
                    <InvestmentChart data={historyData} />
                </div>
            </div>

            {/* Konta Inwestycyjne */}
            <AccountsSection
                activeAccounts={activeAccounts}
                archivedAccounts={archivedAccounts}
                investments={investments}
                onTransfer={() => setIsTransferring(true)}
                onAddAccount={() => setIsAddingAccount(true)}
                onArchive={(account) => setAccountToArchive(account)}
                onEditBalance={(payload) => setEditingAccountBalance(payload)}
                onUnarchive={handleUnarchiveAccount}
            />

            {/* Filtry i Akcje */}
            <div className="flex flex-col gap-4 bg-surface/50 p-4 rounded-[5px] border border-white/5">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4">
                    <div className="flex gap-2">
                        <select
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            className="h-10 flex-1 sm:flex-none bg-surface/50 border border-white/10 rounded-[5px] px-3 text-xs font-bold text-gray-300 focus:outline-none focus:border-white/20 transition-all cursor-pointer"
                        >
                            <option value="ALL">Wszystkie aktywa</option>
                            <option value="STOCK">Akcje</option>
                            <option value="ETF">ETFy</option>
                            <option value="ETC">Surowce (ETC)</option>
                            <option value="BOND">Obligacje</option>
                            <option value="GOLD">Złoto</option>
                            <option value="CRYPTO">Krypto</option>
                        </select>

                        <select
                            value={filterAccount}
                            onChange={(e) => setFilterAccount(e.target.value)}
                            className="h-10 flex-1 sm:flex-none bg-surface/50 border border-white/10 rounded-[5px] px-3 text-xs font-bold text-gray-300 focus:outline-none focus:border-white/20 transition-all cursor-pointer"
                        >
                            <option value="ALL">Wszystkie konta</option>
                            {activeAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => setIsAdding(true)}
                        className="h-10 sm:hidden bg-white text-black font-black px-4 rounded-[5px] flex items-center justify-center gap-2 transition-all text-xs active:scale-95 shadow-xl shadow-black/20"
                    >
                        <Plus size={16} strokeWidth={2.5} /> Dodaj inwestycję
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                    {hasLiveQuotes && (
                        <button
                            onClick={handleRefreshPrices}
                            disabled={isRefreshingPrices}
                            className="h-10 flex-1 sm:flex-none bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-4 rounded-[5px] flex items-center justify-center gap-2 transition-all text-xs active:scale-95 disabled:opacity-50"
                        >
                            <RefreshCw size={14} className={isRefreshingPrices ? 'animate-spin' : ''} /> {isRefreshingPrices ? 'Odświeżanie…' : 'Odśwież ceny'}
                        </button>
                    )}
                    <button
                        onClick={() => setIsBulkUpdating(true)}
                        className="h-10 flex-1 sm:flex-none bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-4 rounded-[5px] flex items-center justify-center gap-2 transition-all text-xs active:scale-95"
                    >
                        <Pencil size={14} /> Wpisz ceny
                    </button>
                    <button
                        onClick={() => setIsImporting(true)}
                        className="h-10 flex-1 sm:flex-none bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold px-4 rounded-[5px] flex items-center justify-center gap-2 transition-all text-xs active:scale-95"
                    >
                        <Upload size={14} /> Importuj z pliku
                    </button>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="h-10 hidden sm:flex bg-white text-black font-black px-6 rounded-[5px] items-center gap-2 transition-all text-xs active:scale-95 shadow-xl shadow-black/20"
                    >
                        <Plus size={16} strokeWidth={2.5} /> Dodaj inwestycję
                    </button>
                </div>
            </div>

            {/* Formularz dodawania */}
            <AddInvestmentModal
                isOpen={isAdding}
                onClose={() => setIsAdding(false)}
                accounts={activeAccounts}
                onSuccess={invalidateInvestmentData}
            />

            {/* Pozycje / Transakcje */}
            <Tabs defaultValue="positions" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="positions">Pozycje</TabsTrigger>
                    <TabsTrigger value="transactions">Transakcje</TabsTrigger>
                </TabsList>

                <TabsContent value="positions">
                    <PositionsTable
                        positions={positionsData?.positions || []}
                        investments={investments}
                        onEdit={(inv) => handleEditClick(inv as Investment)}
                        onUpdatePrice={(inv) => {
                            const cv = Number(inv.currentValue);
                            setUpdatingMarketPrice({ id: inv.id, name: inv.name, currentValue: cv, currency: inv.currency });
                            setNewMarketPrice(String(cv));
                        }}
                        onSell={(inv) => setInvestmentToSell({
                            id: inv.id,
                            name: inv.name,
                            quantity: Number(inv.quantity),
                            purchasePrice: Number(inv.purchasePrice),
                            currency: inv.currency,
                            account: inv.account ?? null,
                            isHistorical: inv.isHistorical,
                        })}
                        onDelete={handleDeleteClick}
                    />

                    <SoldPositionsSection soldData={soldData} />
                </TabsContent>

                <TabsContent value="transactions">
            {/* Lista inwestycji - Karta na mobile, Tabela na desktop */}
            < div className="space-y-4" >
                {investments.length > 0 && (
                    <div className="flex items-center justify-between gap-2 px-1 min-h-[30px]">
                        {selectMode ? (
                            <>
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/50">Zaznaczono {selectedIds.size}</span>
                                <div className="flex items-center gap-2">
                                    <button onClick={exitSelectMode} className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40 hover:text-white px-2 py-1 transition-colors">Anuluj</button>
                                    <button onClick={() => setBulkDeleteConfirm(true)} disabled={selectedIds.size === 0} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-[4px] px-2.5 py-1 hover:bg-rose-500/15 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                        <Trash2 size={12} /> Usuń zaznaczone
                                    </button>
                                </div>
                            </>
                        ) : (
                            <button onClick={() => setSelectMode(true)} className="ml-auto text-[10px] font-black uppercase tracking-[0.15em] text-white/25 hover:text-white/60 transition-colors px-2 py-1">Zaznacz</button>
                        )}
                    </div>
                )}
                {
                    investments.length === 0 ? (
                        <div className="bg-surface/50 border border-white/5 rounded-[5px] p-12 text-center">
                            <div className="bg-white/5 p-4 rounded-full w-fit mx-auto mb-4">
                                <LineChart size={32} className="text-gray-500" />
                            </div>
                            <p className="text-gray-500 mb-2">Brak inwestycji</p>
                            <p className="text-gray-600 text-sm">Dodaj swoje inwestycje, aby śledzić ich wartość</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop Table View */}
                            <div className="hidden lg:block bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="border-b border-white/5 bg-surface text-[10px] text-gray-400 uppercase tracking-wider">
                                                {selectMode && (
                                                    <th className="py-2.5 px-4 w-10">
                                                        <input type="checkbox" className="accent-rose-500 w-4 h-4 cursor-pointer align-middle" checked={investments.length > 0 && selectedIds.size === investments.length} onChange={toggleSelectAll} />
                                                    </th>
                                                )}
                                                <th className="py-2.5 px-4 text-left">Nazwa</th>
                                                <th className="py-2.5 px-4 text-left">Data zakupu</th>
                                                <th className="py-2.5 px-4 text-right">Ilość</th>
                                                <th className="py-2.5 px-4 text-right">Cena zakupu</th>
                                                <th className="py-2.5 px-4 text-right">Wartość zakupu</th>
                                                <th className="py-2.5 px-4 text-right">Wartość aktualna</th>
                                                <th className="py-2.5 px-4 text-right">Zmiana</th>
                                                <th className="py-2.5 px-4 text-right">Akcje</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {investments.map(inv => {
                                                const purchasePrice = Number(inv.purchasePrice);
                                                const currentValue = Number(inv.currentValue);
                                                const quantity = Number(inv.quantity);
                                                const purchaseValue = purchasePrice * quantity;
                                                const marketValue = currentValue * quantity;
                                                const ch = purchasePrice > 0 ? ((currentValue - purchasePrice) / purchasePrice) * 100 : 0;

                                                return (
                                                    <tr key={inv.id} className={`hover:bg-white/5 group border-b border-white/5 last:border-0 ${selectMode && selectedIds.has(inv.id) ? 'bg-rose-500/5' : ''}`}>
                                                        {selectMode && (
                                                            <td className="py-2 px-4 w-10">
                                                                <input type="checkbox" className="accent-rose-500 w-4 h-4 cursor-pointer align-middle" checked={selectedIds.has(inv.id)} onChange={() => toggleSelected(inv.id)} />
                                                            </td>
                                                        )}
                                                        <td className="py-2 px-4">
                                                            <div className="flex flex-col">
                                                                <span className="text-white font-bold text-xs">{inv.name}</span>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className="text-[9px] text-gray-500 bg-white/5 px-1 pb-0.5 rounded uppercase font-bold">{inv.type}</span>
                                                                    {inv.isHistorical && <span className="text-[9px] text-amber-500/80 bg-amber-500/10 px-1 pb-0.5 rounded uppercase font-bold">Historyczne</span>}
                                                                    {inv.account && <span className="text-[9px] text-white/50">{inv.account.name}</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-4 text-gray-400 whitespace-nowrap text-xs">{new Date(inv.purchaseDate).toLocaleDateString('pl-PL')}</td>
                                                        <td className="py-2 px-4 text-gray-400 text-right text-xs">{quantity}</td>
                                                        <td className="py-2 px-4 text-gray-400 text-right text-xs">{purchasePrice.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inv.currency || 'PLN'}</td>
                                                        <td className="py-2 px-4 text-gray-400 text-right font-bold text-xs">{purchaseValue.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inv.currency || 'PLN'}</td>
                                                        <td className="py-2 px-4 text-white font-black text-right text-sm">{marketValue.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inv.currency || 'PLN'}</td>
                                                        <td className={`py-2 px-4 text-right font-black text-xs ${ch >= 0 ? 'text-white/70' : 'text-rose-400'}`}>{ch >= 0 ? '+' : ''}{ch.toFixed(2)}%</td>
                                                        <td className="py-2 px-4 text-right">
                                                            <div className="flex gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    onClick={() => handleEditClick(inv)}
                                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                                    title="Edytuj"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setUpdatingMarketPrice({ id: inv.id, name: inv.name, currentValue: currentValue, currency: inv.currency });
                                                                        setNewMarketPrice(String(currentValue));
                                                                    }}
                                                                    className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                                                                    title="Aktualizuj wartość"
                                                                >
                                                                    <RefreshCw size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteClick(inv.id)}
                                                                    className="p-1.5 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                                    title="Usuń"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Mobile Cards View */}
                            <div className="lg:hidden space-y-3">
                                {investments.map(inv => {
                                    const currentValue = Number(inv.currentValue);
                                    const quantity = Number(inv.quantity);
                                    const marketValue = currentValue * quantity;
                                    const purchasePrice = Number(inv.purchasePrice);
                                    const ch = purchasePrice > 0 ? ((currentValue - purchasePrice) / purchasePrice) * 100 : 0;

                                    return (
                                        <div key={inv.id} className="bg-surface/50 border border-white/5 rounded-[5px] p-3 space-y-2">
                                            {selectMode && (
                                                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/40 cursor-pointer">
                                                    <input type="checkbox" className="accent-rose-500 w-4 h-4" checked={selectedIds.has(inv.id)} onChange={() => toggleSelected(inv.id)} />
                                                    Zaznacz
                                                </label>
                                            )}
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="text-white font-bold text-sm">{inv.name}</h4>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[9px] text-gray-500 bg-white/5 px-1 pb-0.5 rounded uppercase font-bold">{inv.type}</span>
                                                        {inv.isHistorical && <span className="text-[9px] text-amber-500/80 bg-amber-500/10 px-1 pb-0.5 rounded uppercase font-bold">Historyczne</span>}
                                                        {inv.account && <span className="text-[9px] text-white/50">{inv.account.name}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex gap-0.5">
                                                    <button
                                                        onClick={() => handleEditClick(inv)}
                                                        className="p-1.5 text-gray-400 hover:text-white bg-white/5 rounded-lg"
                                                    >
                                                        <Pencil size={12} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(inv.id)}
                                                        className="p-1.5 text-gray-400 hover:text-rose-400 bg-white/5 rounded-lg"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                                                <div>
                                                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Wartość akt.</p>
                                                    <p className="text-white font-black text-sm">{marketValue.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inv.currency || 'PLN'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5">Zmiana</p>
                                                    <p className={`font-black text-sm ${ch >= 0 ? 'text-white/70' : 'text-rose-400'}`}>
                                                        {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                                                    </p>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => {
                                                    setUpdatingMarketPrice({ id: inv.id, name: inv.name, currentValue: currentValue, currency: inv.currency });
                                                    setNewMarketPrice(String(currentValue));
                                                }}
                                                className="w-full mt-1 py-2 bg-white/5 hover:bg-white/10 text-gray-400 text-[10px] font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-white/5 active:scale-[0.98]"
                                            >
                                                <RefreshCw size={12} /> Aktualizuj cenę
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )
                }
            </div >
                </TabsContent>
            </Tabs>

            {
                investments.length > 0 && (
                    <p className="text-gray-600 text-sm text-right">
                        Ostatnia aktualizacja: {new Date().toLocaleDateString('pl-PL')} {new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                )
            }
            < BulkUpdateModal
                isOpen={isBulkUpdating}
                onClose={() => setIsBulkUpdating(false)
                }
                investments={investments}
                onConfirm={handleBulkUpdate}
            />

            <InvestmentImportModal
                isOpen={isImporting}
                onClose={() => setIsImporting(false)}
                onSuccess={invalidateInvestmentData}
                accounts={activeAccounts}
                investments={investments}
            />

            {/* EDIT MODAL */}
            <Modal
                isOpen={!!editingInvestment}
                onClose={() => setEditingInvestment(null)}
                title="Edytuj inwestycję"
            >
                {editForm && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Nazwa</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Konto inwestycyjne</label>
                                <select
                                    value={editForm.accountId}
                                    onChange={e => setEditForm({ ...editForm, accountId: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                >
                                    {activeAccounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name} ({acc.provider})</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Data zakupu</label>
                                <input
                                    type="date"
                                    value={editForm.purchaseDate}
                                    onChange={e => setEditForm({ ...editForm, purchaseDate: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Typ</label>
                                <select
                                    value={editForm.type}
                                    onChange={e => {
                                        const nextType = e.target.value;
                                        const updates: any = { ...editForm, type: nextType };
                                        if (nextType === 'BOND') updates.purchasePrice = 100;
                                        setEditForm(updates);
                                    }}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                >
                                    <option value="STOCK">Akcje</option>
                                    <option value="ETF">ETF</option>
                                    <option value="BOND">Obligacje</option>
                                    <option value="GOLD">Złoto</option>
                                    <option value="CRYPTO">Krypto</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Ilość</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={editForm.quantity}
                                    onChange={e => setEditForm({ ...editForm, quantity: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Cena zakupu</label>
                                <input
                                    type="number"
                                    step="any"
                                    disabled={editForm.type === 'BOND'}
                                    value={editForm.purchasePrice}
                                    onChange={e => setEditForm({ ...editForm, purchasePrice: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Aktualna cena rynkowa</label>
                            <input
                                type="number"
                                step="any"
                                value={editForm.currentValue}
                                onChange={e => setEditForm({ ...editForm, currentValue: e.target.value })}
                                className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 transition-all font-bold text-lg"
                            />
                        </div>

                        <div className="flex gap-3 pt-6">
                            <button
                                onClick={() => setEditingInvestment(null)}
                                className="flex-1 py-4 px-6 rounded-[5px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="flex-[2] py-4 px-6 rounded-[5px] font-bold text-white shadow-lg active:scale-[0.98] transition-all"
                                style={{ backgroundColor: '#1eb3ab' }}
                            >
                                Zapisz zmiany
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <InvestmentAccountModal
                isOpen={isAddingAccount}
                onClose={() => setIsAddingAccount(false)}
                onSuccess={invalidateInvestmentData}
            />

            <InvestmentTransferModal
                isOpen={isTransferring}
                onClose={() => setIsTransferring(false)}
                onSuccess={invalidateInvestmentData}
            />

            <ArchiveAccountModal
                isOpen={!!accountToArchive}
                onClose={() => setAccountToArchive(null)}
                accountName={accountToArchive?.name || ''}
                onConfirm={handleArchiveConfirm}
            />

            <SellInvestmentModal
                isOpen={!!investmentToSell}
                onClose={() => setInvestmentToSell(null)}
                investment={investmentToSell}
                onConfirm={handleSellConfirm}
            />

            <ConfirmModal
                isOpen={!!investmentToDelete}
                onClose={() => setInvestmentToDelete(null)}
                onConfirm={confirmDelete}
                title="Usuń inwestycję"
                message="Czy na pewno chcesz usunąć tę inwestycję? Operacji nie można cofnąć."
                confirmLabel="Usuń"
                variant="danger"
            />

            <ConfirmModal
                isOpen={bulkDeleteConfirm}
                onClose={() => setBulkDeleteConfirm(false)}
                onConfirm={confirmBulkDelete}
                title={`Usunąć ${selectedIds.size} ${selectedIds.size === 1 ? 'transakcję' : 'transakcje'}?`}
                message="Środki wrócą na powiązane konta. Operacji nie można cofnąć."
                confirmLabel="Usuń"
                variant="danger"
            />

            <Modal
                isOpen={!!editingAccountBalance}
                onClose={() => setEditingAccountBalance(null)}
                title="Edytuj konto inwestycyjne"
                subtitle={editingAccountBalance?.name}
            >
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">
                            Nazwa konta
                        </label>
                        <input
                            type="text"
                            value={editingAccountBalance?.name ?? ''}
                            onChange={e => setEditingAccountBalance(prev => prev ? { ...prev, name: e.target.value } : null)}
                            className="w-full bg-surface border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 transition-all font-medium"
                            placeholder="Nazwa konta"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">
                            Saldo (PLN)
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={editingAccountBalance?.balance ?? 0}
                            onChange={e => setEditingAccountBalance(prev => prev ? { ...prev, balance: e.target.value } : null)}
                            className="w-full bg-surface border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 transition-all font-bold text-lg"
                        />
                    </div>

                    {/* Przycisk usuwania - aktywny tylko gdy brak inwestycji */}
                    {editingAccountBalance && editingAccountBalance.investmentCount === 0 && (
                        <button
                            onClick={handleDeleteAccount}
                            className="w-full py-3 px-4 rounded-[5px] font-bold text-rose-400 bg-rose-400/10 border border-rose-400/20 hover:bg-rose-400/20 transition-all flex items-center justify-center gap-2 text-sm"
                        >
                            <Trash2 size={16} />
                            Usuń konto
                        </button>
                    )}

                    {editingAccountBalance && editingAccountBalance.investmentCount > 0 && (
                        <p className="text-xs text-gray-500 text-center py-2 bg-white/5 rounded-[5px]">
                            Nie można usunąć konta - przypisano {editingAccountBalance.investmentCount} {editingAccountBalance.investmentCount === 1 ? 'inwestycję' : 'inwestycji'}
                        </p>
                    )}

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => setEditingAccountBalance(null)}
                            className="flex-1 py-4 px-6 rounded-[5px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={handleSaveAccountBalance}
                            className="flex-[2] py-4 px-6 rounded-[5px] font-black text-black bg-white shadow-xl active:scale-[0.98] transition-all"
                        >
                            Zapisz zmiany
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL AKTUALIZACJI CENY */}
            <Modal
                isOpen={!!updatingMarketPrice}
                onClose={() => setUpdatingMarketPrice(null)}
                title="Aktualizuj cenę rynkową"
                subtitle={updatingMarketPrice?.name}
            >
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">
                            Nowa cena za jednostkę ({updatingMarketPrice?.currency || 'PLN'})
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">{updatingMarketPrice?.currency || 'PLN'}</span>
                            <input
                                type="number"
                                step="any"
                                autoFocus
                                value={newMarketPrice}
                                onChange={e => setNewMarketPrice(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && updatingMarketPrice && newMarketPrice) {
                                        handleUpdateValue(updatingMarketPrice.id, parseFloat(newMarketPrice.replace(',', '.')));
                                    }
                                }}
                                className="w-full bg-surface border border-white/10 rounded-[5px] pl-14 pr-4 py-4 text-white focus:outline-none focus:border-white/20 transition-all font-black text-2xl"
                                placeholder="0.00"
                            />
                        </div>
                        <p className="text-[10px] text-gray-500 mt-2 ml-1 uppercase tracking-widest">
                            Poprzednia cena: {updatingMarketPrice?.currentValue.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {updatingMarketPrice?.currency || 'PLN'}
                        </p>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={() => setUpdatingMarketPrice(null)}
                            className="flex-1 py-4 px-6 rounded-[5px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={() => {
                                if (updatingMarketPrice && newMarketPrice) {
                                    handleUpdateValue(updatingMarketPrice.id, parseFloat(newMarketPrice.replace(',', '.')));
                                }
                            }}
                            className="flex-[2] py-4 px-6 rounded-[5px] font-black text-black shadow-xl active:scale-[0.98] transition-all bg-white"
                        >
                            Aktualizuj cenę
                        </button>
                    </div>
                </div>
            </Modal>
        </div >
    );
}
