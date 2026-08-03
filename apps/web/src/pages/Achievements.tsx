import { Flame, Trophy, Award } from 'lucide-react';
import { useGamification } from '../hooks/useQueries';
import FamilyCard from '../components/gamification/FamilyCard';
import { cn } from '../lib/utils';

function weekWord(n: number): string {
    if (n === 1) return 'tydzień';
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return 'tygodnie';
    return 'tygodni';
}

export default function Achievements() {
    const { data, isLoading } = useGamification();

    if (isLoading) return <div className="text-gray-400 p-8">Ładowanie osiągnięć...</div>;
    if (!data) return <div className="text-gray-400 p-8">Nie udało się wczytać osiągnięć.</div>;

    const { streak, families, tiersUnlocked, tiersTotal } = data;
    const atRisk = streak.status === 'AT_RISK';
    const hasStreak = streak.status === 'ACTIVE' || atRisk;

    // ile złotych/platynowych — sygnał „kolekcji"
    const precious = families.reduce(
        (s, f) => s + f.tiers.filter((t) => t.unlocked && (t.tier === 'gold' || t.tier === 'platinum')).length,
        0
    );

    return (
        <div className="space-y-6">
            <p className="text-sm text-gray-400 -mt-2">
                Zdobywaj kolejne poziomy odznak za dobre nawyki finansowe i utrzymuj serię, wracając co tydzień.
            </p>

            {/* Podsumowanie: seria + rekord + poziomy */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                    className={cn(
                        'rounded-[5px] border p-4 flex items-center gap-3',
                        atRisk ? 'bg-amber-500/[0.06] border-amber-500/30' : 'bg-white/5 border-white/10'
                    )}
                >
                    <div
                        className={cn(
                            'w-11 h-11 rounded-full flex items-center justify-center border shrink-0',
                            hasStreak
                                ? atRisk
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                    : 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                                : 'bg-white/5 border-white/10 text-gray-500'
                        )}
                    >
                        <Flame size={20} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-white">
                            {streak.current} {weekWord(streak.current)}
                        </div>
                        <div className="text-[11px] text-gray-400">{atRisk ? 'Seria zagrożona' : 'Aktualna seria'}</div>
                    </div>
                </div>

                <div className="rounded-[5px] border bg-white/5 border-white/10 p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center border bg-white/5 border-white/10 text-gray-300 shrink-0">
                        <Award size={20} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-white">
                            {streak.longest} {weekWord(streak.longest)}
                        </div>
                        <div className="text-[11px] text-gray-400">Rekord serii</div>
                    </div>
                </div>

                <div className="rounded-[5px] border bg-white/5 border-white/10 p-4 flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center border bg-yellow-400/10 border-yellow-400/30 text-yellow-400 shrink-0">
                        <Trophy size={20} />
                    </div>
                    <div>
                        <div className="text-xl font-bold text-white">
                            {tiersUnlocked}/{tiersTotal}
                        </div>
                        <div className="text-[11px] text-gray-400">
                            Zdobyte poziomy{precious > 0 ? ` · ${precious} złotych+` : ''}
                        </div>
                    </div>
                </div>
            </div>

            {/* Rodziny odznak */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {families.map((f) => (
                    <FamilyCard key={f.key} family={f} />
                ))}
            </div>
        </div>
    );
}
