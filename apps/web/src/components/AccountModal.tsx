import { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ui/ConfirmModal';
import { Landmark, Wallet, Plus, Trash2, Calendar } from 'lucide-react';
import { useInvalidateQueries } from '../hooks/useQueries';
import type { Store } from '../hooks/useQueries';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Switch } from './ui/switch';
import { cn } from '../lib/utils';

interface AccountBalance {
    currency: string;
    balance: number | string;
}

interface PersonalAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
    isMain: boolean;
    isSystem: boolean;
    isMultiCurrency: boolean;
    isShared?: boolean;
    type?: string;
    expiryDate?: string;
    currency?: string;
    balances?: AccountBalance[];
}

interface AccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    accountToEdit?: PersonalAccount | null;
}

export default function AccountModal({ isOpen, onClose, onSuccess, accountToEdit }: AccountModalProps) {
    const { success, error: toastError } = useToast();
    const [submitting, setSubmitting] = useState(false);
    const { invalidatePersonalAccounts, invalidateSavingsAccounts } = useInvalidateQueries();

    const [formData, setFormData] = useState({
        name: '',
        bank: '',
        balance: '',
        isMain: false,
        isMultiCurrency: false,
        isShared: false,
        type: 'BANK',
        expiryDate: '',
        currency: 'PLN',
        balances: [{ currency: 'PLN', balance: '' }] as AccountBalance[]
    });

    // Czy użytkownik należy do gospodarstwa — od tego zależy widoczność opcji „konto wspólne"
    const [inHousehold, setInHousehold] = useState(false);

    const [allUserStores, setAllUserStores] = useState<Store[]>([]);
    const [showStoreSuggestions, setShowStoreSuggestions] = useState(false);

    const AVAILABLE_CURRENCIES = ['PLN', 'EUR', 'USD', 'GBP', 'CHF', 'JPY', 'UAH', 'NOK', 'SEK', 'PKT'];
    const ACCOUNT_TYPES = [
        { id: 'BANK', label: 'Konto Bankowe' },
        { id: 'GIFT_CARD', label: 'Karta Podarunkowa / Voucher' },
        { id: 'LOYALTY_CARD', label: 'Program Lojalnościowy (Punkty)' },
    ];

    // Confirm Modal for switching main account
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => { },
    });

    // Fetch stores for non-monetary accounts
    useEffect(() => {
        if (isOpen) {
            const fetchStores = async () => {
                try {
                    const res = await api.get('/stores');
                    setAllUserStores(res.data);
                } catch (err) {
                    console.error('[AccountModal] Error fetching stores:', err);
                }
            };
            fetchStores();
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            if (accountToEdit) {
                const balances = accountToEdit.balances && accountToEdit.balances.length > 0
                    ? accountToEdit.balances.map(b => ({ ...b, balance: Number(b.balance) }))
                    : [{ currency: accountToEdit.currency || 'PLN', balance: accountToEdit.balance }];

                setFormData({
                    name: accountToEdit.name,
                    bank: accountToEdit.bank,
                    balance: accountToEdit.balance.toString(),
                    isMain: accountToEdit.isMain,
                    isMultiCurrency: accountToEdit.isMultiCurrency || false,
                    isShared: accountToEdit.isShared || false,
                    type: accountToEdit.type || 'BANK',
                    expiryDate: accountToEdit.expiryDate ? new Date(accountToEdit.expiryDate).toISOString().split('T')[0] : '',
                    currency: accountToEdit.currency || 'PLN',
                    balances: balances
                });
            } else {
                setFormData({
                    name: '',
                    bank: '',
                    balance: '',
                    isMain: false,
                    isMultiCurrency: false,
                    isShared: false,
                    type: 'BANK',
                    expiryDate: '',
                    currency: 'PLN',
                    balances: [{ currency: 'PLN', balance: '' }]
                });
            }
        }
    }, [isOpen, accountToEdit]);

    // Pobierz status gospodarstwa przy otwarciu — opcja „wspólne" tylko dla członków household
    useEffect(() => {
        if (!isOpen) return;
        let active = true;
        api.get('/household')
            .then(res => { if (active) setInHousehold(!!res.data?.household); })
            .catch(() => { if (active) setInHousehold(false); });
        return () => { active = false; };
    }, [isOpen]);

    const addCurrency = () => {
        const usedCurrencies = formData.balances.map(b => b.currency);
        const nextCurrency = AVAILABLE_CURRENCIES.find(c => !usedCurrencies.includes(c));

        if (nextCurrency) {
            setFormData({
                ...formData,
                balances: [...formData.balances, { currency: nextCurrency, balance: '' }]
            });
        }
    };

    const removeCurrency = (index: number) => {
        const newBalances = [...formData.balances];
        newBalances.splice(index, 1);
        setFormData({ ...formData, balances: newBalances });
    };

    const updateBalanceValue = (index: number, value: string) => {
        const newBalances = [...formData.balances];
        newBalances[index].balance = value;

        // If it matches main currency, also update the main balance field
        const newState = { ...formData, balances: newBalances };
        if (newBalances[index].currency === formData.currency) {
            newState.balance = value;
        }

        setFormData(newState);
    };

    const updateCurrencyType = (index: number, currency: string) => {
        const newBalances = [...formData.balances];
        newBalances[index].currency = currency;

        // If it's the first balance and we are in multi-currency, sync the main currency field too
        const newState = { ...formData, balances: newBalances };
        if (index === 0) {
            newState.currency = currency;
        }

        setFormData(newState);
    };

    const handleSubmit = async () => {
        const isEditing = !!accountToEdit;

        // Validation
        const hasValidBalance = formData.isMultiCurrency
            ? formData.balances.length > 0
            : formData.balance !== '';

        if (!formData.name || !hasValidBalance) {
            toastError('Wypełnij wymagane pola');
            return;
        }

        const executeRequest = async () => {
            setSubmitting(true);
            try {
                const payload = {
                    ...formData,
                    balance: formData.balance === '' ? 0 : Number(formData.balance),
                    balances: formData.isMultiCurrency
                        ? formData.balances.map(b => ({ ...b, balance: b.balance === '' ? 0 : Number(b.balance) }))
                        : [{ currency: formData.currency, balance: formData.balance === '' ? 0 : Number(formData.balance) }],
                    bank: accountToEdit?.isSystem ? (accountToEdit.bank || 'Portfel') : formData.bank,
                    expiryDate: formData.expiryDate || null,
                };

                console.warn('[AccountModal] Submitting payload:', payload);

                if (isEditing) {
                    await api.put(`/personal-accounts/${accountToEdit.id}`, payload);
                    success('Konto zaktualizowane');
                } else {
                    await api.post('/personal-accounts', payload);
                    success('Konto dodane');
                }
                // Invalidate cache dla kont osobistych i oszczędnościowych
                invalidatePersonalAccounts();
                invalidateSavingsAccounts();

                onSuccess();
                onClose();
            } catch (err: any) {
                console.error(err);
                toastError(err.response?.data?.error || 'Wystąpił błąd');
            } finally {
                setSubmitting(false);
            }
        };

        // Check isMain logic only if changing to main or adding new main
        if (formData.isMain && (!accountToEdit || !accountToEdit.isMain)) {
            setConfirmConfig({
                isOpen: true,
                title: 'Zmiana konta głównego',
                message: `Czy na pewno chcesz ustawić to konto jako główne?`,
                onConfirm: executeRequest
            });
        } else {
            executeRequest();
        }
    };

    const isPointsAccount = formData.type === 'LOYALTY_CARD';
    const isGiftCard = formData.type === 'GIFT_CARD' || formData.type === 'VOUCHER';

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={accountToEdit ? (accountToEdit.isSystem ? 'Edycja: Gotówka' : 'Edytuj konto') : 'Nowe konto / Karta'}
            >
                <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-4 md:space-y-6 h-full flex flex-col">

                    {/* Typ Konta */}
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-1.5 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Typ Konta</label>
                        <div className="relative group">
                            <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors z-10" size={18} />
                            <Select
                                value={formData.type}
                                onValueChange={(val) => {
                                    const newType = val;
                                    const oldType = formData.type;
                                    let newCurrency = formData.currency;

                                    // Update currency based on new type
                                    if (newType === 'LOYALTY_CARD') {
                                        newCurrency = 'PKT';
                                    } else if (newType === 'GIFT_CARD' || newType === 'VOUCHER') {
                                        if (oldType === 'LOYALTY_CARD') {
                                            newCurrency = 'PLN';
                                        }
                                    } else if (newType === 'BANK') {
                                        if (!formData.isMultiCurrency) {
                                            newCurrency = 'PLN';
                                        }
                                    }

                                    const newIsMain = (newType === 'BANK' || newType === 'CASH') ? formData.isMain : false;

                                    setFormData({
                                        ...formData,
                                        type: newType,
                                        currency: newCurrency,
                                        isMain: newIsMain,
                                        isMultiCurrency: (newType === 'BANK' || newType === 'CASH') ? formData.isMultiCurrency : false,
                                        balances: (newType === 'BANK' || newType === 'CASH') && formData.isMultiCurrency
                                            ? formData.balances
                                            : [{ currency: newCurrency, balance: formData.balance }]
                                    });
                                }}
                                disabled={accountToEdit?.isSystem}
                            >
                                <SelectTrigger className={cn(
                                    "pl-11 pr-4 py-1 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium",
                                    accountToEdit?.isSystem && "opacity-50 cursor-not-allowed"
                                )}>
                                    <SelectValue placeholder="Wybierz typ konta" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ACCOUNT_TYPES.map(type => (
                                        <SelectItem key={type.id} value={type.id}>{type.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div>
                        <label className="block font-medium text-white/40 mb-1 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Nazwa {isPointsAccount ? 'Karty/Programu' : 'Konta'}</label>
                        <div className="relative group">
                            <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors z-10" size={18} />
                            <Input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder={isPointsAccount ? "np. Żabka Żappka" : "np. Konto główne"}
                                disabled={accountToEdit?.isSystem}
                                className="pl-11 pr-4 py-1 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium placeholder:text-white/10"
                            />
                        </div>
                    </div>

                    {/* Only show Bank selection if type is BANK */}
                    {formData.type === 'BANK' && (
                        <div>
                            <label className="block font-medium text-white/40 mb-1 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Bank</label>
                            {accountToEdit?.isSystem ? (
                                <div className="relative group">
                                    <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-white/10" size={18} />
                                    <div className="w-full pl-11 pr-4 py-1 bg-white/5 border border-white/5 rounded-[5px] text-white/10 font-medium cursor-not-allowed text-sm md:text-base">
                                        -
                                    </div>
                                </div>
                            ) : (
                                <div className="relative group">
                                    <Landmark className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors z-10" size={18} />
                                    <Select
                                        value={formData.bank}
                                        onValueChange={(val) => setFormData({ ...formData, bank: val })}
                                    >
                                        <SelectTrigger className="pl-11 pr-4 py-1 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium">
                                            <SelectValue placeholder="Wybierz bank" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {[
                                                "Alior Bank", "Bank BPH", "Bank Millennium", "Bank Nowy", "Bank Ochrony Środowiska (BOŚ Bank)",
                                                "Bank Pekao", "Bank Pocztowy", "Bank Polskiej Spółdzielcine (BPS)", "BNP Paribas Bank Polska",
                                                "Citi Handlowy", "Credit Agricole Bank Polska", "DNB Bank Polska", "Erste Bank Polska",
                                                "ING Bank Śląski", "mBank", "Nest Bank", "PKO Bank Polski", "Plus Bank", "Raiffeisen Digital Bank",
                                                "Revolut", "Santander Consumer Bank", "SGB-Bank", "Toyota Bank Polska", "VeloBank", "Inny"
                                            ].map(bank => (
                                                <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Store/Provider Name logic could reuse Bank field or add new one? reused Bank for simplicity but hidden/optional for non-bank? */}
                    {/* Let's reuse 'Bank' field as 'Provider' for non-bank accounts, but make it a text input or optional */}
                    {formData.type !== 'BANK' && formData.type !== 'CASH' && (
                        <div>
                            <label className="block text-sm font-medium text-white/40 mb-1.5 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Wydawca / Sklep</label>
                            <div className="relative group">
                                <Input
                                    type="text"
                                    value={formData.bank} // We use bank field for provider name
                                    onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                                    onFocus={() => setShowStoreSuggestions(true)}
                                    onBlur={() => setTimeout(() => setShowStoreSuggestions(false), 200)}
                                    placeholder="np. Biedronka, Żabka, Empik"
                                    className="pl-11 pr-4 py-2.5 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium placeholder:text-white/10"
                                />

                                {/* Store suggestions dropdown */}
                                {showStoreSuggestions && formData.bank && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-[#1a1a1a] border border-white/5 rounded-[5px] shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden custom-scrollbar">
                                        {(() => {
                                            const suggestions: Record<string, any[]> = {};
                                            const lowerSearch = formData.bank.toLowerCase();

                                            allUserStores
                                                .filter(s =>
                                                    s.name.toLowerCase().includes(lowerSearch) &&
                                                    !s.isSystemCategory &&
                                                    !['przewalutowanie', 'wymiana walut'].includes(s.name.toLowerCase())
                                                )
                                                .forEach(s => {
                                                    const catName = s.category?.name || 'Inne';
                                                    if (!suggestions[catName]) suggestions[catName] = [];
                                                    suggestions[catName].push({
                                                        name: s.name,
                                                        id: s.id,
                                                        categoryId: s.categoryId,
                                                        groupName: catName,
                                                        isCustom: !!s.userId
                                                    });
                                                });

                                            const hasResults = Object.keys(suggestions).length > 0;

                                            if (!hasResults) {
                                                return (
                                                    <div className="px-4 py-3 text-sm text-white/40 text-center">
                                                        Brak wyników
                                                    </div>
                                                );
                                            }

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
                                                            onClick={() => {
                                                                setFormData({ ...formData, bank: item.name });
                                                                setShowStoreSuggestions(false);
                                                            }}
                                                        >
                                                            <span>{item.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Expiry Date for Gift Cards/Points */}
                    {(isPointsAccount || isGiftCard) && (
                        <div>
                            <label className="block font-medium text-white/40 mb-1 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Data Ważności (Opcjonalnie)</label>
                            <div className="relative group">
                                <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors z-10" size={18} />
                                <Input
                                    type="date"
                                    value={formData.expiryDate}
                                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                                    className="pl-11 pr-4 py-1 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium [color-scheme:dark]"
                                />
                            </div>
                        </div>
                    )}

                    {!formData.isMultiCurrency ? (
                        <div>
                            <label className="block font-medium text-white/40 mb-1 md:mb-2 ml-1 uppercase tracking-widest text-[9px] md:text-[10px]">Aktualne saldo</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-12 z-10 text-center">
                                    <span className="text-white/20 font-black text-[10px] uppercase">{formData.currency}</span>
                                </div>
                                <Input
                                    type="number"
                                    value={formData.balance}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setFormData({
                                            ...formData,
                                            balance: val,
                                            balances: [{ currency: formData.currency, balance: Number(val) }]
                                        });
                                    }}
                                    placeholder="0.00"
                                    className="pl-16 pr-4 py-1 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-bold placeholder:text-white/10 text-lg tabular-nums"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-white/40 mb-0 ml-1 uppercase tracking-widest text-[10px]">Salda walutowe</label>
                            {formData.balances.map((balanceItem, index) => (
                                <div key={index} className="flex gap-2 items-center">
                                    <div className="flex-shrink-0 w-28">
                                        <Select
                                            value={balanceItem.currency}
                                            onValueChange={(val) => updateCurrencyType(index, val)}
                                        >
                                            <SelectTrigger className="h-auto py-1 rounded-[5px] bg-white/5 border-white/5 text-white font-bold text-sm">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {AVAILABLE_CURRENCIES.map(curr => (
                                                    <SelectItem
                                                        key={curr}
                                                        value={curr}
                                                        disabled={formData.balances.some((b, i) => b.currency === curr && i !== index)}
                                                    >
                                                        {curr}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Input
                                        type="number"
                                        value={balanceItem.balance}
                                        onChange={(e) => updateBalanceValue(index, e.target.value)}
                                        placeholder="0.00"
                                        className="flex-1 py-2.5 h-auto rounded-[5px] bg-white/5 border-white/5 text-white focus-visible:ring-white/20 transition-all font-medium placeholder:text-white/10"
                                    />
                                    {balanceItem.currency !== formData.currency && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            type="button"
                                            onClick={() => removeCurrency(index)}
                                            className="text-white/20 hover:text-rose-500 hover:bg-rose-500/10 rounded-[5px]"
                                        >
                                            <Trash2 size={18} />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {formData.balances.length < AVAILABLE_CURRENCIES.length && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    onClick={addCurrency}
                                    className="w-full py-4 rounded-[5px] border-dashed border-white/10 text-white/40 hover:text-white hover:border-white/20 hover:bg-white/5 transition-all text-xs font-bold flex items-center justify-center gap-2"
                                >
                                    <Plus size={14} strokeWidth={3} />
                                    Dodaj kolejną walutę
                                </Button>
                            )}
                        </div>
                    )}

                    <div className="pt-0 md:pt-2 flex flex-col gap-3 md:gap-4">
                        {/* Only show "Main Account" checkbox for BANK and CASH */}
                        {(formData.type === 'BANK' || formData.type === 'CASH') && (
                            <div className="flex items-center gap-3 py-1">
                                <Switch
                                    checked={formData.isMain}
                                    onCheckedChange={(checked) => setFormData({ ...formData, isMain: checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white/60">
                                        Ustaw jako konto główne
                                    </span>
                                    <span className="text-[10px] text-white/20 uppercase font-black tracking-widest leading-none mt-1">
                                        Domyślne konto dla nowych transakcji
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 py-1">
                            <Switch
                                checked={formData.isMultiCurrency}
                                onCheckedChange={(checked) => setFormData({ ...formData, isMultiCurrency: checked })}
                            />
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-white/60">
                                    Włącz portfel Wielowalutowy
                                </span>
                                <span className="text-[10px] text-white/20 uppercase font-black tracking-widest leading-none mt-1">
                                    Możliwość posiadania subkont w EUR, USD, GBP itd.
                                </span>
                            </div>
                        </div>

                        {inHousehold && (
                            <div className="flex items-center gap-3 py-1">
                                <Switch
                                    checked={formData.isShared}
                                    onCheckedChange={(checked) => setFormData({ ...formData, isShared: checked })}
                                />
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-white/60">
                                        Konto wspólne (gospodarstwo)
                                    </span>
                                    <span className="text-[10px] text-white/20 uppercase font-black tracking-widest leading-none mt-1">
                                        Widoczne i dostępne do księgowania dla członków gospodarstwa
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 pt-4 md:pt-6 justify-end mt-auto">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={onClose}
                            className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest"
                        >
                            Anuluj
                        </Button>
                        <Button
                            type="submit"
                            disabled={submitting}
                            className="bg-white text-black h-9 px-6 rounded-[5px] font-black hover:bg-gray-200 transition-all shadow-xl shadow-black/20 disabled:opacity-50 text-[10px] active:scale-95 uppercase tracking-widest"
                        >
                            {submitting ? 'Zapisywanie...' : 'Zapisz'}
                        </Button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
                variant="warning"
            />
        </>
    );
}
