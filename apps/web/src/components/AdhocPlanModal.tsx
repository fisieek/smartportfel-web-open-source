import { useState, useEffect, useMemo } from 'react';
import { Calendar, Store as StoreIcon, Lock, Target, ChevronUp, ChevronDown } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useCategories, useStores, usePersonalAccounts } from '../hooks/useQueries';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';

interface Category {
    id: number;
    name: string;
    color: string;
    icon?: string;
    isSystemCategory?: boolean;
}

interface Store {
    id: string;
    name: string;
    categoryId: number;
    isSystemCategory?: boolean;
}

interface PersonalAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
    currency: string;
    isMultiCurrency: boolean;
    type?: string;
}

interface AdhocPlanModalProps {
    month: string;
    year: string;
    type: 'income' | 'expense';
    onClose: () => void;
    onSuccess: () => void;
}

const INCOME_SOURCES = [
    "Wypłata", "Premia", "Zwrot", "Odsetki", "Dywidenda",
    "Ankieta", "Sprzedaż", "Obligacje", "Delegacja", "Inny przychód"
];

// `month` i `year` zostają w kontrakcie propsów (przekazuje je MonthlyPlanningWidget),
// ale komponent ich nie używa — okres wynika z pozycji planu po stronie serwera.
export default function AdhocPlanModal({ type, onClose, onSuccess }: AdhocPlanModalProps) {
    const [name, setName] = useState('');
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('PLN');
    const [categoryId, setCategoryId] = useState('');
    const [storeName, setStoreName] = useState('');
    const [storeId, setStoreId] = useState('');
    const [personalAccountId, setPersonalAccountId] = useState('');
    const [plannedDate, setPlannedDate] = useState('');
    const [recurrenceInterval, setRecurrenceInterval] = useState('MONTHLY');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
    const [isRecurrenceEnabled, setIsRecurrenceEnabled] = useState(true);
    const [hasEndDate, setHasEndDate] = useState(false);
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(false);
    const [showStoreSuggestions, setShowStoreSuggestions] = useState(false);
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const { success, error: toastError } = useToast();

    // TanStack Query hooks - dane z cache
    const { data: categoriesRaw = [] } = useCategories();
    const { data: storesRaw = [] } = useStores();
    const { data: accountsRaw = [] } = usePersonalAccounts();

    // useMemo dla filtrowania
    const categories = useMemo(() => categoriesRaw as Category[], [categoriesRaw]);
    const stores = useMemo(() => storesRaw as Store[], [storesRaw]);
    const personalAccounts = useMemo(() => accountsRaw as PersonalAccount[], [accountsRaw]);

    // Determine available currencies based on selected account
    const selectedAccount = personalAccounts.find(acc => acc.id === personalAccountId);
    const availableCurrencies = selectedAccount
        ? (selectedAccount.isMultiCurrency
            ? ['PLN', 'EUR', 'USD', 'GBP', 'CHF']
            : [selectedAccount.currency])
        : ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];

    // Auto-set category for income type
    useEffect(() => {
        if (type === 'income' && categories.length > 0 && !categoryId) {
            const incomeCat = categories.find(c => c.name === 'Wpływ');
            if (incomeCat) setCategoryId(incomeCat.id.toString());
        }
    }, [type, categories, categoryId]);

    // Auto-set date to tomorrow on mount
    useEffect(() => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        setPlannedDate(tomorrow.toISOString().split('T')[0]);
    }, []);

    const handleAccountChange = (accId: string) => {
        setPersonalAccountId(accId);

        // Auto-adjust currency if current selection is invalid for new account
        const account = personalAccounts.find(a => a.id === accId);
        if (account && !account.isMultiCurrency && account.currency !== currency) {
            setCurrency(account.currency);
        }
    };

    const handleShopSelect = (selectedShop: string, groupName?: string, customStoreId?: string, customCategoryId?: number) => {
        setStoreName(selectedShop);
        setStoreId(customStoreId || '');
        setShowStoreSuggestions(false);
        if (!name) setName(selectedShop);

        if (customCategoryId) {
            setCategoryId(customCategoryId.toString());
        } else if (groupName) {
            const cat = categories.find(c => c.name === groupName);
            if (cat) setCategoryId(cat.id.toString());
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation: Future date only
        const selected = new Date(plannedDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (selected <= today) {
            toastError('Można wybrać wyłącznie datę PRZYSZŁĄ - nie można przeszłej ani dzisiejszej.');
            return;
        }

        // Validation: End date not before start date
        if (recurrenceEndDate) {
            const end = new Date(recurrenceEndDate);
            if (end < selected) {
                toastError('Data końca nie może być wcześniejsza niż data początkowa.');
                return;
            }
        }

        // Determine target month/year from plannedDate
        const dateObj = new Date(plannedDate);
        const targetMonth = (dateObj.getMonth() + 1).toString();
        const targetYear = dateObj.getFullYear().toString();

        setLoading(true);
        try {
            await api.post('/planning/create-adhoc', {
                month: targetMonth,
                year: targetYear,
                name: type === 'expense' ? (storeName || name) : name,
                amount: parseFloat(amount.replace(',', '.')),
                currency,
                type,
                categoryId: categoryId || undefined,
                storeId: storeId || undefined,
                personalAccountId: personalAccountId || undefined,
                isRecurring: isRecurrenceEnabled,
                recurrenceInterval: isRecurrenceEnabled ? recurrenceInterval : undefined,
                recurrenceEndDate: (isRecurrenceEnabled && hasEndDate) ? recurrenceEndDate : undefined,
                note: note || undefined,
                plannedDate
            });
            success('Dodano do planu.');
            onSuccess();
            onClose();
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Błąd tworzenia planu ad-hoc.');
        } finally {
            setLoading(false);
        }
    };

    // Group accounts for Select
    const bankAccounts = personalAccounts.filter(acc => !['LOYALTY_CARD', 'SAVINGS_ACCOUNT', 'INVESTMENT_ACCOUNT'].includes(acc.type || ''));
    const loyaltyAccounts = personalAccounts.filter(acc => acc.type === 'LOYALTY_CARD');

    return (
        <form onSubmit={handleSubmit} className="space-y-4 h-full flex flex-col">
            {/* Amount Input - compact style matching AddExpenseModal */}
            <div className="space-y-1">
                <div className="bg-white/5 rounded-[5px] py-1 px-3 border border-white/5 focus-within:border-white/10 flex items-center justify-between transition-colors">
                    <div className="flex-1 min-w-0">
                        <Input
                            type="number"
                            step="0.01"
                            required
                            autoFocus
                            className="h-8 bg-transparent border-none text-xl font-bold text-white p-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none shadow-none placeholder:text-white/5"
                            placeholder="0.00"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {availableCurrencies.length > 1 ? (
                            <Select value={currency} onValueChange={setCurrency}>
                                <SelectTrigger className="w-auto h-7 px-2 border-none bg-white/10 hover:bg-white/20 text-[10px] font-black rounded-[5px] transition-all text-white/70">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="z-[101]">
                                    {availableCurrencies.map(curr => (
                                        <SelectItem key={curr} value={curr} className="text-[10px] font-black uppercase tracking-wider">{curr}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <span className="h-7 px-2 flex items-center text-[10px] font-black text-white/40 uppercase tracking-wider">{currency}</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Grid: Date + Account */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1 block h-[13.5px] leading-[13.5px]">Data planowana</label>
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                        <Input
                            type="date"
                            required
                            min={new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}
                            className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] [color-scheme:dark] cursor-pointer"
                            value={plannedDate}
                            onChange={(e) => setPlannedDate(e.target.value)}
                            onClick={(e) => (e.target as any).showPicker?.()}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1 block h-[13.5px] leading-[13.5px]">{type === 'income' ? 'Konto docelowe' : 'Konto źródłowe'}</label>
                    <Select value={personalAccountId} onValueChange={handleAccountChange}>
                        <SelectTrigger className="h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                            <SelectValue placeholder="Wybierz konto" />
                        </SelectTrigger>
                        <SelectContent className="z-[101]">
                            {bankAccounts.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Konta bankowe i gotówka</SelectLabel>
                                    {bankAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                            {acc.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {loyaltyAccounts.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Karty lojalnościowe</SelectLabel>
                                    {loyaltyAccounts.map(acc => (
                                        <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                            {acc.name}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Name / Store */}
            <div className="space-y-1.5">
                <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">
                    {type === 'expense' ? 'Sklep / Odbiorca' : 'Źródło'}
                </label>
                <div className="relative">
                    {type === 'expense' ? (
                        <>
                            <StoreIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none z-10" size={14} />
                            <Input
                                type="text"
                                required
                                className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                                placeholder="Wpisz sklep..."
                                value={storeName}
                                onChange={(e) => {
                                    setStoreName(e.target.value);
                                    setStoreId('');
                                }}
                                onFocus={() => setShowStoreSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowStoreSuggestions(false), 200)}
                            />
                        </>
                    ) : (
                        <>
                            <Target className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                            <Select value={name} onValueChange={setName}>
                                <SelectTrigger className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                                    <SelectValue placeholder="Wybierz źródło" />
                                </SelectTrigger>
                                <SelectContent className="z-[101]">
                                    {INCOME_SOURCES.map(source => (
                                        <SelectItem key={source} value={source} className="text-xs">{source}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </>
                    )}

                    {showStoreSuggestions && type === 'expense' && (
                        <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-[#1a1a1a] border border-white/5 rounded-[5px] shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden custom-scrollbar transition-all scale-in-center">
                            {(() => {
                                const suggestions: Record<string, any[]> = {};
                                const lowerSearch = storeName.toLowerCase();

                                stores
                                    .filter(s =>
                                        s.name.toLowerCase().includes(lowerSearch) &&
                                        !s.isSystemCategory &&
                                        !['przewalutowanie', 'wymiana walut'].includes(s.name.toLowerCase())
                                    )
                                    .forEach(s => {
                                        const catName = categories.find(c => c.id === s.categoryId)?.name || 'Inne';
                                        if (!suggestions[catName]) suggestions[catName] = [];
                                        suggestions[catName].push({
                                            name: s.name,
                                            id: s.id,
                                            categoryId: s.categoryId,
                                            isCustom: true
                                        });
                                    });

                                return Object.entries(suggestions).map(([catName, items]) => (
                                    <div key={`group-${catName}`}>
                                        <div className="px-4 py-2 bg-white/5 text-[10px] font-black text-white/30 uppercase tracking-widest sticky top-0 border-b border-white/5 z-10">
                                            {catName}
                                        </div>
                                        {items.map((item, idx) => (
                                            <button
                                                key={`${catName}-${item.name}-${idx}`}
                                                type="button"
                                                className="w-full text-left px-4 py-3 hover:bg-white/5 hover:text-white transition-colors text-sm font-bold text-white/60 flex items-center justify-between"
                                                onClick={() => handleShopSelect(item.name, catName, item.id, item.categoryId)}
                                            >
                                                <span>{item.name}</span>
                                                {!item.isCustom && <Lock size={10} className="text-white/10" />}
                                            </button>
                                        ))}
                                    </div>
                                ));
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {/* Recurrence Toggle - pill style */}
            <div className="bg-white/5 border border-white/5 rounded-[5px] p-1.5 flex gap-1">
                <button
                    type="button"
                    onClick={() => setIsRecurrenceEnabled(false)}
                    className={`flex-1 py-1.5 rounded-[5px] text-[10px] font-black uppercase tracking-widest transition-all ${!isRecurrenceEnabled ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                >
                    Jednorazowy
                </button>
                <button
                    type="button"
                    onClick={() => setIsRecurrenceEnabled(true)}
                    className={`flex-1 py-1.5 rounded-[5px] text-[10px] font-black uppercase tracking-widest transition-all ${isRecurrenceEnabled ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                >
                    Cykliczny
                </button>
            </div>

            {isRecurrenceEnabled && (
                <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Powtarzalność</label>
                        <Select value={recurrenceInterval} onValueChange={setRecurrenceInterval}>
                            <SelectTrigger className="h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                                <SelectItem value="MONTHLY" className="text-xs">Co miesiąc</SelectItem>
                                <SelectItem value="ANNUALLY" className="text-xs">Co rok</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Data końcowa</label>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={hasEndDate}
                                    onCheckedChange={(checked) => {
                                        setHasEndDate(checked);
                                        if (!checked) setRecurrenceEndDate('');
                                    }}
                                    className="scale-75 data-[state=checked]:bg-emerald-500 border border-white/10 shadow-inner"
                                />
                                <span className="text-[10px] text-white/50 font-bold">
                                    {hasEndDate ? 'Ustawiona' : 'Bezterminowo'}
                                </span>
                            </div>
                            {hasEndDate && (
                                <div className="relative">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                                    <Input
                                        type="date"
                                        required
                                        min={plannedDate || new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0]}
                                        className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] [color-scheme:dark] cursor-pointer"
                                        value={recurrenceEndDate}
                                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                                        onClick={(e) => (e.target as any).showPicker?.()}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* More Options Toggle */}
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
                        <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Notatka</label>
                            <Input
                                type="text"
                                className="h-10 pl-3 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                                placeholder="Dodatkowe informacje..."
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-2 pt-2 mt-auto">
                <Button variant="ghost" type="button" onClick={onClose} className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest">
                    Anuluj
                </Button>
                <Button
                    type="submit"
                    disabled={loading}
                    className="h-9 px-6 bg-white text-black rounded-[5px] font-black hover:bg-gray-200 transition-all shadow-xl disabled:opacity-50 uppercase tracking-widest text-[10px]"
                >
                    {loading ? 'Zapisywanie...' : 'Zaplanuj'}
                </Button>
            </div>
        </form>
    );
}
