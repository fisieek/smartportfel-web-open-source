import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Trophy, ChevronRight, Plus, Sparkles, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGamification } from '../../hooks/useQueries';

// Po ukryciu („x") chowamy widget na tyle dni — potem sam wraca.
// Tydzień jest jednostką serii, więc 3 dni = widget wróci w obrębie tygodnia.
const SNOOZE_KEY = 'gamificationWidgetSnoozedUntil';
const SNOOZE_DAYS = 3;

function isSnoozed(): boolean {
    try {
        return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) || 0);
    } catch {
        return false;
    }
}

/** Polska odmiana słowa „tydzień". */
function weekWord(n: number): string {
    if (n === 1) return 'tydzień';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'tygodnie';
    return 'tygodni';
}

function openAddExpense() {
    window.dispatchEvent(new CustomEvent('app:open-add-expense'));
}

export default function GamificationWidget() {
    const { data, isLoading } = useGamification();
    const [dismissed, setDismissed] = useState(() => isSnoozed());

    if (isLoading || !data || dismissed) return null;

    const handleDismiss = () => {
        try {
            localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
        } catch {
            // brak localStorage (np. tryb prywatny) — ukryj tylko w tym widoku
        }
        setDismissed(true);
    };

    const { streak, nextTier, tiersUnlocked, tiersTotal } = data;
    const atRisk = streak.status === 'AT_RISK';
    const noStreak = streak.status === 'BROKEN' || streak.status === 'NONE';

    return (
        <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                'rounded-[2px] border p-4 md:p-5 relative overflow-hidden shadow-lg transition-all',
                atRisk
                    ? 'bg-amber-500/[0.06] border-amber-500/30'
                    : 'bg-white/5 border-white/10 hover:border-white/20'
            )}
        >
            <div
                className={cn(
                    'absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none',
                    atRisk ? 'bg-amber-500/10' : 'bg-white/5'
                )}
            />

            <button
                onClick={handleDismiss}
                aria-label="Ukryj na kilka dni"
                title="Ukryj na kilka dni"
                className="absolute top-1.5 right-1.5 z-30 p-1.5 text-gray-600 hover:text-white hover:bg-white/10 rounded-full transition-all"
            >
                <X size={14} />
            </button>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10 pr-6">
                {/* Seria */}
                <div className="flex items-center gap-3 md:gap-4">
                    <div
                        className={cn(
                            'shrink-0 w-12 h-12 rounded-full flex items-center justify-center border',
                            noStreak
                                ? 'bg-white/5 border-white/10 text-gray-500'
                                : atRisk
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                  : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                        )}
                    >
                        <Flame size={22} />
                    </div>
                    <div className="space-y-0.5">
                        {noStreak ? (
                            <>
                                <h3 className="text-base font-bold text-white">Rozpocznij swoją serię</h3>
                                <p className="text-xs text-gray-400">
                                    Zaksięguj transakcję w tym tygodniu, aby ruszyć licznik.
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-base font-bold text-white flex items-center gap-2">
                                    Seria: {streak.current} {weekWord(streak.current)}
                                    {!atRisk && <span aria-hidden>🔥</span>}
                                </h3>
                                <p className={cn('text-xs', atRisk ? 'text-amber-400/90' : 'text-gray-400')}>
                                    {atRisk
                                        ? 'Zagrożona — zaksięguj coś w tym tygodniu, by ją utrzymać.'
                                        : `Rekord: ${streak.longest} ${weekWord(streak.longest)}`}
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Następna odznaka + licznik + CTA */}
                <div className="flex items-center gap-4 md:gap-6">
                    {(atRisk || noStreak) && (
                        <button
                            onClick={openAddExpense}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-[5px] text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-all active:scale-95"
                        >
                            <Plus size={14} />
                            Dodaj transakcję
                        </button>
                    )}

                    {nextTier ? (
                        <div className="hidden sm:block min-w-[160px]">
                            <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="text-[11px] text-gray-400 flex items-center gap-1 truncate">
                                    <Sparkles size={11} className="shrink-0" />
                                    <span className="truncate">{nextTier.familyName}</span>
                                </span>
                                <span className="text-[11px] font-bold text-white/60 shrink-0">
                                    {Math.round(nextTier.progress * 100)}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.3)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.round(nextTier.progress * 100)}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                />
                            </div>
                        </div>
                    ) : null}

                    <Link
                        to="/dashboard/osiagniecia"
                        className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors group shrink-0"
                    >
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] bg-white/5 border border-white/10">
                            <Trophy size={15} className="text-yellow-400" />
                            <span className="text-xs font-bold text-white">
                                {tiersUnlocked}/{tiersTotal}
                            </span>
                        </div>
                        <ChevronRight size={18} className="text-gray-500 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                </div>
            </div>
        </motion.div>
    );
}
