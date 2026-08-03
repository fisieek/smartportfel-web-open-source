/**
 * 🏦 Limity wpłat IKE / IKZE
 *
 * Roczne limity wpłat publikowane są obwieszczeniem Ministra właściwego ds. zabezpieczenia
 * społecznego (MRiPS) i wyliczane jako wielokrotność prognozowanego przeciętnego wynagrodzenia:
 *   IKE  = 3.0× przeciętnego prognozowanego wynagrodzenia miesięcznego
 *   IKZE = 1.2× (etat) / 1.8× (prowadzący działalność gospodarczą)
 *
 * UWAGA: wartości na kolejne lata aktualizować z oficjalnego obwieszczenia.
 * Dla roku spoza mapy używany jest ostatni znany rok (z ostrzeżeniem w logach).
 */

import { logger } from '../utils/logger';

export type RetirementAccountType = 'IKE' | 'IKZE';

interface YearLimits {
    ike: number;
    ikze: number;
    ikzeBusiness: number;
}

// Źródło: obwieszczenia MRiPS. 2024/2025 — wartości urzędowe.
const LIMITS_BY_YEAR: Record<number, YearLimits> = {
    2024: { ike: 23472.0, ikze: 9388.8, ikzeBusiness: 14083.2 },
    2025: { ike: 26019.0, ikze: 10407.6, ikzeBusiness: 15611.4 },
    2026: { ike: 28260.0, ikze: 11304.0, ikzeBusiness: 16956.0 },
};

const LATEST_KNOWN_YEAR = Math.max(...Object.keys(LIMITS_BY_YEAR).map(Number));

function resolveYearLimits(year: number): YearLimits {
    const limits = LIMITS_BY_YEAR[year];
    if (limits) return limits;
    logger.warn(`[IKE/IKZE] Brak limitów dla roku ${year} — używam ${LATEST_KNOWN_YEAR}. Zaktualizuj LIMITS_BY_YEAR.`);
    return LIMITS_BY_YEAR[LATEST_KNOWN_YEAR];
}

/**
 * Roczny limit wpłat dla danego typu konta.
 * @param ikzeBusiness dla IKZE: true = wyższy limit dla prowadzących działalność gospodarczą
 */
export function getContributionLimit(
    type: RetirementAccountType,
    year: number = new Date().getFullYear(),
    ikzeBusiness = false
): number {
    const limits = resolveYearLimits(year);
    if (type === 'IKE') return limits.ike;
    return ikzeBusiness ? limits.ikzeBusiness : limits.ikze;
}
