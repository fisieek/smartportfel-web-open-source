/**
 * 🥇 NBP Gold Client
 *
 * Cena 1 g złota (próba 1000) publikowana przez NBP. Bez klucza API.
 * NBP nie publikuje cen w dni wolne — przy braku notowania cofamy się do ostatniej publikacji.
 */

import { logger } from '../../utils/logger';

const goldCache = new Map<string, number>();

/**
 * Cena złota na dany dzień (YYYY-MM-DD) lub ostatnia opublikowana, gdy brak daty.
 * Zwraca null przy braku danych.
 */
export async function getGoldPrice(date?: string): Promise<number | null> {
    const cacheKey = date || 'latest';
    if (date && goldCache.has(cacheKey)) {
        return goldCache.get(cacheKey)!;
    }

    try {
        if (!date) {
            const price = await fetchGold('https://api.nbp.pl/api/cenyzlota/last/1/?format=json');
            return price;
        }

        // Cofamy się maksymalnie 10 dni (weekendy + święta)
        const target = new Date(`${date}T00:00:00Z`);
        if (isNaN(target.getTime())) return null;

        for (let i = 0; i < 10; i++) {
            const tryDate = new Date(target);
            tryDate.setUTCDate(tryDate.getUTCDate() - i);
            const dateStr = tryDate.toISOString().split('T')[0];

            const price = await fetchGold(`https://api.nbp.pl/api/cenyzlota/${dateStr}/?format=json`);
            if (price !== null) {
                goldCache.set(cacheKey, price);
                return price;
            }
        }
        return null;
    } catch (error) {
        logger.error(`[NBP Gold] Błąd pobierania ceny złota (${date || 'latest'}):`, error);
        return null;
    }
}

async function fetchGold(url: string): Promise<number | null> {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null; // 404 = brak notowania danego dnia
    const data = (await response.json()) as { cena?: number }[];
    return data?.[0]?.cena ?? null;
}
