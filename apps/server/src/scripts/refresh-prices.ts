import prisma from '../lib/prisma';
import { refreshPrices } from '../services/priceRefreshService';

/**
 * Odświeżenie wartości rynkowej inwestycji (dostawca notowań + NBP) — lokalny odpowiednik cronu
 * /api/system/cron/refresh-prices (na produkcji uruchamia go harmonogram). Aktualizuje
 * `currentValue` wszystkich podlinkowanych pozycji i dopisuje punkty historii (sparkline).
 *
 * Użycie: npx ts-node -T src/scripts/refresh-prices.ts
 */
async function main() {
    console.log('--- Odświeżanie cen: start ---');
    const r = await refreshPrices(); // cały portfel, z historią
    console.log(`Instrumenty odświeżone: ${r.instrumentsRefreshed} | pozycje zaktualizowane: ${r.investmentsUpdated} | pominięte: ${r.failures.length}`);
    for (const f of r.failures) console.warn(`[SKIP] ${f.symbol}: ${f.reason}`);
    console.log('--- Odświeżanie cen: koniec ---');
}

main()
    .catch((err) => {
        console.error('Odświeżanie cen nie powiodło się:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
