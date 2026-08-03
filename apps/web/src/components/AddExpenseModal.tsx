import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, TrendingUp, FileText, ArrowRightLeft, ChevronUp, ChevronDown } from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

import { useExpenseForm, type TransactionType } from '../hooks/useExpenseForm';

interface AddExpenseModalProps {
    onSuccess: () => void;
    onClose: () => void;
    transaction?: any | null;
    onDelete?: () => void;
    /** Data początkowa dla nowej pozycji (YYYY-MM-DD). Przy edycji ignorowana. */
    defaultDate?: string;
}

export default function AddExpenseModal({ onSuccess, onClose, transaction, onDelete, defaultDate }: AddExpenseModalProps) {
    const {
        isEditing,
        transactionType, setTransactionType,
        amount, setAmount,
        date, setDate,
        personalAccountId, setPersonalAccountId,
        fromSavingsAccountId, setFromSavingsAccountId,
        fromInvestmentAccountId, setFromInvestmentAccountId,
        toPersonalAccountId, setToPersonalAccountId,
        toInvestmentAccountId, setToInvestmentAccountId,
        setCategoryId,
        store, setStore,
        setStoreId,
        note, setNote,
        savingsAccountId, setSavingsAccountId,
        savingsGoalId, setSavingsGoalId,
        isRecurring, setIsRecurring,
        recurrenceInterval, setRecurrenceInterval,
        recurrenceEndDate, setRecurrenceEndDate,
        currency, setCurrency,
        exchangeRate,
        matchingPlanItem,
        showLinkConfirm, setShowLinkConfirm,
        errors,
        loading,
        handleSubmit,
        handleLinkToPlan,
        personalAccounts,
        savingsAccounts,
        investmentAccounts,
        categories,
        goals,
        allUserStores
    } = useExpenseForm({ transaction, onSuccess, onClose, defaultDate });

    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [showStoreSuggestions, setShowStoreSuggestions] = useState(false);
    const storeInputRef = useRef<HTMLDivElement>(null);
    const [suggestionsPosition, setSuggestionsPosition] = useState<{ top: number, left: number, width: number } | null>(null);

    // Track input position for portaled suggestions
    useEffect(() => {
        if (showStoreSuggestions && storeInputRef.current) {
            const updatePosition = () => {
                if (storeInputRef.current) {
                    const rect = storeInputRef.current.getBoundingClientRect();
                    setSuggestionsPosition({
                        top: rect.bottom + window.scrollY,
                        left: rect.left + window.scrollX,
                        width: rect.width
                    });
                }
            };

            updatePosition();
            window.addEventListener('scroll', updatePosition, true);
            window.addEventListener('resize', updatePosition);
            return () => {
                window.removeEventListener('scroll', updatePosition, true);
                window.removeEventListener('resize', updatePosition);
            };
        }
    }, [showStoreSuggestions]);

    const handleShopSelect = (selectedShop: string, groupName?: string, customStoreId?: string, customCategoryId?: number) => {
        setStore(selectedShop);
        setStoreId(customStoreId || '');
        setShowStoreSuggestions(false);

        if (customCategoryId) {
            setCategoryId(customCategoryId.toString());
        } else if (groupName) {
            const cat = categories.find(c => c.name === groupName);
            if (cat) {
                setCategoryId(cat.id.toString());
            }
        }
    };

    const tabs = [
        { id: 'expense' as TransactionType, label: 'Wydatek', icon: TrendingUp },
        { id: 'internal_transfer' as TransactionType, label: 'Przelew wewnętrzny', icon: ArrowRightLeft },
    ];

    return (
        <form onSubmit={handleSubmit} className="space-y-4 h-full flex flex-col">
            {/* Minimalist Tabs in Header area */}
            <div className="flex justify-center -mt-2">
                <Tabs
                    value={transactionType}
                    onValueChange={(v: string) => setTransactionType(v as TransactionType)}
                    className="w-auto"
                >
                    <TabsList className="bg-white/5 p-1 h-9 rounded-[5px]">
                        {tabs.map(tab => (
                            <TabsTrigger
                                key={tab.id}
                                value={tab.id}
                                className="px-4 py-1.5 text-xs font-black transition-all data-[state=active]:bg-white/15 data-[state=active]:text-white rounded-[5px] uppercase tracking-wider"
                            >
                                <tab.icon size={13} className="mr-2 sm:inline hidden" />
                                {tab.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>

            <div className="space-y-1">
                <div className="bg-white/5 rounded-[5px] py-1 px-3 border border-white/5 focus-within:border-white/10 flex items-center justify-between transition-colors">
                    <div className="flex-1 min-w-0">
                        <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            autoFocus
                            className="h-8 bg-transparent border-none text-xl font-bold text-white p-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none shadow-none placeholder:text-white/5"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => { setAmount(e.target.value); }}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {(() => {
                            const sAcc = personalAccountId ? personalAccounts.find(a => a.id === personalAccountId) : null;
                            const availableCurrencies = (sAcc?.isMultiCurrency && sAcc.balances)
                                ? sAcc.balances.map(b => b.currency)
                                : [currency];

                            return (
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger className="w-auto h-7 px-2 border-none bg-white/10 hover:bg-white/20 text-[10px] font-black rounded-[5px] transition-all text-white/70">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[101]">
                                        {availableCurrencies.filter(curr => !!curr).map(curr => (
                                            <SelectItem key={curr} value={curr || 'EMPTY'} className="text-[10px] font-black uppercase tracking-wider">{curr}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            );
                        })()}
                    </div>
                </div>
                {errors.amount && <p className="text-[9px] text-danger font-bold uppercase tracking-wider ml-1 mt-0.5">{errors.amount}</p>}

                <div className="flex items-center justify-between px-1">
                    {(() => {
                        let balanceAmount: number | null = null;

                        if (personalAccountId && personalAccountId !== 'HISTORICAL') {
                            const sAcc = personalAccounts.find(a => a.id === personalAccountId);
                            if (!sAcc) return null;
                            if (sAcc.isMultiCurrency && sAcc.balances) {
                                const bEntry = sAcc.balances.find(b => b.currency === currency);
                                balanceAmount = bEntry ? Number(bEntry.balance) : 0;
                            } else if ((sAcc.currency || 'PLN') === currency) {
                                balanceAmount = Number(sAcc.balance || 0);
                            }
                        } else if (fromSavingsAccountId) {
                            const sAcc = savingsAccounts.find(a => a.id === fromSavingsAccountId);
                            if (sAcc) balanceAmount = Number(sAcc.balance || 0);
                        } else if (fromInvestmentAccountId) {
                            const iAcc = investmentAccounts.find(a => a.id === fromInvestmentAccountId);
                            if (iAcc) balanceAmount = Number(iAcc.balance || 0);
                        }

                        if (balanceAmount === null) return null;

                        return (
                            <div className="text-[9px] font-bold text-emerald-400/50 uppercase tracking-widest">
                                Dostępne: {balanceAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {currency}
                            </div>
                        );
                    })()}
                    {currency !== 'PLN' && !['PKT'].includes(currency) && (
                        <div className="text-[9px] font-bold text-blue-400/50 uppercase tracking-widest">
                            ≈ {(parseFloat(amount || '0') * exchangeRate).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Konto</label>
                    <Select
                        value={
                            (personalAccountId && personalAccountId !== '' ? personalAccountId : undefined) ||
                            (fromSavingsAccountId && fromSavingsAccountId !== '' ? fromSavingsAccountId : undefined) ||
                            (fromInvestmentAccountId && fromInvestmentAccountId !== '' ? fromInvestmentAccountId : undefined) ||
                            (isEditing && !transaction?.personalAccountId && !transaction?.fromSavingsAccountId && !transaction?.investmentAccountId ? 'HISTORICAL' : undefined)
                        }
                        onValueChange={(val: string) => {
                            if (val === 'HISTORICAL') { setPersonalAccountId('HISTORICAL'); setFromSavingsAccountId(''); setFromInvestmentAccountId(''); }
                            else if (personalAccounts.some(acc => acc.id === val)) { setPersonalAccountId(val); setFromSavingsAccountId(''); setFromInvestmentAccountId(''); }
                            else if (savingsAccounts.some(acc => acc.id === val)) { setFromSavingsAccountId(val); setPersonalAccountId(''); setFromInvestmentAccountId(''); }
                            else if (investmentAccounts.some(acc => acc.id === val)) { setFromInvestmentAccountId(val); setPersonalAccountId(''); setFromSavingsAccountId(''); }
                        }}
                    >
                        <SelectTrigger className={cn(
                            "h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]",
                            errors.personalAccountId && "border-danger/50"
                        )}>
                            <SelectValue placeholder="Wybierz" />
                        </SelectTrigger>
                        <SelectContent className="z-[101]">
                            <SelectItem value="HISTORICAL" className="text-amber-500 font-bold text-xs uppercase">Historyczny</SelectItem>
                            {personalAccounts.filter(acc => acc.type === 'BANK' || acc.type === 'CASH' || !acc.type).length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Konta</SelectLabel>
                                    {personalAccounts.filter(acc => (acc.type === 'BANK' || acc.type === 'CASH' || !acc.type) && !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {savingsAccounts.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Oszczędnościowe</SelectLabel>
                                    {savingsAccounts.filter(acc => !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {personalAccounts.filter(acc => acc.type && ['LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'].includes(acc.type)).length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Lojalnościowe</SelectLabel>
                                    {personalAccounts.filter(acc => acc.type && ['LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'].includes(acc.type) && !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {investmentAccounts.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Inwestycyjne</SelectLabel>
                                    {investmentAccounts.filter(acc => !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                        </SelectContent>
                    </Select>
                    {errors.personalAccountId && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.personalAccountId}</p>}
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Data</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                        <Input
                            type="date"
                            required
                            className={cn(
                                "h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] [color-scheme:dark] cursor-pointer",
                                errors.date && "border-danger/50"
                            )}
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            onClick={(e) => (e.target as any).showPicker?.()}
                        />
                    </div>
                </div>

                {transactionType === 'expense' && (
                    <>
                        <div className="space-y-1.5 flex flex-col pt-0.5">
                            <div className="flex justify-between items-center h-[13.5px] ml-1">
                                <label className="text-[10.5px] font-black text-white/50 uppercase tracking-widest leading-none">Sklep</label>
                                {matchingPlanItem && <span className="text-[8px] font-black text-green-500 uppercase tracking-tighter animate-pulse">Plan!</span>}
                            </div>
                            <div className="relative" ref={storeInputRef}>
                                <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                                <Input
                                    type="text"
                                    className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                                    placeholder="Wpisz..."
                                    value={store}
                                    onChange={(e) => { setStore(e.target.value); setStoreId(''); }}
                                    onFocus={() => setShowStoreSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowStoreSuggestions(false), 200)}
                                />
                                {showStoreSuggestions && suggestionsPosition && createPortal(
                                    <div
                                        className="fixed z-[999] bg-[#141414] border border-white/10 rounded-[5px] shadow-[0_20px_50px_rgba(0,0,0,0.8)] max-h-[420px] overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-300 backdrop-blur-xl"
                                        style={{
                                            top: `${suggestionsPosition.top + 4}px`,
                                            left: `${suggestionsPosition.left}px`,
                                            width: `${suggestionsPosition.width}px`
                                        }}
                                    >
                                        {(() => {
                                            const filteredStores = allUserStores.filter(s =>
                                                s.name.toLowerCase().includes(store.toLowerCase()) &&
                                                !['przewalutowanie'].includes(s.name.toLowerCase())
                                            );

                                            const grouped: Record<string, typeof allUserStores> = {};
                                            filteredStores.forEach(s => {
                                                const catName = s.category?.name || 'Inne';
                                                if (!grouped[catName]) grouped[catName] = [];
                                                grouped[catName].push(s);
                                            });

                                            if (Object.keys(grouped).length === 0) {
                                                return <div className="px-4 py-8 text-[10px] font-black text-white/10 uppercase tracking-[0.2em] text-center">Brak pasujących sklepów</div>;
                                            }

                                            return Object.entries(grouped).map(([categoryName, shopItems]) => (
                                                <div key={categoryName} className="border-b border-white/5 last:border-0">
                                                    <div className="px-4 py-1.5 bg-white/5 flex items-center gap-2 sticky top-0 z-10 backdrop-blur-md">
                                                        <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">{categoryName}</span>
                                                    </div>
                                                    {shopItems.map(s => (
                                                        <button
                                                            key={s.id}
                                                            type="button"
                                                            className="w-full text-left px-5 py-3 hover:bg-white/10 text-[11px] font-bold text-white/70 transition-all flex items-center justify-between group"
                                                            onClick={() => handleShopSelect(s.name, s.category?.name, s.id, s.categoryId)}
                                                        >
                                                            <span>{s.name}</span>
                                                            <ArrowRightLeft size={10} className="text-white/0 group-hover:text-white/40 transition-all translate-x-2 group-hover:translate-x-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            ));
                                        })()}
                                    </div>,
                                    document.body
                                )}
                                {errors.store && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.store}</p>}
                            </div>
                        </div>

                        <div className="space-y-1.5 flex flex-col pt-0.5">
                            <label className="text-[10.5px] font-black text-white/50 uppercase tracking-widest h-[13.5px] ml-1">Notatka</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                                <Input
                                    type="text"
                                    className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                                    placeholder="Wpisz..."
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>
                        </div>
                    </>
                )}

                {transactionType === 'internal_transfer' && (
                    <>
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Na konto</label>
                            <Select
                                value={
                                    (toPersonalAccountId && toPersonalAccountId !== '' ? toPersonalAccountId : undefined) ||
                                    (savingsAccountId && savingsAccountId !== '' ? savingsAccountId : undefined) ||
                                    (toInvestmentAccountId && toInvestmentAccountId !== '' ? toInvestmentAccountId : undefined)
                                }
                                onValueChange={(val: string) => {
                                    if (personalAccounts.some(acc => acc.id === val)) { setToPersonalAccountId(val); setSavingsAccountId(''); setToInvestmentAccountId(''); setSavingsGoalId(''); }
                                    else if (savingsAccounts.some(acc => acc.id === val)) {
                                        setSavingsAccountId(val);
                                        setToPersonalAccountId('');
                                        setToInvestmentAccountId('');
                                        const mainGoal = goals.find(g => g.isMain);
                                        if (mainGoal) setSavingsGoalId(mainGoal.id);
                                    }
                                    else if (investmentAccounts.some(acc => acc.id === val)) { setToInvestmentAccountId(val); setToPersonalAccountId(''); setSavingsAccountId(''); setSavingsGoalId(''); }
                                }}
                            >
                                <SelectTrigger className={cn(
                                    "h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]",
                                    errors.toAccountId && "border-danger/50"
                                )}>
                                    <SelectValue placeholder="Cel transferu" />
                                </SelectTrigger>
                                <SelectContent className="z-[101]">
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Osobiste</SelectLabel>
                                        {personalAccounts.filter(acc => acc.id !== personalAccountId && !!acc.id).map(acc => (
                                            <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Oszczędnościowe</SelectLabel>
                                        {savingsAccounts.filter(acc => !!acc.id).map(acc => (
                                            <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                    <SelectGroup>
                                        <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Inwestycyjne</SelectLabel>
                                        {investmentAccounts.filter(acc => !!acc.id).map(acc => (
                                            <SelectItem key={acc.id} value={acc.id || 'EMPTY'} className="text-xs">{acc.name}</SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                            {errors.categoryId && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.categoryId}</p>}
                        </div>

                        <div className="space-y-1.5 flex flex-col pt-0.5">
                            <label className="text-[10.5px] font-black text-white/50 uppercase tracking-widest h-[13.5px] ml-1">Notatka</label>
                            <div className="relative">
                                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                                <Input
                                    type="text"
                                    className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                                    placeholder="Wpisz..."
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>
                        </div>

                        {savingsAccountId && (
                            <div className="col-span-2 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Cel oszczędnościowy</label>
                                <Select value={savingsGoalId === '' ? undefined : savingsGoalId} onValueChange={(val) => setSavingsGoalId(val || '')}>
                                    <SelectTrigger className="h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                                        <SelectValue placeholder="Wybierz cel" />
                                    </SelectTrigger>
                                    <SelectContent className="z-[101]">
                                        {goals.filter(goal => !!goal.id).map(goal => (
                                            <SelectItem key={goal.id} value={goal.id || 'EMPTY'} className="text-xs">{goal.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Optional Fields Toggle */}
            <div className="pt-1">
                <button
                    type="button"
                    onClick={() => setShowMoreOptions(!showMoreOptions)}
                    className="flex items-center gap-1.5 px-1 text-[9px] font-black text-white/40 hover:text-white transition-colors uppercase tracking-widest"
                >
                    {showMoreOptions ? <ChevronUp size={12} className="text-white/60" /> : <div className="p-0.5 bg-white/10 rounded-[5px] mr-0.5"><ChevronDown size={10} className="text-white/40" /></div>}
                    <span className={showMoreOptions ? 'text-white/60' : ''}>{showMoreOptions ? 'Mniej opcji' : 'Opcje dodatkowe'}</span>
                </button>

                {showMoreOptions && (
                    <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="py-1 px-3 bg-white/5 rounded-[5px] border border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={14} className="text-white/60" />
                                    <span className="text-[11px] font-bold text-white">Transakcja powtarzalna</span>
                                </div>
                                <Switch
                                    checked={isRecurring}
                                    onCheckedChange={setIsRecurring}
                                    className="scale-75 data-[state=checked]:bg-emerald-500 border border-white/10 shadow-inner"
                                />
                            </div>

                            {isRecurring && (
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Częstotliwość</label>
                                        <Select value={recurrenceInterval} onValueChange={(val: any) => setRecurrenceInterval(val)}>
                                            <SelectTrigger className="h-8 bg-white/10 border-white/10 text-[10px] font-black text-white rounded-[5px] px-2 shadow-inner">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="z-[101]">
                                                <SelectItem value="MONTHLY" className="text-[10px]">Miesięcznie</SelectItem>
                                                <SelectItem value="ANNUALLY" className="text-[10px]">Rocznie</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Termin końcowy (opcjonalne)</label>
                                        <Input
                                            type="date"
                                            className="h-8 bg-white/10 border-white/10 text-[10px] font-black text-white rounded-[5px] [color-scheme:dark] px-2 cursor-pointer shadow-inner"
                                            value={recurrenceEndDate}
                                            onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                            onClick={(e) => (e.target as any).showPicker?.()}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-between items-center gap-2 pt-2 mt-auto">
                {isEditing && onDelete ? (
                    <Button variant="ghost" type="button" onClick={onDelete} className="h-9 px-4 rounded-[5px] font-bold text-rose-400/80 hover:text-rose-400 hover:bg-rose-500/10 transition-all text-[10px] uppercase tracking-widest">
                        Usuń
                    </Button>
                ) : <span />}
                <div className="flex gap-2">
                    <Button variant="ghost" type="button" onClick={onClose} className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest">
                        Anuluj
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        className="h-9 px-6 bg-white text-black rounded-[5px] font-black hover:bg-gray-200 transition-all shadow-xl disabled:opacity-50 uppercase tracking-widest text-[10px]"
                    >
                        {loading ? '...' : isEditing ? 'Zapisz' : (Object.keys(errors).length > 0 ? 'Popraw błędy' : 'Dodaj transakcję')}
                    </Button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showLinkConfirm}
                onClose={() => setShowLinkConfirm(false)}
                onConfirm={handleLinkToPlan}
                title="Powiąż z planem"
                message={matchingPlanItem ? `Czy to wydatek stały "${matchingPlanItem.store}"?` : ""}
                confirmLabel="Tak, powiąż"
                cancelLabel="Nie, tylko dodaj"
            />
        </form>
    );
}
