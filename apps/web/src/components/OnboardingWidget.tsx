import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import api from '../lib/api';

interface OnboardingStatus {
    accountsDone: boolean;
    firstExpenseDone: boolean;
    goalsDone: boolean;
}

export default function OnboardingWidget({ onComplete }: { onComplete: () => void }) {
    const [status, setStatus] = useState<OnboardingStatus | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await api.get('/onboarding/status');
            setStatus(response.data);
            if (response.data.accountsDone && response.data.firstExpenseDone && response.data.goalsDone) {
                onComplete();
            }
        } catch (error) {
            console.error('Failed to fetch onboarding status', error);
        } finally {
            setLoading(false);
        }
    }, [onComplete]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    if (loading || !status) return null;

    const completedSteps = [status.accountsDone, status.firstExpenseDone, status.goalsDone].filter(Boolean).length;
    const progress = Math.round((completedSteps / 3) * 100);

    if (progress === 100) return null;

    const steps = [
        {
            id: 'accounts',
            title: 'Dodaj swoje konta bankowe',
            description: 'Automatycznie policzymy Twoje zasoby - gotówkę, konta osobiste, oszczędności. To jest Twoja finansowa "mapa".',
            done: status.accountsDone,
            key: 'accountsDone'
        },
        {
            id: 'expense',
            title: 'Śledź swoje wydatki',
            description: 'Zacznij rejestrować wydatki - każdy, nawet najmniejszy. Po miesiącu zobaczysz, gdzie naprawdę idą Twoje pieniądze.',
            done: status.firstExpenseDone,
            key: 'firstExpenseDone'
        },
        {
            id: 'goals',
            title: 'Zaplanuj na co zbierasz',
            description: 'Ustaw cel na wymarzone wakacje lub nową konsolę. Pomożemy Ci odłożyć na to bez konieczności rezygnowania z przyjemności.',
            done: status.goalsDone,
            key: 'goalsDone'
        }
    ];

    const toggleStep = async (key: string, currentValue: boolean) => {
        try {
            const newStatus = { ...status, [key]: !currentValue };
            await api.post('/onboarding/status', newStatus);
            setStatus(newStatus as any);
            if (newStatus.accountsDone && newStatus.firstExpenseDone && newStatus.goalsDone) {
                setTimeout(onComplete, 500);
            }
        } catch (error) {
            console.error('Failed to update onboarding status', error);
        }
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-[2px] p-4 md:p-6 mb-8 cursor-pointer group hover:border-white/20 transition-all relative overflow-hidden shadow-lg"
                onClick={() => setIsModalOpen(true)}
            >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-white/10 transition-all" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            Dokończ konfigurację
                            <span className="text-[10px] font-black bg-white text-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                                {progress}%
                            </span>
                        </h3>
                        <p className="text-sm text-gray-400">
                            Zostało Ci kilka kroków, aby w pełni zapanować nad finansami.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="hidden md:block w-48 h-2 bg-white/5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                            />
                        </div>
                        <ChevronRight className="text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all" size={20} />
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-md"
                            onClick={() => setIsModalOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-[#0B0B0F] border border-white/10 rounded-[5px] w-full max-w-md overflow-hidden relative z-[130] shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="p-6 md:p-6 space-y-6">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Twoja droga do sukcesu</h2>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 w-32 bg-white/5 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-white shadow-[0_0_15px_rgba(255,255,255,0.4)]"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${progress}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-white/40">{completedSteps}/3 kroków</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsModalOpen(false)}
                                        className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-full transition-all"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {steps.map((step) => (
                                        <div
                                            key={step.id}
                                            onClick={() => toggleStep(step.key, step.done)}
                                            className={cn(
                                                "p-4 md:p-5 rounded-[2px] border transition-all cursor-pointer group active:scale-[0.98]",
                                                step.done
                                                    ? "bg-white/[0.05] border-white/20"
                                                    : "bg-white/[0.02] border-white/5 hover:border-white/10"
                                            )}
                                        >
                                            <div className="flex gap-4">
                                                <div className={cn(
                                                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all",
                                                    step.done
                                                        ? "bg-white text-black shadow-lg"
                                                        : "bg-white/5 text-gray-600 group-hover:text-gray-400"
                                                )}>
                                                    <CheckCircle2 size={20} className={cn(step.done ? "stroke-[2.5]" : "stroke-1")} />
                                                </div>
                                                <div className="space-y-1">
                                                    <h4 className={cn(
                                                        "font-bold transition-colors",
                                                        step.done ? "text-white" : "text-gray-300 group-hover:text-white"
                                                    )}>
                                                        {step.title}
                                                    </h4>
                                                    <p className="text-sm text-gray-500 leading-relaxed">
                                                        {step.description}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-full py-4 bg-white hover:bg-white/90 text-black font-black rounded-[2px] transition-all shadow-lg uppercase tracking-widest text-xs"
                                >
                                    Kontynuuj naukę
                                </button>

                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
