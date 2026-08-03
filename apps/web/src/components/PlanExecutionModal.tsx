import { useState, useEffect, useCallback } from 'react';
import { Check, Calendar } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { usePersonalAccounts } from '../hooks/useQueries';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface Transaction {
    id: string;
    description: string;
    amount: number;
    transactionDate: string;
    store?: string;
}

interface PlanExecutionModalProps {
    item: {
        id: string;
        name: string;
        amount: number;
        currency?: string;
        recurringExpenseId?: string;
        personalAccount?: {
            id: string;
            name: string;
        };
        recurringExpense?: {
            type: string;
            personalAccountId?: string;
        };
    };
    month: string;
    year: string;
    onClose: () => void;
    onSuccess: () => void;
}

export default function PlanExecutionModal({ item, month, year, onClose, onSuccess }: PlanExecutionModalProps) {
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState<'decision' | 'link'>('decision');
    const [matchingTransactions, setMatchingTransactions] = useState<Transaction[]>([]);
    const [selectedTransactionId, setSelectedTransactionId] = useState<string>('');
    const [executionDate, setExecutionDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>(
        item.personalAccount?.id || item.recurringExpense?.personalAccountId || ''
    );
    const { error: toastError } = useToast();
    const { data: accountsRaw = [] } = usePersonalAccounts();
    const personalAccounts = (accountsRaw as any[]).filter(acc =>
        !['SAVINGS_ACCOUNT', 'INVESTMENT_ACCOUNT'].includes(acc.type || '')
    );

    const isIncome = item.recurringExpense?.type === 'income';

    const fetchMatchingTransactions = useCallback(async () => {
        try {
            const response = await api.get('/expenses', {
                params: { month, year }
            });
            // Filter transactions that could match (same store or similar description)
            const filtered = response.data.filter((tx: Transaction) =>
                (tx.store?.toLowerCase().includes(item.name.toLowerCase()) ||
                    tx.description.toLowerCase().includes(item.name.toLowerCase())) &&
                tx.id !== item.recurringExpenseId // Avoid linking to the template itself
            );
            setMatchingTransactions(filtered);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        }
    }, [month, year, item.name, item.recurringExpenseId]);

    useEffect(() => {
        if (mode === 'link') {
            fetchMatchingTransactions();
        }
    }, [mode, fetchMatchingTransactions]);

    const handleMarkPaid = async () => {
        if (!selectedAccountId) {
            toastError('Wybierz konto, aby opłacić wydatek');
            return;
        }
        setLoading(true);
        try {
            await api.post(`/planning/mark-paid/${item.id}`, {
                date: executionDate,
                personalAccountId: selectedAccountId
            });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error marking paid:', error);
            toastError(error.response?.data?.message || 'Nie udało się oznaczyć jako opłacone');
        } finally {
            setLoading(false);
        }
    };

    const handleLink = async () => {
        if (!selectedTransactionId) return;
        setLoading(true);
        try {
            await api.post(`/planning/link-transaction/${item.id}`, { expenseId: selectedTransactionId });
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error linking transaction:', error);
            toastError(error.response?.data?.message || 'Nie udało się połączyć transakcji');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-5 md:p-6 space-y-6 flex flex-col h-full">
            <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]">
                    <Calendar size={20} />
                </div>
                <div className="space-y-1">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                        {isIncome ? 'Potwierdź wpływ' : 'Potwierdź realizację'}
                    </h3>
                    <p className="text-gray-400 text-sm max-w-[280px] leading-relaxed mx-auto">
                        <span className="text-white font-bold">{item.name}</span>
                    </p>
                </div>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto px-1 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3">
                    {/* Date Area */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">Data płatności</label>
                        <div className="relative group">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-white transition-colors pointer-events-none" size={14} />
                            <Input
                                type="date"
                                value={executionDate}
                                onChange={(e) => setExecutionDate(e.target.value)}
                                className="h-10 pl-9 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px] [color-scheme:dark] cursor-pointer"
                                onClick={(e) => (e.target as any).showPicker?.()}
                            />
                        </div>
                    </div>

                    {/* Account Area */}
                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 ml-1">Konto płatności</label>
                        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                            <SelectTrigger className="h-10 bg-white/5 border-white/5 text-xs font-bold text-white/90 rounded-[5px]">
                                <SelectValue placeholder="Wybierz konto" />
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                                {personalAccounts.map(acc => (
                                    <SelectItem key={acc.id} value={acc.id} className="text-xs">
                                        {acc.name} ({Number(acc.balance).toLocaleString('pl-PL')} {acc.currency})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleMarkPaid}
                        disabled={loading || mode === 'link'}
                        className={`flex-1 h-9 rounded-[5px] transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 ${mode === 'decision'
                            ? 'bg-white text-black hover:bg-gray-200 shadow-xl'
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                    >
                        <Check size={14} strokeWidth={3} />
                        {isIncome ? 'Zaksięguj wpłatę' : 'Zaksięguj wydatek'}
                    </Button>

                    <Button
                        variant="ghost"
                        onClick={() => setMode(mode === 'link' ? 'decision' : 'link')}
                        className={`flex-1 h-9 rounded-[5px] transition-all font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 ${mode === 'link'
                            ? 'bg-white text-black hover:bg-gray-200 shadow-xl'
                            : 'bg-white/5 text-white/40 hover:bg-white/10'
                            }`}
                    >
                        <Calendar size={14} strokeWidth={2.5} />
                        {isIncome ? 'Połącz z wpłatą' : 'Połącz z transakcją'}
                    </Button>
                </div>

                {/* Rozwinięcie listy linkowania */}
                {mode === 'link' && (
                    <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="bg-white/5 border border-white/5 rounded-[5px] overflow-hidden">
                            <div className="p-3 bg-white/5 border-b border-white/5 flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Wybierz transakcję</span>
                            </div>
                            <div className="max-h-[200px] overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {matchingTransactions.length > 0 ? (
                                    matchingTransactions.map(tx => (
                                        <div
                                            key={tx.id}
                                            onClick={() => setSelectedTransactionId(tx.id)}
                                            className={`p-3 rounded-[5px] border transition-all cursor-pointer flex items-center justify-between ${selectedTransactionId === tx.id
                                                ? 'bg-white/10 border-white/40'
                                                : 'bg-white/5 border-transparent hover:bg-white/10'
                                                }`}
                                        >
                                            <div className="min-w-0 pr-3">
                                                <div className={`text-xs font-bold truncate ${selectedTransactionId === tx.id ? 'text-white' : 'text-gray-300'}`}>{tx.store || tx.description}</div>
                                                <div className="text-[10px] text-gray-500">{new Date(tx.transactionDate).toLocaleDateString('pl-PL')}</div>
                                            </div>
                                            <div className={`text-xs font-black whitespace-nowrap ${selectedTransactionId === tx.id ? 'text-emerald-400' : 'text-gray-400'}`}>
                                                {Number(tx.amount).toLocaleString('pl-PL')} {item.currency || 'PLN'}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-6 text-center">
                                        <p className="text-gray-500 text-[10px] italic">Brak pasujących transakcji.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedTransactionId && (
                            <Button
                                onClick={handleLink}
                                disabled={loading}
                                className="w-full mt-3 h-10 bg-white text-black font-black uppercase tracking-widest text-[10px] rounded-[5px] hover:bg-gray-200 transition-all shadow-xl"
                            >
                                Zatwierdź połączenie
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex justify-end pt-2 mt-auto">
                <Button variant="ghost" onClick={onClose} className="h-9 px-4 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-[10px] uppercase tracking-widest">
                    Anuluj
                </Button>
            </div>
        </div>
    );
}
