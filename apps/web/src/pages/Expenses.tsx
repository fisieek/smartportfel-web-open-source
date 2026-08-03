import { useEffect, useState } from 'react';
import { Plus, Search, Filter, Trash2, Edit2, ChevronLeft, ChevronRight, Calendar, TrendingUp } from 'lucide-react';
import api from '../lib/api';
import Modal from '../components/ui/Modal';
import AddExpenseModal from '../components/AddExpenseModal';
import AddIncomeModal from '../components/AddIncomeModal';

interface Expense {
    id: number;
    description: string;
    amount: number;
    plnAmount: number;
    currency: string;
    type: string;
    date: string;
    transactionDate?: string;
    category: {
        name: string;
        color: string;
    } | null;
    _side?: string;
}

import { useOutletContext } from 'react-router-dom';

export default function Expenses() {
    const { refreshTrigger } = useOutletContext<{ refreshTrigger: number }>();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchExpenses = async () => {
        setLoading(true);
        try {
            const response = await api.get('/expenses');
            setExpenses(response.data);
        } catch (error) {
            console.error('Failed to fetch expenses', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, [refreshTrigger]);

    const handleDelete = async (id: number) => {
        if (!confirm('Czy na pewno chcesz usunąć tę transakcję?')) return;
        try {
            await api.delete(`/expenses/${id}`);
            fetchExpenses();
        } catch (error) {
            console.error('Failed to delete transaction', error);
        }
    };

    const handleEdit = (expense: Expense) => {
        setEditingExpense(expense);
        if (expense.type === 'income') {
            setIsIncomeModalOpen(true);
        } else {
            setIsAddModalOpen(true);
        }
    };

    const filteredExpenses = expenses.filter(expense =>
        expense.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (expense.category?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-6">
            {isAddModalOpen && (
                <Modal
                    isOpen={isAddModalOpen}
                    onClose={() => {
                        setIsAddModalOpen(false);
                        setEditingExpense(null);
                    }}
                    title={editingExpense ? "Edytuj transakcję" : "Dodaj nowy wydatek"}
                >
                    <AddExpenseModal
                        transaction={editingExpense ? { ...editingExpense, id: String(editingExpense.id), type: editingExpense.type as "income" | "expense" | "internal_transfer", category: editingExpense.category ? { ...editingExpense.category, id: 0 } : undefined, transactionDate: editingExpense.transactionDate || editingExpense.date } : null}
                        onClose={() => {
                            setIsAddModalOpen(false);
                            setEditingExpense(null);
                        }}
                        onSuccess={() => {
                            fetchExpenses();
                            setIsAddModalOpen(false);
                            setEditingExpense(null);
                        }}
                    />
                </Modal>
            )}

            {isIncomeModalOpen && (
                <Modal
                    isOpen={isIncomeModalOpen}
                    onClose={() => {
                        setIsIncomeModalOpen(false);
                        setEditingExpense(null);
                    }}
                    title={editingExpense ? "Edytuj wpływ" : "Dodaj wpływ"}
                >
                    <AddIncomeModal
                        transaction={editingExpense ? { ...editingExpense, id: String(editingExpense.id), type: editingExpense.type as "income" | "expense" | "internal_transfer", category: editingExpense.category ? { ...editingExpense.category, id: 0 } : undefined, transactionDate: editingExpense.transactionDate || editingExpense.date } : null}
                        onClose={() => {
                            setIsIncomeModalOpen(false);
                            setEditingExpense(null);
                        }}
                        onSuccess={() => {
                            fetchExpenses();
                            setIsIncomeModalOpen(false);
                            setEditingExpense(null);
                        }}
                    />
                </Modal>
            )}

            <div className="hidden md:flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-white">Transakcje</h2>
                    <p className="text-gray-400 text-sm">Zarządzaj swoją historią finansową</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsIncomeModalOpen(true)}
                        className="flex items-center gap-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 px-4 py-2 rounded-[5px] transition-all font-bold text-sm"
                    >
                        <TrendingUp size={18} />
                        Dodaj wpływ
                    </button>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="flex items-center gap-2 bg-primary-gradient text-white hover:opacity-90 px-4 py-2 rounded-[5px] transition-all shadow-glow-primary font-bold text-sm active:scale-95"
                    >
                        <Plus size={18} />
                        Dodaj wydatek
                    </button>
                </div>
            </div>

            {/* Search and Filter Bar */}
            <div className="bg-surface/50 border border-white/5 rounded-[5px] p-4 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Szukaj po sklepie lub kategorii..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-surface/50 border border-white/10 rounded-[5px] pl-10 pr-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors"
                    />
                </div>
                <div className="flex gap-2">
                    <button className="px-4 py-2.5 bg-surface/50 border border-white/10 rounded-[5px] text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
                        <Calendar size={18} />
                        <span className="hidden md:inline">Data</span>
                    </button>
                    <button className="px-4 py-2.5 bg-surface/50 border border-white/10 rounded-[5px] text-gray-300 hover:text-white flex items-center gap-2 transition-colors">
                        <Filter size={18} />
                        <span className="hidden md:inline">Filtruj</span>
                    </button>
                </div>
            </div>

            {/* Expenses List */}
            <div className="bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/5 bg-surface">
                                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Data</th>
                                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Sklep</th>
                                <th className="text-left py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Kategoria</th>
                                <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Kwota</th>
                                <th className="text-right py-4 px-6 text-xs font-semibold text-gray-400 uppercase tracking-wider">Akcje</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="py-8 text-center text-gray-500">Ładowanie...</td>
                                </tr>
                            ) : filteredExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-500">
                                            <div className="bg-white/5 p-4 rounded-full mb-3">
                                                <Filter size={24} />
                                            </div>
                                            <p>Brak transakcji spełniających kryteria</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredExpenses.map((expense) => (
                                    <tr key={expense.id} className="group hover:bg-white/5 transition-colors">
                                        <td className="py-4 px-6 text-sm text-gray-400">
                                            {new Date(expense.transactionDate || expense.date).toLocaleDateString('pl-PL')}
                                        </td>
                                        <td className="py-4 px-6 text-sm text-white font-medium">
                                            {expense.description}
                                        </td>
                                        <td className="py-4 px-6 text-sm">
                                            {expense.category ? (
                                                <span
                                                    className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium"
                                                    style={{
                                                        backgroundColor: `${expense.category.color}20`,
                                                        color: expense.category.color
                                                    }}
                                                >
                                                    {expense.category.name}
                                                </span>
                                            ) : (
                                                <span className="text-gray-500 italic text-xs">
                                                    {expense.type === 'income' ? expense.description : 'Inne'}
                                                </span>
                                            )}
                                        </td>
                                        <td className={`py-4 px-6 text-sm font-bold text-right ${(expense.type === 'income' || expense._side === 'exchange_target') ? 'text-primary' : 'text-white'}`}>
                                            <div className="flex flex-col items-end leading-tight">
                                                <span>
                                                    {(expense.type === 'income' || expense._side === 'exchange_target') ? '+' : '-'}
                                                    {Number(expense.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {expense.currency || 'PLN'}
                                                </span>
                                                {(expense.currency && expense.currency !== 'PLN') && (
                                                    <span className="text-[10px] text-gray-500 font-normal italic">
                                                        ({(expense.type === 'income' || expense._side === 'exchange_target') ? '+' : '-'}
                                                        {Number(expense.plnAmount || expense.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEdit(expense)}
                                                    className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                    title="Edytuj"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(expense.id)}
                                                    className="p-2 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                                                    title="Usuń"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Simple Pagination Placeholder */}
            {!loading && filteredExpenses.length > 0 && (
                <div className="flex justify-between items-center text-sm text-gray-500 px-2">
                    <p>Pokazano {filteredExpenses.length} wyników</p>
                    <div className="flex gap-2">
                        <button disabled className="p-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed">
                            <ChevronLeft size={16} />
                        </button>
                        <button disabled className="p-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div >
    );
}
