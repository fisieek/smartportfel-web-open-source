import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGamification } from '../../hooks/useQueries';

/**
 * Kompaktowa plakietka serii w headerze (desktop). Widoczna tylko gdy seria trwa
 * (ACTIVE/AT_RISK) — premium skrót do strony osiągnięć, zwiększa widoczność gamifikacji.
 */
export default function HeaderStreakPill() {
    const { data } = useGamification();
    const streak = data?.streak;
    if (!streak || streak.current < 1 || (streak.status !== 'ACTIVE' && streak.status !== 'AT_RISK')) {
        return null;
    }

    const atRisk = streak.status === 'AT_RISK';
    return (
        <Link
            to="/dashboard/osiagniecia"
            title={
                atRisk
                    ? 'Seria zagrożona — zaksięguj coś w tym tygodniu'
                    : `Seria: ${streak.current} tyg. (rekord ${streak.longest})`
            }
            className={cn(
                'flex items-center gap-1.5 px-2.5 h-10 rounded-[5px] border text-xs font-bold transition-all active:scale-95 shrink-0',
                atRisk
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                    : 'bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20'
            )}
        >
            <Flame size={15} />
            {streak.current}
        </Link>
    );
}
