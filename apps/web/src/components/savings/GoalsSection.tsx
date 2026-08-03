import { useState } from 'react';
import { Plus, Target, Trash2, ArrowRightLeft, Check, Pencil } from 'lucide-react';
import api from '../../lib/api';
import { goalProgress } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useSavingsGoals, useSavingsGoalTransactions, useInvalidateQueries } from '../../hooks/useQueries';
import type { SavingsGoal } from '../../hooks/useQueries';
import Modal from '../ui/Modal';
import ConfirmModal from '../ui/ConfirmModal';

/**
 * Samowystarczalna sekcja celów oszczędnościowych: lista, dodawanie/edycja,
 * transfer między celami i podgląd historii wpłat. Pobiera własne dane (Query)
 * i po mutacjach woła invalidateSavingsData (suma zależy od stanu celów).
 */
export default function GoalsSection() {
    const { success, error: toastError } = useToast();
    const { invalidateSavingsData } = useInvalidateQueries();

    const { data: goalsData } = useSavingsGoals();
    const goals = goalsData ?? [];

    const [isAddingGoal, setIsAddingGoal] = useState(false);
    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
    const [newGoal, setNewGoal] = useState({ name: '', targetAmount: '', isMain: false });
    const [submittingGoal, setSubmittingGoal] = useState(false);

    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferData, setTransferData] = useState({ fromGoalId: '', toGoalId: '', amount: '' });

    const [viewingGoal, setViewingGoal] = useState<SavingsGoal | null>(null);
    const { data: goalTransactionsData, isLoading: loadingGoalTx } = useSavingsGoalTransactions(viewingGoal?.id ?? null);
    const goalTransactions = goalTransactionsData ?? [];

    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => { } });

    const handleAddGoal = async () => {
        if (!newGoal.name || !newGoal.targetAmount) {
            toastError('Wypełnij nazwę i kwotę celu');
            return;
        }

        setSubmittingGoal(true);
        try {
            if (editingGoalId) {
                await api.patch(`/savings-goals/${editingGoalId}`, newGoal);
            } else {
                await api.post('/savings-goals', newGoal);
            }
            invalidateSavingsData();
            setNewGoal({ name: '', targetAmount: '', isMain: false });
            setIsAddingGoal(false);
            setEditingGoalId(null);
        } catch (error: any) {
            console.error('Błąd zapisywania celu:', error);
            toastError('Nie udało się zapisać celu');
        } finally {
            setSubmittingGoal(false);
        }
    };

    const handleEditGoal = (goal: SavingsGoal) => {
        setNewGoal({
            name: goal.name,
            targetAmount: goal.targetAmount.toString(),
            isMain: goal.isMain ?? false
        });
        setEditingGoalId(goal.id);
        setIsAddingGoal(true);
    };

    const handleCancelGoalEdit = () => {
        setNewGoal({ name: '', targetAmount: '', isMain: false });
        setEditingGoalId(null);
        setIsAddingGoal(false);
    };

    const handleTransfer = async () => {
        if (!transferData.fromGoalId || !transferData.toGoalId || !transferData.amount) {
            toastError('Wypełnij wszystkie pola');
            return;
        }

        try {
            await api.post('/savings-goals/transfer', {
                fromGoalId: transferData.fromGoalId,
                toGoalId: transferData.toGoalId,
                amount: Number(transferData.amount)
            });
            invalidateSavingsData();
            setTransferData({ fromGoalId: '', toGoalId: '', amount: '' });
            setShowTransferModal(false);
            success('Środki zostały przelane!');
        } catch (error: any) {
            console.error('Błąd transferu:', error);
            toastError(error.response?.data?.error || 'Nie udało się wykonać transferu');
        }
    };

    const handleDeleteGoal = (id: string) => {
        const goal = goals.find(g => g.id === id);
        setConfirmConfig({
            isOpen: true,
            title: 'Usuń cel',
            message: `Czy na pewno chcesz usunąć cel "${goal?.name}"? Środki zostaną bezpiecznie przeniesione do celu głównego.`,
            onConfirm: async () => {
                try {
                    await api.delete(`/savings-goals/${id}`);
                    invalidateSavingsData();
                    setIsAddingGoal(false);
                    setEditingGoalId(null);
                    success('Cel został usunięty');
                } catch (error) {
                    console.error('Błąd usuwania celu:', error);
                    toastError('Nie udało się usunąć celu');
                }
            }
        });
    };

    return (
        <>
            {/* Sekcja Celów */}
            <div className="mt-12">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-1 mb-8">
                    <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap">Cele Oszczędnościowe</h3>
                    <div className="hidden sm:block flex-1 h-px bg-white/5"></div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {goals.length >= 2 && (
                            <button
                                onClick={() => setShowTransferModal(true)}
                                className="text-[8px] font-black text-white/40 hover:text-white uppercase tracking-[0.2em] border border-white/10 rounded-[4px] px-3 py-1.5 transition-all flex items-center gap-2"
                            >
                                <ArrowRightLeft size={12} strokeWidth={3} />
                                <span>Przenieś środki</span>
                            </button>
                        )}
                        <button
                            onClick={() => {
                                setEditingGoalId(null);
                                setNewGoal({ name: '', targetAmount: '', isMain: false });
                                setIsAddingGoal(true);
                            }}
                            className="text-[8px] font-black text-black bg-white hover:bg-white/90 uppercase tracking-[0.2em] rounded-[2px] px-3 py-1.5 transition-all flex items-center gap-2 shadow-lg"
                        >
                            <Plus size={12} strokeWidth={4} />
                            <span>Dodaj cel</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal dodawania/edycji celu */}
            <Modal isOpen={isAddingGoal} onClose={handleCancelGoalEdit} title={editingGoalId ? 'Edytuj cel oszczędnościowy' : 'Nowy cel oszczędnościowy'}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Nazwa celu</label>
                        <input
                            type="text"
                            value={newGoal.name}
                            onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                            placeholder="np. Wakacje 2024"
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3.5 text-white placeholder:text-white/20 focus:outline-none focus:border-primary/50 focus:bg-surface transition-all font-medium"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Kwota docelowa (PLN)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">PLN</span>
                            <input
                                type="number"
                                value={newGoal.targetAmount}
                                onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                                placeholder="5000"
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-14 pr-4 py-3.5 text-white placeholder:text-white/10 focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-black"
                            />
                        </div>
                    </div>
                </div>
                <div className="mt-6">
                    <label className="flex items-center gap-3 cursor-pointer group w-fit">
                        <div className="relative">
                            <input
                                type="checkbox"
                                checked={newGoal.isMain}
                                onChange={(e) => setNewGoal({ ...newGoal, isMain: e.target.checked })}
                                className="sr-only peer"
                            />
                            <div className="w-6 h-6 bg-white/5 border border-white/10 rounded-lg peer-checked:bg-white peer-checked:border-white transition-all flex items-center justify-center shadow-sm">
                                {newGoal.isMain && <Check size={14} className="text-black" strokeWidth={4} />}
                            </div>
                        </div>
                        <span className="text-sm font-bold text-white/60 group-hover:text-white transition-colors uppercase tracking-widest text-[10px]">Ustaw jako główny cel (zbieraj tu nadwyżki)</span>
                    </label>
                </div>
                <div className="flex gap-4 mt-8 justify-end items-center">
                    {editingGoalId && newGoal.name !== "Poduszka finansowa" && (
                        <button
                            onClick={() => handleDeleteGoal(editingGoalId)}
                            className="mr-auto py-3 px-4 rounded-[5px] font-bold text-rose-500 hover:bg-rose-500/10 transition-all text-[10px] uppercase tracking-widest flex items-center gap-2"
                        >
                            <Trash2 size={14} />
                            <span>Usuń cel</span>
                        </button>
                    )}
                    <button
                        onClick={handleCancelGoalEdit}
                        className="py-3 px-8 rounded-[5px] font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleAddGoal}
                        disabled={submittingGoal}
                        className="px-10 py-3.5 bg-white/5 border border-white/10 text-white rounded-[5px] font-bold hover:bg-white/10 transition-all active:scale-95 text-xs uppercase tracking-widest"
                    >
                        {submittingGoal ? 'Zapisywanie...' : (editingGoalId ? 'Zapisz zmiany' : 'Dodaj cel')}
                    </button>
                </div>
            </Modal>

            {/* Lista Celów */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {
                    goals.length === 0 ? (
                        <div className="col-span-full bg-white/5 border border-white/5 border-dashed rounded-[5px] p-8 text-center">
                            <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">Brak wyznaczonych celów</p>
                        </div>
                    ) : (
                        goals.map((goal) => {
                            const progress = goalProgress(Number(goal.currentAmount), Number(goal.targetAmount));
                            return (
                                <div
                                    key={goal.id}
                                    onClick={() => setViewingGoal(goal)}
                                    className="group relative bg-white/5 border border-white/5 rounded-[5px] p-4 transition-all cursor-pointer hover:bg-white/[0.08] hover:shadow-2xl hover:shadow-black/40 flex flex-col justify-between"
                                >
                                    <div className="mb-4">
                                        <div className="flex items-start justify-between mb-4 min-w-0">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-8 w-8 rounded-[5px] bg-[#1eb3ab]/10 text-[#1eb3ab] flex items-center justify-center flex-shrink-0">
                                                    <Target size={16} strokeWidth={2.5} />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-white font-bold text-xs leading-tight whitespace-normal break-words">{goal.name}</h3>
                                                    {goal.isMain && (
                                                        <span className="text-[7px] font-black uppercase tracking-[0.1em] text-[#1eb3ab]/60">Główny cel</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleEditGoal(goal);
                                                    }}
                                                    className="p-1.5 text-white/20 hover:text-white transition-colors"
                                                    title="Edytuj cel"
                                                >
                                                    <Pencil size={12} />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteGoal(goal.id);
                                                    }}
                                                    className="p-1.5 text-white/20 hover:text-rose-500 transition-colors"
                                                    title="Usuń cel"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-white/20 text-[8px] font-black uppercase tracking-widest leading-none mb-1.5">Zgromadzono</p>
                                            <div className="flex items-baseline gap-1.5 flex-wrap">
                                                <span className="text-lg font-black tracking-tight text-white">
                                                    {Number(goal.currentAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                <span className="text-[11px] font-bold text-white/40 tracking-tight">
                                                    / {Number(goal.targetAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-[0.15em] gap-2">
                                                <span className={progress.exceeded ? 'text-emerald-400 truncate' : 'text-white/35 truncate'}>
                                                    {progress.exceeded
                                                        ? 'Cel przekroczony'
                                                        : `Zostało ${progress.remaining.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN`}
                                                </span>
                                                <span className={progress.exceeded ? 'text-emerald-400 shrink-0' : 'text-[#1eb3ab] shrink-0'}>
                                                    {progress.pct}%
                                                </span>
                                            </div>
                                            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full transition-all duration-1000 ${progress.exceeded ? 'bg-emerald-400' : 'bg-[#1eb3ab]'}`}
                                                    style={{ width: `${progress.barWidth}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )
                }
            </div>

            {/* Modal Podglądu Celu (lista wpłat) */}
            <Modal
                isOpen={!!viewingGoal}
                onClose={() => setViewingGoal(null)}
                title={viewingGoal?.name || 'Cel oszczędnościowy'}
                subtitle={viewingGoal ? `Zgromadzono ${Number(viewingGoal.currentAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} z ${Number(viewingGoal.targetAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN` : undefined}
            >
                {viewingGoal && (() => {
                    const viewProgress = goalProgress(Number(viewingGoal.currentAmount), Number(viewingGoal.targetAmount));
                    return (
                        <div className="space-y-5">
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-[0.2em]">
                                    <span className="text-white/30">Postęp</span>
                                    <span className={viewProgress.exceeded ? 'text-emerald-400' : 'text-[#1eb3ab]'}>
                                        {viewProgress.exceeded && (
                                            <span className="mr-1.5 px-1 py-0.5 rounded-[3px] bg-emerald-400/10 text-emerald-400">Cel przekroczony</span>
                                        )}
                                        {viewProgress.pct}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-700 ${viewProgress.exceeded ? 'bg-emerald-400' : 'bg-[#1eb3ab]'}`}
                                        style={{ width: `${viewProgress.barWidth}%` }}
                                    />
                                </div>
                            </div>

                            <div>
                                <h4 className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Historia wpłat</h4>
                                {loadingGoalTx ? (
                                    <div className="p-6 text-center text-white/20 text-[10px] font-black uppercase tracking-widest animate-pulse">Ładowanie...</div>
                                ) : goalTransactions.length === 0 ? (
                                    <div className="p-6 text-center border border-dashed border-white/10 rounded-[5px]">
                                        <p className="text-white/20 text-[10px] font-bold uppercase tracking-widest">Brak wpłat na ten cel</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5 max-h-72 overflow-y-auto border border-white/5 rounded-[5px]">
                                        {goalTransactions.map((tx) => (
                                            <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-white truncate">{tx.description || 'Wpłata'}</p>
                                                    <p className="text-[10px] text-gray-500">{new Date(tx.transactionDate).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
                                                </div>
                                                <span className="text-sm font-bold text-emerald-400 whitespace-nowrap">
                                                    +{Number(tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency || 'PLN'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                                <button
                                    onClick={() => { const g = viewingGoal; setViewingGoal(null); handleEditGoal(g); }}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-[5px] font-bold hover:bg-white/10 transition-all text-[10px] uppercase tracking-widest"
                                >
                                    <Pencil size={12} />
                                    Edytuj cel
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>

            {/* Modal Transferu Między Celami */}
            <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title="Przenieś środki">
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Z celu</label>
                        <select
                            value={transferData.fromGoalId}
                            onChange={(e) => setTransferData({ ...transferData, fromGoalId: e.target.value })}
                            className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-3.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-medium cursor-pointer transition-all"
                        >
                            <option value="" className="bg-[#0a0a0a]">Wybierz cel źródłowy</option>
                            {goals.map(g => (
                                <option key={g.id} value={g.id} className="bg-[#0a0a0a]">{g.name} ({Number(g.currentAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN)</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-center py-1">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 text-primary">
                            <ArrowRightLeft size={20} />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Do celu</label>
                        <select
                            value={transferData.toGoalId}
                            onChange={(e) => setTransferData({ ...transferData, toGoalId: e.target.value })}
                            className="w-full bg-surface/50 border border-white/5 rounded-[5px] px-4 py-3.5 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-medium cursor-pointer transition-all"
                        >
                            <option value="" className="bg-[#0a0a0a]">Wybierz cel docelowy</option>
                            {goals.map(g => (
                                <option key={g.id} value={g.id} className="bg-[#0a0a0a]">{g.name} ({Number(g.currentAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN)</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-white/40 mb-2 ml-1 uppercase tracking-widest text-[10px]">Kwota transferu (PLN)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">PLN</span>
                            <input
                                type="number"
                                value={transferData.amount}
                                onChange={(e) => setTransferData({ ...transferData, amount: e.target.value })}
                                placeholder="0.00"
                                className="w-full bg-surface/50 border border-white/5 rounded-[5px] pl-14 pr-4 py-4 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] font-black text-2xl transition-all placeholder:text-white/10"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 justify-end pt-4">
                        <button
                            onClick={() => setShowTransferModal(false)}
                            className="py-3 px-8 rounded-xl font-bold text-white/40 hover:text-white hover:bg-white/5 transition-all text-sm"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={handleTransfer}
                            className="px-10 py-3.5 bg-white/5 border border-white/10 text-white rounded-[5px] font-bold hover:bg-white/10 transition-all active:scale-95 uppercase tracking-widest text-xs"
                        >
                            Wykonaj transfer
                        </button>
                    </div>
                </div>
            </Modal>

            {confirmConfig.isOpen && (
                <ConfirmModal
                    isOpen={confirmConfig.isOpen}
                    onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                    onConfirm={confirmConfig.onConfirm}
                    title={confirmConfig.title}
                    message={confirmConfig.message}
                    variant="danger"
                />
            )}
        </>
    );
}
