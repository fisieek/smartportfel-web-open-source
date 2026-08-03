import { useEffect, useState, useCallback } from 'react';
import { Calendar, Store, ArrowRightLeft, Pencil, TrendingUp } from 'lucide-react';
import api from '../lib/api';
import Modal from './ui/Modal';
import CurrencyExchangeModal from './CurrencyExchangeModal';
import { getDisplayBalances, type DisplayBalance } from '../lib/formatters';

interface AccountHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onEdit?: () => void;
    account: { id: string; name: string; bank: string; balance: number; currency?: string; balances?: DisplayBalance[]; isMultiCurrency?: boolean } | null;
}

interface Expense {
    id: string;
    description: string;
    amount: number;
    plnAmount: number;
    currency: string;
    transactionDate: string;
    store?: string;
    note?: string;
    _side?: 'source' | 'target' | 'exchange_source' | 'exchange_target';
    type: 'expense' | 'savings_transfer' | 'investment_transfer' | 'income' | 'internal_transfer' | 'exchange';
    category?: {
        name: string;
        color: string;
    };
}

export default function AccountHistoryModal({ isOpen, onClose, onEdit, account }: AccountHistoryModalProps) {
    const [transactions, setTransactions] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(false);
    const [showExchangeModal, setShowExchangeModal] = useState(false);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get(`/expenses?personalAccountId=${account?.id}`);
            setTransactions(response.data);
        } catch (error) {
            console.error('Błąd pobierania historii:', error);
        } finally {
            setLoading(false);
        }
    }, [account?.id]);

    useEffect(() => {
        if (isOpen && account) {
            fetchHistory();
        }
    }, [isOpen, account, fetchHistory]);

    if (!account) return null;

    // Saldo w nagłówku: wszystkie waluty konta, nie tylko główna
    const balancesLabel = getDisplayBalances(account)
        .map(b => `${Number(b.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${b.currency}`)
        .join(' • ');

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={account.name}
            subtitle={`${account.bank} • Saldo: ${balancesLabel}`}
            footer={
                <div className="flex justify-between items-center w-full">
                    {(account.isMultiCurrency || account.name === 'Gotówka') && (
                        <button
                            onClick={() => setShowExchangeModal(true)}
                            className="flex items-center gap-2 px-6 py-3.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-2xl font-black hover:bg-blue-500/20 transition-all active:scale-95 uppercase tracking-widest text-xs"
                        >
                            <ArrowRightLeft size={16} />
                            Przewalutowanie
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="px-10 py-3.5 bg-white text-black rounded-2xl font-black hover:bg-gray-200 transition-all shadow-xl shadow-black/20 active:scale-95 uppercase tracking-widest text-xs ml-auto"
                    >
                        Zamknij
                    </button>
                </div>
            }
            headerActions={
                onEdit && (
                    <button
                        onClick={onEdit}
                        className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-[5px] transition-all"
                        title="Edytuj konto"
                    >
                        <Pencil size={18} />
                    </button>
                )
            }
        >
            <div className="pr-1 md:pr-2">
                {loading ? (
                    <div className="text-center py-12 text-white/20 font-black uppercase tracking-widest text-xs animate-pulse">Ładowanie historii...</div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12 text-white/20 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                            <Calendar size={32} className="opacity-30" />
                        </div>
                        <p className="font-black text-[10px] uppercase tracking-widest">Brak historii transakcji dla tego konta</p>
                    </div>
                ) : (
                    <div className="space-y-2 md:space-y-3 pb-2">
                        {transactions.map((tx) => {
                            const isPositive = tx.type === 'income' || tx._side === 'target' || tx._side === 'exchange_target';
                            return (
                                <div key={tx.id} className="bg-white/5 border border-white/5 rounded-2xl p-2.5 md:p-3 flex items-center justify-between hover:bg-white/[0.08] transition-all group">
                                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === 'expense' ? 'bg-rose-500/10 text-rose-500' :
                                            tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-500' :
                                                'bg-blue-500/10 text-blue-500'
                                            }`}>
                                            {tx.type === 'expense' ? <Store size={14} className="md:w-5 md:h-5" /> :
                                                tx.type === 'income' ? <TrendingUp size={14} className="md:w-5 md:h-5" /> :
                                                    <ArrowRightLeft size={14} className="md:w-5 md:h-5" />}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-white font-bold text-[13px] md:text-sm leading-tight truncate">
                                                {tx.description}
                                            </span>
                                            {tx.note && (
                                                <span className="text-white/40 text-[10px] md:text-xs leading-tight truncate mt-0.5 italic">
                                                    {tx.note}
                                                </span>
                                            )}
                                            <div className="flex items-center gap-2 text-[10px] text-white/30 font-medium mt-1">
                                                <Calendar size={10} className="opacity-40" />
                                                {new Date(tx.transactionDate).toLocaleDateString('pl-PL')}
                                                {tx.category && (
                                                    <span className="flex items-center gap-1" style={{ color: tx.category.color }}>
                                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tx.category.color }} />
                                                        {tx.category.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                        <p className={`font-black whitespace-nowrap text-sm md:text-base tabular-nums ${isPositive ? 'text-emerald-400' : 'text-white'}`}>
                                            {isPositive ? '+' : '-'}{Number(tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-[10px] text-white/20 uppercase tracking-widest ml-0.5">{tx.currency || 'PLN'}</span>
                                        </p>
                                        {(tx.currency && tx.currency !== 'PLN') && (
                                            <p className="text-[10px] text-white/20 italic font-medium">
                                                ({isPositive ? '+' : '-'}{Number(tx.plnAmount || tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN)
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {showExchangeModal && (
                    <CurrencyExchangeModal
                        initialAccount={account as any}
                        onClose={() => setShowExchangeModal(false)}
                        onSuccess={() => {
                            setShowExchangeModal(false);
                            fetchHistory();
                        }}
                    />
                )}
            </div>
        </Modal>
    );
}
