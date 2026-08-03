import { useState, useEffect } from 'react';
import { Check, Calendar, Plus, Pencil } from 'lucide-react';
import api from '../lib/api';
import Modal from './ui/Modal';
import ConfirmModal from './ui/ConfirmModal';
import PlanExecutionModal from './PlanExecutionModal';
import PlanManagementModal from './PlanManagementModal';
import AdhocPlanModal from './AdhocPlanModal';
import CategoryBadge from './ui/CategoryBadge';
import { useToast } from '../context/ToastContext';
import { useCurrency } from '../context/CurrencyContext';

interface PlanItem {
    id: string;
    name: string;
    amount: number;
    currency: string;
    isDone: boolean;
    recurringExpenseId?: string;
    linkedRealExpenseId?: string;
    category?: {
        name: string;
        color: string;
        icon?: string;
    };
    plannedDate?: string;
    planned_date?: string;
    recurringExpense?: {
        type: string;
        category?: {
            name: string;
            color: string;
            icon?: string;
        };
        transactionDate?: string;
    };
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
}

interface LoanInstallment {
    mortgageId: string;
    name: string;
    loanType: string;
    amount: number | null;
    currency: string;
}

interface MonthlyPlan {
    id: string;
    month: number;
    year: number;
    items: PlanItem[];
    loanInstallments?: LoanInstallment[];
}

const LOAN_TYPE_LABELS: Record<string, string> = {
    MORTGAGE: 'Hipoteczny',
    CASH: 'Gotówkowy',
    CAR: 'Samochodowy',
    OTHER: 'Inny',
};

export default function MonthlyPlanningWidget({ refreshTrigger, timeFilter, onSuccess, hideTitle }: { refreshTrigger?: number, timeFilter?: string, onSuccess?: () => void, hideTitle?: boolean }) {
    const [plan, setPlan] = useState<MonthlyPlan | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<PlanItem | null>(null);
    const [managementItem, setManagementItem] = useState<PlanItem | null>(null);
    const [itemToUnlink, setItemToUnlink] = useState<PlanItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isAdhocModalOpen, setIsAdhocModalOpen] = useState(false);
    const [isManagementModalOpen, setIsManagementModalOpen] = useState(false);
    const [adhocType, setAdhocType] = useState<'income' | 'expense'>('expense');
    const { success, error: toastError } = useToast();
    const { displayCurrency, convertFromPLN } = useCurrency();

    // Kwoty PLN przeliczamy na walutę wyświetlania; pozycje w innych walutach zostają w oryginale
    const formatPlanAmount = (item: PlanItem) => {
        const cur = item.currency || 'PLN';
        if (cur === 'PLN' && displayCurrency !== 'PLN') {
            return { value: convertFromPLN(Number(item.amount)), currency: displayCurrency };
        }
        return { value: Number(item.amount), currency: cur };
    };

    const CustomCheckbox = ({ isDone, onClick }: { isDone: boolean, onClick: (e: React.MouseEvent) => void }) => (
        <div
            onClick={onClick}
            className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${isDone
                ? "bg-green-500 border-green-500 text-white"
                : "border-white/20 bg-transparent hover:border-white/40"
                }`}
        >
            {isDone && <Check size={12} strokeWidth={4} />}
        </div>
    );

    const fetchPlan = async () => {
        try {
            const [year, month] = (timeFilter || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-');
            const response = await api.get('/planning/monthly-plan', {
                params: { month, year }
            });
            setPlan(response.data);
        } catch (err: any) {
            console.error('Error fetching monthly plan:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPlan();
    }, [refreshTrigger, timeFilter]);

    const toggleItem = async (item: PlanItem, e: React.MouseEvent) => {
        e.stopPropagation();

        if (item.isDone && item.linkedRealExpenseId) {
            setItemToUnlink(item);
            return;
        }

        try {
            await api.post(`/planning/toggle-item/${item.id}`, { isDone: !item.isDone });
            if (plan) {
                setPlan({
                    ...plan,
                    items: plan.items.map(i =>
                        i.id === item.id ? { ...i, isDone: !i.isDone } : i
                    )
                });
            }
        } catch (err) {
            console.error('Error toggling item:', err);
            toastError('Błąd podczas aktualizacji statusu.');
        }
    };

    const handleConfirmUnlink = async () => {
        if (!itemToUnlink) return;
        try {
            await api.post(`/planning/unlink-item/${itemToUnlink.id}`);
            success('Pomyślnie odłączono transakcję.');
            fetchPlan();
            if (onSuccess) onSuccess();
        } catch {
            toastError('Błąd podczas odłączania transakcji.');
        } finally {
            setItemToUnlink(null);
        }
    };

    const handleManageItem = (item: PlanItem) => {
        if (item.isDone) {
            const isIncome = item.recurringExpense?.type === 'income' || item.name.toLowerCase().includes('wpływ');
            toastError(`Nie możesz edytować wykonanych ${isIncome ? 'wpływów' : 'wydatków'}.`);
            return;
        }
        setManagementItem(item);
        setIsManagementModalOpen(true);
    };

    const handleItemClick = (item: PlanItem) => {
        if (item.isDone || item.linkedRealExpenseId) return;
        setSelectedItem(item);
        setIsModalOpen(true);
    };

    const getDeadlineDate = (templateDate: string | Date, m: number, y: number) => {
        const d = new Date(templateDate);
        const day = d.getDate();
        // Month in Date is 0-indexed, so m-1
        let deadline = new Date(y, m - 1, day);

        // Jeśli dzień "wystrzelił" poza miesiąc (np. 31 luty -> 3 marzec), 
        // cofamy do ostatniego dnia pożądanego miesiąca
        if (deadline.getMonth() !== m - 1) {
            deadline = new Date(y, m, 0);
        }

        return deadline.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    };

    if (loading) return <div className="p-8 text-center text-white/20 uppercase tracking-[0.2em] text-[10px] font-black animate-pulse">Inicjalizacja planu...</div>;

    const incomes = plan?.items.filter(i => i.recurringExpense?.type === 'income') || [];
    const expenses = plan?.items.filter(i => i.recurringExpense?.type === 'expense' || !i.recurringExpense) || [];

    return (
        <div className={hideTitle ? "" : "space-y-4"}>
            {!hideTitle && <h3 className="text-xl font-bold text-white px-1">Planowanie miesiąca</h3>}

            <div className="bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden shadow-2xl">
                {/* income items */}
                <div className="divide-y divide-white/5">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/5 flex justify-between items-center">
                        <h4 className="text-[9px] font-black text-white uppercase tracking-widest">Zaplanowane wpływy</h4>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { setAdhocType('income'); setIsAdhocModalOpen(true); }}
                                className="flex items-center gap-2 px-2 py-1 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white group"
                                title="Zaplanuj nowy wpływ"
                            >
                                <Plus size={14} strokeWidth={3} />
                                <span className="text-[9px] font-bold uppercase tracking-wide">Dodaj</span>
                            </button>
                            <span className="text-[9px] font-bold text-gray-500">{incomes.filter(i => i.isDone).length}/{incomes.length}</span>
                        </div>
                    </div>
                    {incomes.length > 0 ? (
                        <div className="p-1">
                            {incomes.map(item => {
                                return (
                                    <div
                                        key={item.id}
                                        className={`flex items-start justify-between py-2.5 px-3 bg-[#1a1a1c] border border-white/5 rounded-lg transition-all group/item mb-1 last:mb-0`}
                                    >
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className="mt-0.5">
                                                <CustomCheckbox
                                                    isDone={item.isDone}
                                                    onClick={(e) => {
                                                        if (!item.isDone) {
                                                            handleItemClick(item);
                                                        } else {
                                                            toggleItem(item, e);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1 pr-2">
                                                <p className={`text-sm font-medium text-white truncate transition-opacity mb-1 ${item.isDone ? 'opacity-90' : ''}`}>{item.name}</p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CategoryBadge
                                                        name={item.category?.name || item.recurringExpense?.category?.name || 'Wpływ'}
                                                        color={item.category?.color || item.recurringExpense?.category?.color}
                                                        icon={item.category?.icon || item.recurringExpense?.category?.icon}
                                                        small
                                                    />
                                                    {(item.plannedDate || (item as any).planned_date || item.recurringExpense?.transactionDate) && (
                                                        <div className={`flex items-center gap-1 text-[10px] font-medium text-gray-400 transition-opacity ${item.isDone ? 'opacity-90' : ''}`}>
                                                            <Calendar size={10} />
                                                            <span>{getDeadlineDate(item.plannedDate || (item as any).planned_date || item.recurringExpense?.transactionDate || '', plan?.month || new Date().getMonth() + 1, plan?.year || new Date().getFullYear())}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1">
                                            <p className={`text-sm font-black text-emerald-400 text-right ${item.isDone ? 'opacity-60' : ''}`}>
                                                +{formatPlanAmount(item).value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] uppercase opacity-40 text-white">{formatPlanAmount(item).currency}</span>
                                            </p>

                                            {/* Actions visible on hover, absolute positioned or static? Static better for mobile touch targets but sticking to hover pattern for desktop */}
                                            <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleManageItem(item); }}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-gray-500 text-[10px] italic opacity-50">Brak zaplanowanych wpływów</div>
                    )}
                </div>

                {/* Sekcja Wydatków Stałych */}
                <div className="divide-y divide-white/5 border-t border-white/5">
                    <div className="px-3 py-2 bg-white/[0.03] border-b border-white/5 flex justify-between items-center">
                        <h4 className="text-[9px] font-black text-white uppercase tracking-widest">Zaplanowane wydatki</h4>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => { setAdhocType('expense'); setIsAdhocModalOpen(true); }}
                                className="flex items-center gap-2 px-2 py-1 hover:bg-white/10 rounded-md transition-colors text-white/40 hover:text-white group"
                                title="Zaplanuj nowy wydatek"
                            >
                                <Plus size={14} strokeWidth={3} />
                                <span className="text-[9px] font-bold uppercase tracking-wide">Dodaj</span>
                            </button>
                            <span className="text-[9px] font-bold text-gray-500">{expenses.filter(e => e.isDone).length}/{expenses.length}</span>
                        </div>
                    </div>
                    {expenses.length > 0 ? (
                        <div className="p-1">
                            {expenses.map(item => {
                                return (
                                    <div
                                        key={item.id}
                                        className={`flex items-start justify-between py-2.5 px-3 bg-[#1a1a1c] border border-white/5 rounded-lg transition-all group/item mb-1 last:mb-0`}
                                    >
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className="mt-0.5">
                                                <CustomCheckbox
                                                    isDone={item.isDone}
                                                    onClick={(e) => {
                                                        if (!item.isDone) {
                                                            handleItemClick(item);
                                                        } else {
                                                            toggleItem(item, e);
                                                        }
                                                    }}
                                                />
                                            </div>
                                            <div className="min-w-0 flex-1 pr-2">
                                                <p className={`text-sm font-medium text-white truncate transition-opacity mb-1 ${item.isDone ? 'opacity-90' : ''}`}>{item.name}</p>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <CategoryBadge
                                                        name={item.category?.name || item.recurringExpense?.category?.name || 'Opłata stała'}
                                                        color={item.category?.color || item.recurringExpense?.category?.color}
                                                        icon={item.category?.icon || item.recurringExpense?.category?.icon}
                                                        small
                                                    />
                                                    {(item.plannedDate || (item as any).planned_date || item.recurringExpense?.transactionDate) && (
                                                        <div className={`flex items-center gap-1 text-[10px] font-medium text-gray-400 transition-opacity ${item.isDone ? 'opacity-90' : ''}`}>
                                                            <Calendar size={10} />
                                                            <span>{getDeadlineDate(item.plannedDate || (item as any).planned_date || item.recurringExpense?.transactionDate || '', plan?.month || new Date().getMonth() + 1, plan?.year || new Date().getFullYear())}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1">
                                            <p className={`text-sm font-black text-white text-right ${item.isDone ? 'opacity-60' : ''}`}>
                                                -{formatPlanAmount(item).value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] uppercase opacity-40">{formatPlanAmount(item).currency}</span>
                                            </p>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 opacity-100 lg:opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleManageItem(item); }}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition-all"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="p-4 text-center text-gray-500 text-[10px] italic opacity-50">Brak zaplanowanych wydatków</div>
                    )}
                </div>

                {/* Raty kredytów (informacyjnie, read-only — spłatę rejestrujesz w module Kredyty) */}
                {plan?.loanInstallments && plan.loanInstallments.length > 0 && (
                    <div className="divide-y divide-white/5 border-t border-white/5">
                        <div className="px-3 py-2 bg-white/[0.03] border-b border-white/5 flex justify-between items-center">
                            <h4 className="text-[9px] font-black text-white uppercase tracking-widest">Raty kredytów</h4>
                            <span className="text-[9px] font-bold text-gray-500">
                                {(() => {
                                    const sumPln = plan.loanInstallments!.reduce((s, l) => s + (l.amount != null ? Number(l.amount) : 0), 0);
                                    const val = displayCurrency !== 'PLN' ? convertFromPLN(sumPln) : sumPln;
                                    return `${val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${displayCurrency}`;
                                })()}
                            </span>
                        </div>
                        <div className="p-1">
                            {plan.loanInstallments.map(loan => {
                                const hasAmount = loan.amount != null;
                                const val = hasAmount ? (displayCurrency !== 'PLN' ? convertFromPLN(Number(loan.amount)) : Number(loan.amount)) : 0;
                                return (
                                    <div key={loan.mortgageId} className="flex items-center justify-between py-2.5 px-3 bg-[#1a1a1c] border border-white/5 rounded-lg mb-1 last:mb-0">
                                        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                                            <p className="text-sm font-medium text-white truncate">{loan.name}</p>
                                            <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-[5px] text-amber-400 text-[9px] font-bold uppercase tracking-wide shrink-0">
                                                {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
                                            </span>
                                        </div>
                                        {hasAmount ? (
                                            <p className="text-sm font-black text-amber-300 text-right shrink-0">
                                                {val.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] uppercase opacity-40 text-white">{displayCurrency}</span>
                                            </p>
                                        ) : (
                                            <p className="text-[9px] text-gray-500 italic text-right shrink-0 max-w-[140px] leading-tight">
                                                uzupełnij parametry, aby&nbsp;policzyć ratę
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {isModalOpen && selectedItem && (
                <Modal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    title={selectedItem?.recurringExpense?.type === 'income' ? 'Zaksięguj wpływ stały' : 'Opłać wydatek stały'}
                >
                    <PlanExecutionModal
                        item={selectedItem}
                        month={(timeFilter || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-')[1]}
                        year={(timeFilter || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-')[0]}
                        onClose={() => setIsModalOpen(false)}
                        onSuccess={() => {
                            fetchPlan();
                            setIsModalOpen(false);
                            success('Pomyślnie zrealizowano pozycję planu!');
                            if (onSuccess) onSuccess();
                        }}
                    />
                </Modal>
            )}

            {isAdhocModalOpen && (
                <Modal
                    isOpen={isAdhocModalOpen}
                    onClose={() => setIsAdhocModalOpen(false)}
                    title={adhocType === 'income' ? 'Planuj wpływ' : 'Planuj wydatek'}
                >
                    <AdhocPlanModal
                        month={(timeFilter || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-')[1]}
                        year={(timeFilter || `${new Date().getFullYear()}-${new Date().getMonth() + 1}`).split('-')[0]}
                        type={adhocType}
                        onClose={() => setIsAdhocModalOpen(false)}
                        onSuccess={() => {
                            fetchPlan();
                            setIsAdhocModalOpen(false);
                            if (onSuccess) onSuccess();
                        }}
                    />
                </Modal>
            )}

            {isManagementModalOpen && managementItem && (
                <Modal
                    isOpen={isManagementModalOpen}
                    onClose={() => setIsManagementModalOpen(false)}
                    title="Zarządzaj pozycją"
                >
                    <PlanManagementModal
                        item={managementItem}
                        onClose={() => setIsManagementModalOpen(false)}
                        onSuccess={() => {
                            fetchPlan();
                            setIsManagementModalOpen(false);
                        }}
                    />
                </Modal>
            )}

            <ConfirmModal
                isOpen={!!itemToUnlink}
                onClose={() => setItemToUnlink(null)}
                onConfirm={handleConfirmUnlink}
                title={itemToUnlink?.recurringExpense?.type === 'income' ? 'Anuluj wpływ' : 'Anuluj wydatek'}
                message={`Czy na pewno chcesz anulować wykonanie tego ${itemToUnlink?.recurringExpense?.type === 'income' ? 'wpływu' : 'wydatku'}? Powiązana transakcja zostanie usunięta.`}
                confirmLabel="Tak, anuluj"
                variant="danger"
            />
        </div>
    );
}
