import { useState } from 'react';
import { PiggyBank, Briefcase, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import Modal from './ui/Modal';

interface Suggestion {
    grossSalary: number;
    employeeRate: number;
    employerRate: number;
    monthName: string;
    date: string;
}

interface Props {
    isOpen: boolean;
    suggestion: Suggestion | null;
    onClose: () => void;
    onConfirm: () => void;
}

export default function PPKSuggestionModal({ isOpen, suggestion, onClose, onConfirm }: Props) {
    const [loading, setLoading] = useState(false);
    const [grossSalary, setGrossSalary] = useState(suggestion?.grossSalary.toString() || '');
    const { success, error: toastError } = useToast();

    if (!isOpen || !suggestion) return null;

    const handleConfirm = async () => {
        setLoading(true);
        try {
            await api.post('/ppk/confirm-suggestion', {
                grossSalary: parseFloat(grossSalary),
                employeeRate: suggestion.employeeRate,
                employerRate: suggestion.employerRate
            });
            success('Wpłata PPK została zaksięgowana!');
            onConfirm();
            onClose();
        } catch (error: any) {
            console.error('Błąd potwierdzenia PPK:', error);
            toastError(error.response?.data?.message || 'Nie udało się potwierdzić wpłaty');
        } finally {
            setLoading(false);
        }
    };

    const employeeContribution = (parseFloat(grossSalary) * suggestion.employeeRate) / 100;
    const employerContribution = (parseFloat(grossSalary) * suggestion.employerRate) / 100;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Sugestia wpłaty PPK">
            <div className="space-y-6">
                <div className="p-2 bg-primary/10 rounded-2xl flex gap-4 items-center mb-6">
                    <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center text-primary shrink-0">
                        <PiggyBank size={28} />
                    </div>
                    <div>
                        <h4 className="text-white font-bold text-sm">Oszczędności rosną!</h4>
                        <p className="text-white/40 text-[10px] uppercase font-black tracking-widest">Mamy już {suggestion.monthName}.</p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-white/40 mb-2 ml-1 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            <Briefcase size={14} />
                            Wynagrodzenie Brutto
                        </label>
                        <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">PLN</span>
                            <input
                                type="number"
                                className="w-full pl-14 pr-4 py-4 rounded-xl bg-white/5 border border-white/5 text-xl font-black text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all"
                                value={grossSalary}
                                onChange={e => setGrossSalary(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black text-white/40 uppercase mb-1 tracking-widest">Twoja wpłata</p>
                            <p className="text-lg font-black text-primary">{employeeContribution.toFixed(2)} zł</p>
                            <p className="text-[10px] text-white/20 uppercase font-black tracking-tighter">{suggestion.employeeRate}% od brutto</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                            <p className="text-[10px] font-black text-white/40 uppercase mb-1 tracking-widest">Pracodawca</p>
                            <p className="text-lg font-black text-blue-400">{employerContribution.toFixed(2)} zł</p>
                            <p className="text-[10px] text-white/20 uppercase font-black tracking-tighter">{suggestion.employerRate}% od brutto</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                    <button
                        onClick={handleConfirm}
                        disabled={loading || !grossSalary}
                        className="w-full bg-white text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-all disabled:opacity-50 shadow-xl shadow-black/20 uppercase tracking-widest text-xs"
                    >
                        {loading ? 'Przetwarzanie...' : (
                            <>
                                <CheckCircle size={18} />
                                Potwierdzam wpłatę
                            </>
                        )}
                    </button>

                    <button
                        onClick={onClose}
                        className="w-full py-3 text-xs font-bold text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all uppercase tracking-widest"
                    >
                        Pomiń w tym miesiącu
                    </button>
                </div>
            </div>
        </Modal>
    );
}
