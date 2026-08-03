import { useState } from 'react';
import { Calendar, Target, TrendingUp, ChevronUp, ChevronDown } from 'lucide-react';
import ConfirmModal from './ui/ConfirmModal';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

import { useIncomeForm } from '../hooks/useIncomeForm';

interface AddIncomeModalProps {
    onSuccess: () => void;
    onClose: () => void;
    transaction?: any | null;
    onDelete?: () => void;
    /** Data początkowa dla nowej pozycji (YYYY-MM-DD). Przy edycji ignorowana. */
    defaultDate?: string;
}

const INCOME_SOURCES = [
    "Wypłata", "Premia", "Zwrot", "Odsetki", "Dywidenda", "Ankieta", "Sprzedaż", "Obligacje", "Delegacja", "Inny przychód"
];

export default function AddIncomeModal({ onSuccess, onClose, transaction, onDelete, defaultDate }: AddIncomeModalProps) {
    const {
        amount, setAmount,
        description, setDescription,
        date, setDate,
        personalAccountId, setPersonalAccountId,
        note, setNote,
        isRecurring, setIsRecurring,
        recurrenceInterval, setRecurrenceInterval,
        recurrenceEndDate, setRecurrenceEndDate,
        currency, setCurrency,
        exchangeRate,
        isFetchingRate,
        matchingPlanItem,
        showLinkConfirm, setShowLinkConfirm,
        errors,
        loading,
        handleSubmit,
        handleLinkToPlan,
        allAccounts,
        filteredAccounts,
        isEditing
    } = useIncomeForm({ transaction, onSuccess, onClose, defaultDate });

    const [showMoreOptions, setShowMoreOptions] = useState(false);

    // Group accounts by type for Select
    const personalOnly = filteredAccounts.filter(a => a.accountType === 'personal');
    const savingsOnly = filteredAccounts.filter(a => a.accountType === 'savings');
    const investmentOnly = filteredAccounts.filter(a => a.accountType === 'investment');

    return (
        <form onSubmit={handleSubmit} className="space-y-4 h-full flex flex-col">
            {/* Amount Input */}
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
                            const sAcc = personalAccountId ? allAccounts.find((a: any) => a.id === personalAccountId) : null;
                            const availableCurrencies = (sAcc?.isMultiCurrency && sAcc.balances)
                                ? (sAcc.balances as any[]).map((b: any) => b.currency)
                                : [currency];

                            return (
                                <Select value={currency} onValueChange={setCurrency}>
                                    <SelectTrigger className="w-auto h-7 px-2 border-none bg-white/10 hover:bg-white/20 text-[10px] font-black rounded-[5px] transition-all text-white/70">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[101]">
                                        {availableCurrencies.filter((curr: string) => !!curr).map((curr: string) => (
                                            <SelectItem key={curr} value={curr || 'EMPTY'} className="text-[10px] font-black uppercase tracking-wider">{curr}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            );
                        })()}
                    </div>
                </div>

                <div className="flex items-center justify-between px-1">
                    {(() => {
                        if (!personalAccountId || personalAccountId === 'HISTORICAL') return null;
                        const sAcc = allAccounts.find(a => a.id === personalAccountId);
                        if (!sAcc) return null;

                        let balanceAmount: number | null = null;
                        if (sAcc.isMultiCurrency && sAcc.balances) {
                            const bEntry = (sAcc.balances as any[]).find((b: any) => b.currency === currency);
                            balanceAmount = bEntry ? Number(bEntry.balance) : 0;
                        } else {
                            balanceAmount = Number(sAcc.balance || 0);
                        }

                        if (balanceAmount === null) return null;

                        return (
                            <div className="text-[9px] font-bold text-emerald-400/50 uppercase tracking-widest">
                                Saldo: {balanceAmount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {currency}
                            </div>
                        );
                    })()}
                    {currency !== 'PLN' && !['PKT'].includes(currency) && (
                        <div className="text-[9px] font-bold text-blue-400/50 uppercase tracking-widest">
                            {isFetchingRate ? 'Kurs...' : `≈ ${(parseFloat(amount || '0') * exchangeRate).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN`}
                        </div>
                    )}
                </div>
            </div>

            {/* Grid: Source + Date */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <div className="flex justify-between items-center h-[13.5px] ml-1">
                        <label className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">Źródło</label>
                        {matchingPlanItem && <span className="text-[8px] font-black text-green-500 uppercase tracking-tighter animate-pulse">Plan!</span>}
                    </div>
                    <div className="relative">
                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" size={14} />
                        <Select value={description} onValueChange={setDescription}>
                            <SelectTrigger className={cn(
                                "h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]",
                                errors.description && "border-danger/50"
                            )}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                                {INCOME_SOURCES.map(source => (
                                    <SelectItem key={source} value={source || 'EMPTY'} className="text-xs">{source}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.description && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.description}</p>}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1 block h-[13.5px] leading-[13.5px]">Data</label>
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
                    {errors.date && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.date}</p>}
                </div>

                {/* Account Select */}
                <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-white/50 uppercase tracking-widest ml-1">Konto docelowe</label>
                    <Select
                        value={personalAccountId === '' ? undefined : personalAccountId}
                        onValueChange={(val: string) => setPersonalAccountId(val || '')}
                    >
                        <SelectTrigger className={cn(
                            "h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]",
                            errors.personalAccountId && "border-danger/50"
                        )}>
                            <SelectValue placeholder="Wybierz" />
                        </SelectTrigger>
                        <SelectContent className="z-[101]">
                            <SelectItem value="HISTORICAL" className="text-amber-500 font-bold text-xs uppercase">Historyczny</SelectItem>
                            {personalOnly.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Konta</SelectLabel>
                                    {personalOnly.filter(acc => !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || ''} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {savingsOnly.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Oszczędnościowe</SelectLabel>
                                    {savingsOnly.filter(acc => !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || ''} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                            {investmentOnly.length > 0 && (
                                <SelectGroup>
                                    <SelectLabel className="text-[9px] uppercase font-black text-white/20 px-2 py-1">Inwestycyjne</SelectLabel>
                                    {investmentOnly.filter(acc => !!acc.id).map(acc => (
                                        <SelectItem key={acc.id} value={acc.id || ''} className="text-xs">{acc.name}</SelectItem>
                                    ))}
                                </SelectGroup>
                            )}
                        </SelectContent>
                    </Select>
                    {errors.personalAccountId && <p className="text-[8px] text-danger font-bold uppercase tracking-tighter ml-1">{errors.personalAccountId}</p>}
                </div>

                {/* Note */}
                <div className="space-y-1.5 flex flex-col pt-0.5">
                    <label className="text-[10.5px] font-black text-white/50 uppercase tracking-widest h-[13.5px] ml-1">Notatka</label>
                    <div className="relative">
                        <Input
                            type="text"
                            className="h-10 pl-3 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] placeholder:text-white/10"
                            placeholder="Wpisz..."
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>
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
                                    <span className="text-[11px] font-bold text-white">Wpływ powtarzalny</span>
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
                                        <Select
                                            value={recurrenceInterval}
                                            onValueChange={(val: any) => setRecurrenceInterval(val)}
                                        >
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
                        {loading ? '...' : isEditing ? 'Zapisz' : (Object.keys(errors).length > 0 ? 'Popraw błędy' : 'Dodaj wpływ')}
                    </Button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showLinkConfirm}
                onClose={() => setShowLinkConfirm(false)}
                onConfirm={handleLinkToPlan}
                title="Powiąż z planem"
                message={matchingPlanItem ? `Czy to wpływ stały "${matchingPlanItem.store}"?` : ""}
                confirmLabel="Tak, powiąż"
                cancelLabel="Nie, tylko dodaj"
            />
        </form>
    );
}
