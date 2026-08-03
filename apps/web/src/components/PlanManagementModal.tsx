import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface PlanManagementModalProps {
    item: {
        id: string;
        name: string;
        amount: number;
        currency?: string;
        recurringExpenseId?: string;
        personalAccount?: {
            id: string;
            name: string;
            currency: string;
            isMultiCurrency: boolean;
            balances: {
                currency: string;
                balance: number;
            }[];
        };
    };
    onClose: () => void;
    onSuccess: () => void;
}

export default function PlanManagementModal({ item, onClose, onSuccess }: PlanManagementModalProps) {
    const [mode, setMode] = useState<'options' | 'edit' | 'delete'>('options');
    const [amount, setAmount] = useState(item.amount.toString());
    const [currency, setCurrency] = useState(item.currency || 'PLN');
    const [loading, setLoading] = useState(false);
    const { success, error: toastError } = useToast();

    // Determine available currencies
    const availableCurrencies = item.personalAccount
        ? (item.personalAccount.isMultiCurrency
            ? ['PLN', 'EUR', 'USD', 'GBP', 'CHF'] // Or derive from balances if strict
            : [item.personalAccount.currency])
        : ['PLN', 'EUR', 'USD', 'GBP', 'CHF'];

    const handleUpdate = async (updateFuture: boolean) => {
        setLoading(true);
        try {
            await api.post(`/planning/update-item/${item.id}`, {
                amount: parseFloat(amount.replace(',', '.')),
                currency,
                updateFuture
            });
            success('Zaktualizowano pozycję.');
            onSuccess();
            onClose();
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Błąd aktualizacji.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (deleteFuture: boolean) => {
        setLoading(true);
        try {
            const res = await api.post(`/planning/delete-item/${item.id}`, {
                deleteFuture
            });
            // I7: gdy pozycja była opłacona, powiązany wydatek zostaje w Transakcjach — mówimy o tym wprost.
            if (res.data?.keptExpense) {
                success('Usunięto pozycję. Powiązany wydatek pozostał w Transakcjach.');
            } else {
                success('Usunięto pozycję z planu.');
            }
            onSuccess();
            onClose();
        } catch (err: any) {
            toastError(err.response?.data?.message || 'Błąd usuwania.');
        } finally {
            setLoading(false);
        }
    };

    const isRecurring = !!item.recurringExpenseId;

    if (mode === 'edit') {
        return (
            <div className="p-6 md:p-8 space-y-6 flex flex-col h-full">
                <div className="space-y-1 text-center">
                    <h3 className="text-lg font-black text-white uppercase tracking-tight">Edytuj kwotę</h3>
                    <p className="text-gray-400 text-sm font-medium">{item.name}</p>
                </div>

                <div className="space-y-4 flex-1">
                    <div className="bg-white/5 border border-white/5 rounded-[5px] py-2 px-4 space-y-2">
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1 block">Nowa kwota ({currency})</label>
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <Input
                                    type="number"
                                    step="0.01"
                                    autoFocus
                                    className="h-8 bg-transparent border-none text-2xl font-black text-white p-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none shadow-none placeholder:text-white/5"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-2">
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
                            </div>
                        </div>
                    </div>

                    {!isRecurring ? (
                        <Button
                            onClick={() => handleUpdate(false)}
                            disabled={loading}
                            className="w-full bg-white text-black h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all shadow-xl"
                        >
                            Zatwierdź zmianę
                        </Button>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                variant="outline"
                                onClick={() => handleUpdate(false)}
                                disabled={loading}
                                className="w-full bg-white/5 text-white h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all border-white/5"
                            >
                                Tylko dla tego miesiąca
                            </Button>
                            <Button
                                onClick={() => handleUpdate(true)}
                                disabled={loading}
                                className="w-full bg-white text-black h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all shadow-xl"
                            >
                                Dla tego i przyszłych miesięcy
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-center pt-2 mt-auto">
                    <Button variant="ghost" onClick={() => setMode('options')} className="text-gray-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">
                        Wróć
                    </Button>
                </div>
            </div>
        );
    }

    if (mode === 'delete') {
        return (
            <div className="p-6 md:p-8 space-y-6 flex flex-col h-full">
                <div className="flex flex-col items-center text-center space-y-3 mb-2">
                    <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]">
                        <Trash2 size={24} />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-lg font-black text-white tracking-tight uppercase">Usuń pozycję</h3>
                        <p className="text-gray-400 text-xs font-medium leading-relaxed">Czy na pewno chcesz usunąć <span className="text-white font-bold">{item.name}</span>?</p>
                    </div>
                </div>

                <div className="space-y-3 flex-1">
                    {!isRecurring ? (
                        <Button
                            onClick={() => handleDelete(false)}
                            disabled={loading}
                            className="w-full bg-red-500 text-white h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
                        >
                            Tak, usuń
                        </Button>
                    ) : (
                        <div className="space-y-3">
                            <Button
                                variant="outline"
                                onClick={() => handleDelete(false)}
                                disabled={loading}
                                className="w-full bg-white/5 text-white h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-white/10 transition-all border-white/5"
                            >
                                Usuń tylko z tego miesiąca
                            </Button>
                            <Button
                                onClick={() => handleDelete(true)}
                                disabled={loading}
                                className="w-full bg-red-500 text-white h-10 rounded-[5px] font-black uppercase tracking-widest text-[10px] hover:bg-red-600 transition-all shadow-xl shadow-red-500/20"
                            >
                                Usuń z tego i wszystkich przyszłych
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-center pt-2 mt-auto">
                    <Button variant="ghost" onClick={() => setMode('options')} className="text-gray-500 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">
                        Wróć
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8 space-y-4 flex flex-col h-full">
            <button
                onClick={() => setMode('edit')}
                className="w-full group flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-[5px] border border-white/5 transition-all text-left shadow-lg"
            >
                <div className="w-10 h-10 rounded-[5px] bg-white/10 flex items-center justify-center text-white group-hover:scale-110 transition-transform shadow-inner">
                    <Pencil size={20} />
                </div>
                <div>
                    <span className="block text-white font-black uppercase tracking-widest text-xs">Edytuj kwotę</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Zmień plan x {currency}</span>
                </div>
            </button>

            <button
                onClick={() => setMode('delete')}
                className="w-full group flex items-center gap-4 p-4 bg-white/5 hover:bg-red-500/10 rounded-[5px] border border-white/5 hover:border-red-500/20 transition-all text-left shadow-lg"
            >
                <div className="w-10 h-10 rounded-[5px] bg-red-500/10 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform shadow-inner">
                    <Trash2 size={20} />
                </div>
                <div>
                    <span className="block text-white font-black uppercase tracking-widest text-xs">Usuń/Zakończ</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">Usuń z tej listy planowania</span>
                </div>
            </button>

            <div className="flex justify-end pt-4 mt-auto">
                <Button variant="ghost" onClick={onClose} className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest">
                    Zamknij
                </Button>
            </div>
        </div>
    );
}
