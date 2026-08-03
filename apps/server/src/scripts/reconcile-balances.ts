import prisma from '../lib/prisma';
import { computeDrifts } from '../services/reconciliationService';

/**
 * Rekoncyliacja sald (read-only). Wykrywa drift między saldami trzymanymi
 * w tabelach kont a sumą transakcji, które powinny się na nie składać.
 *
 * Sprawdzane inwarianty:
 * 1. AccountBalance(konto, waluta) == suma podpisanych kwot transakcji
 *    w tej walucie: strona źródłowa (personalAccountId), strona docelowa
 *    transferów wewnętrznych (toPersonalAccountId) oraz obie strony
 *    przewalutowań (amount/currency i targetAmount/targetCurrency).
 *    Wiersze AccountBalance powstają wyłącznie z upsertów
 *    w updateAccountBalance, startując od zera.
 * 2. SavingsAccount.balance == suma wpłat minus wypłat.
 *
 * Znane, akceptowane źródła odchyleń (raportowane jako WARN, nie FAIL):
 * - ręczne korekty sald przez edycję konta,
 * - transakcje sprzed naprawy asymetrii transferów (czerwiec 2026): strona
 *   docelowa transferów i przewalutowań nie była wtedy księgowana
 *   w AccountBalance,
 * - raty kredytów: od czerwca 2026 księgowane w PLN AccountBalance konta
 *   powiązanego (updateAccountBalance w mortgageController); raty sprzed tej
 *   zmiany obciążały tylko główne pole balance. Wiadro PLN uwzględnia
 *   wszystkie raty, więc konta z historycznymi ratami raportują WARN.
 *
 * Logika liczenia: services/reconciliationService.ts (współdzielona z cronem
 * /api/system/cron/reconcile-balances, który dodatkowo porównuje z baseline).
 *
 * Użycie: npx tsx src/scripts/reconcile-balances.ts
 * Kod wyjścia 1 przy wykrytym drifcie — nadaje się na cron/test CI.
 */

async function main() {
    console.log('--- Rekoncyliacja sald: start ---');
    const { drifts, warns } = await computeDrifts();

    for (const w of warns) {
        console.warn(`[WARN] Konto "${w.accountName}" (${w.accountId}) waluta ${w.currency}: drift ${w.drift}`);
    }
    for (const d of drifts) {
        const scope = d.accountType === 'savings' ? 'Konto oszczędnościowe' : 'Konto';
        const cur = d.currency ? ` waluta ${d.currency}` : '';
        console.warn(`[DRIFT] ${scope} "${d.accountName}" (${d.accountId})${cur}: drift ${d.drift}`);
    }

    const personalDrift = drifts.filter(d => d.accountType === 'personal').length;
    const savingsDrift = drifts.filter(d => d.accountType === 'savings').length;

    if (drifts.length > 0) {
        console.error(`--- Wykryto ${drifts.length} rozbieżności (konta osobiste: ${personalDrift}, oszczędnościowe: ${savingsDrift}) ---`);
        process.exitCode = 1;
    } else {
        console.log('--- Wszystkie salda spójne z transakcjami ---');
    }
}

main()
    .catch((err) => {
        console.error('Rekoncyliacja nie powiodła się:', err);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
