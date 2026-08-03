import { useEffect, useRef } from 'react';
import { useGamification } from '../../hooks/useQueries';
import { useToast } from '../../context/ToastContext';
import { fireConfetti, tierIntensity, type Tier } from '../../lib/gamification';
import api from '../../lib/api';

const TIER_EMOJI: Record<Tier, string> = {
    bronze: '🥉',
    silver: '🥈',
    gold: '🥇',
    platinum: '🏆',
};

/**
 * Watcher celebracji — montowany w Layout (zawsze aktywny), więc po dodaniu
 * transakcji/wpłaty odświeżony stan gamifikacji od razu odpala confetti + toast.
 * Deduplikacja po kluczu awansu chroni przed podwójnym odpaleniem (StrictMode/refetch).
 */
export default function GamificationCelebration() {
    const { data } = useGamification();
    const { success } = useToast();
    const celebrated = useRef<Set<string>>(new Set());
    const backfillShown = useRef(false);

    useEffect(() => {
        if (!data) return;

        // Backfill dotychczasowej aktywności — jedno podsumowanie, bez barażu confetti.
        if (data.backfilledCount > 0 && !backfillShown.current) {
            backfillShown.current = true;
            fireConfetti();
            success(`Odblokowano ${data.backfilledCount} poziomów za dotychczasową aktywność! 🎉`);
            api.post('/gamification/seen').catch(() => {});
            return;
        }

        // Świeże awanse — celebracja od razu po akcji, intensywność rośnie z poziomem.
        const fresh = data.tierUps.filter((t) => !celebrated.current.has(`${t.family}_${t.tier}`));
        if (fresh.length === 0) return;

        fresh.forEach((t, i) => {
            celebrated.current.add(`${t.family}_${t.tier}`);
            window.setTimeout(() => {
                fireConfetti(tierIntensity(t.tier));
                success(`Awans! ${t.familyName}: ${t.tierName} ${TIER_EMOJI[t.tier]}`);
            }, i * 1300);
        });
        api.post('/gamification/seen').catch(() => {});
    }, [data, success]);

    return null;
}
