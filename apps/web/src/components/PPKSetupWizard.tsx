import { useState, useEffect } from 'react';
import { Briefcase, Calendar, Percent, CheckCircle2, Info, ArrowRight, AlertTriangle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import Modal from './ui/Modal';

export interface PPKConfigValues {
    grossSalary: number;
    employeeRate: number;
    employerRate: number;
    startDate: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    /** 'setup' — pełna (re)konfiguracja z przeliczeniem historii; 'edit' — bezpieczna zmiana pensji/stawek bez kasowania historii */
    mode?: 'setup' | 'edit';
    /** Obecna konfiguracja do pre-fill (tryb edit lub re-setup) */
    initialConfig?: PPKConfigValues | null;
}

export default function PPKSetupWizard({ isOpen, onClose, onSuccess, mode = 'setup', initialConfig }: Props) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const { success, error: toastError } = useToast();
    const isEdit = mode === 'edit';
    // Re-setup przy istniejącej konfiguracji kasuje i przelicza historię — wymaga ostrzeżenia
    const isDestructiveResetup = mode === 'setup' && !!initialConfig;

    const [form, setForm] = useState({
        grossSalary: '',
        startDate: new Date().toISOString().split('T')[0],
        employeeRate: '2',
        employerRate: '1.5',
        hasHistoryToImport: false
    });

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            if (initialConfig) {
                setForm({
                    grossSalary: String(initialConfig.grossSalary),
                    startDate: new Date(initialConfig.startDate).toISOString().split('T')[0],
                    employeeRate: String(initialConfig.employeeRate),
                    employerRate: String(initialConfig.employerRate),
                    hasHistoryToImport: false
                });
            }
        }
    }, [isOpen, initialConfig]);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            if (isEdit) {
                await api.put('/ppk/config', {
                    grossSalary: form.grossSalary,
                    employeeRate: form.employeeRate,
                    employerRate: form.employerRate
                });
                success('Konfiguracja PPK zaktualizowana — historia wpłat pozostała bez zmian.');
            } else {
                await api.post('/ppk/setup', form);
                success('Konfiguracja PPK zakończona pomyślnie!');
            }
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Błąd zapisu PPK:', error);
            toastError(error.response?.data?.error || error.response?.data?.message || 'Nie udało się zapisać konfiguracji PPK');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edytuj konfigurację PPK' : 'Konfiguracja PPK'}>
            <div className="space-y-6">
                {step === 1 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="bg-surface/50 border border-white/10 rounded-[5px] p-4 flex gap-4 items-start">
                            <div className="p-2 bg-primary/10 rounded-[5px] text-primary">
                                <Info size={20} />
                            </div>
                            <div>
                                <h4 className="text-white font-bold text-sm mb-1">{isEdit ? 'Bezpieczna edycja' : 'Jak to działa?'}</h4>
                                <p className="text-gray-400 text-xs leading-relaxed">
                                    {isEdit
                                        ? 'Zmiana pensji i stawek obowiązuje dla przyszłych wpłat. Historia dotychczasowych wpłat pozostaje bez zmian.'
                                        : 'Na podstawie Twojego wynagrodzenia oraz daty startu, system automatycznie wygeneruje historię składek, dopłat powitalnych i rocznych od Państwa.'}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Wynagrodzenie brutto (PLN)</label>
                                <div className="relative">
                                    <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full pl-12 pr-4 py-3.5 rounded-[5px] bg-site border border-white/10 text-white focus:outline-none focus:border-primary/50 transition-all font-medium"
                                        placeholder="0.00"
                                        value={form.grossSalary}
                                        onChange={e => setForm({ ...form, grossSalary: e.target.value })}
                                    />
                                </div>
                            </div>

                            {!isEdit && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Od kiedy masz PPK?</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="date"
                                            className="w-full pl-12 pr-4 py-3.5 rounded-[5px] bg-site border border-white/10 text-white focus:outline-none focus:border-primary/50 transition-all font-medium"
                                            value={form.startDate}
                                            onChange={e => setForm({ ...form, startDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Twoja wpłata (%)</label>
                                    <div className="relative">
                                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            max="4"
                                            className="w-full pl-12 pr-4 py-3.5 rounded-[5px] bg-site border border-white/10 text-white focus:outline-none focus:border-primary/50 transition-all font-medium"
                                            value={form.employeeRate}
                                            onChange={e => setForm({ ...form, employeeRate: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Wpłata pracodawcy (%)</label>
                                    <div className="relative">
                                        <Percent className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                        <input
                                            type="number"
                                            step="0.5"
                                            min="1.5"
                                            max="4"
                                            className="w-full pl-12 pr-4 py-3.5 rounded-[5px] bg-site border border-white/10 text-white focus:outline-none focus:border-primary/50 transition-all font-medium"
                                            value={form.employerRate}
                                            onChange={e => setForm({ ...form, employerRate: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => setStep(2)}
                            disabled={!form.grossSalary || !form.startDate}
                            className="w-full bg-primary-gradient text-white font-bold py-4 rounded-[5px] flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-glow-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Dalej
                            <ArrowRight size={20} />
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <div className="text-center py-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-[5px] text-primary mb-4 border border-primary/20">
                                <CheckCircle2 size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">{isEdit ? 'Zapisać zmiany?' : 'Gotowy na start?'}</h3>
                            <p className="text-gray-400 text-sm">
                                {isEdit
                                    ? 'Nowe wartości będą stosowane przy kolejnych wpłatach. Historia pozostaje nietknięta.'
                                    : 'Po kliknięciu "Rozpocznij", system wyliczy Twoją historię i przygotuje dashboard PPK.'}
                            </p>
                        </div>

                        {isDestructiveResetup && (
                            <div className="bg-rose-500/10 border border-rose-500/30 rounded-[5px] p-4 flex gap-3 items-start">
                                <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                                <p className="text-rose-300 text-xs leading-relaxed font-medium">
                                    Uwaga: pełna rekonfiguracja <strong>usunie całą dotychczasową historię wpłat</strong> i wygeneruje ją od nowa
                                    na podstawie podanych wartości. Jeśli chcesz tylko zmienić pensję lub stawki, użyj opcji „Edytuj konfigurację".
                                </p>
                            </div>
                        )}

                        <div className="bg-site rounded-[5px] p-4 border border-white/10 space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Miesięczna składka (Ty):</span>
                                <span className="text-white font-bold">
                                    {((parseFloat(form.grossSalary) * parseFloat(form.employeeRate)) / 100).toFixed(2)} PLN
                                </span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-400">Miesięczna wpłata (Pracodawca):</span>
                                <span className="text-white font-bold">
                                    {((parseFloat(form.grossSalary) * parseFloat(form.employerRate)) / 100).toFixed(2)} PLN
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-4 rounded-[5px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all border border-white/10"
                            >
                                Wróć
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className={`flex-[2] text-white font-bold py-4 rounded-[5px] hover:opacity-90 transition-all disabled:opacity-50 ${isDestructiveResetup ? 'bg-rose-600 hover:bg-rose-500' : 'bg-primary-gradient shadow-glow-primary'}`}
                            >
                                {loading ? 'Przetwarzanie...' : (isEdit ? 'Zapisz zmiany' : (isDestructiveResetup ? 'Przelicz od nowa' : 'Rozpocznij'))}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
