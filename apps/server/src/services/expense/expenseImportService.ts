import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { runFinancialTransaction } from '../../utils/financialTransaction';
import { updateAccountBalance } from '../../utils/balanceUpdater';
import { CurrencyService } from '../../services/currencyService';
import { validateTransactionAccess } from '../../utils/householdScope';

/**
 * Dedykowany wariant importowy księgowania (bug I8, `POST /api/expenses/bulk`).
 *
 * Odróżnia się od `createExpenseBusinessLogic` jedną świadomą decyzją: NIE stosuje guardu
 * limitu debetu (`checkBalanceWithTx`) — import historyczny (stary wydatek przy niskim
 * bieżącym saldzie) musi przejść. Poza tym korzysta z tych samych prymitywów co reszta
 * księgowania: `runFinancialTransaction` (atomowość create+saldo), `updateAccountBalance`
 * (konwersja do waluty konta + utrzymanie tabeli `AccountBalance`) i kurs NBP z daty
 * transakcji (`CurrencyService.getExchangeRate`).
 *
 * Granularność: JEDNA transakcja na WIERSZ, nie na cały import. `getExchangeRate` zawsze
 * najpierw uderza do NBP (cache to fallback dopiero przy awarii), więc N wierszy w jednej
 * transakcji Serializable = N seryjnych strzałów NBP → ryzyko przekroczenia 15 s timeoutu
 * transakcji. Jeden wiersz = maks. jeden strzał, dokładnie jak pojedynczy
 * `createExpenseBusinessLogic`. Import nie jest więc atomowy między wierszami (nigdy nie był),
 * ale każda operacja księgowa (create + korekta salda) jest atomowa — co domyka klasę
 * korupcji B3/B4. Wiersze bez kursu / bez kwoty / bez daty są pomijane i raportowane.
 */

/** Limit rozmiaru importu — ogranicza czas i liczbę zapytań pojedynczego żądania. */
export const MAX_IMPORT_ROWS = 1000;

export interface BulkImportResult {
    count: number;
    skipped: Array<{ index: number; reason: string }>;
}

const formatDate = (d: Date): string => d.toISOString().split('T')[0];

/** Rozpoznaje błąd „brak kursu" rzucany przez `CurrencyService.getExchangeRate` (twarda ścieżka). */
const isRateUnavailableError = (e: unknown): boolean =>
    e instanceof Error && e.message.includes('Błąd przewalutowania');

export const bulkImportExpensesBusinessLogic = async (
    userId: string,
    rows: any[]
): Promise<BulkImportResult> => {
    if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error('IMPORT_TOO_LARGE');
    }

    const skipped: Array<{ index: number; reason: string }> = [];

    // 1. Ownership kont PRZED jakimkolwiek zapisem — cudze/niedostępne konto zrywa CAŁY import
    //    (nie księgujemy nic częściowo). `validateTransactionAccess` uwzględnia wspólne konta
    //    gospodarstwa, więc zamiast naiwnego `findFirst({ id, userId })` respektuje household sharing.
    const accountIds = Array.from(
        new Set(rows.map(r => r?.personalAccountId).filter((id: unknown): id is string => !!id))
    );
    for (const accountId of accountIds) {
        const ok = await validateTransactionAccess(userId, { personalAccountId: accountId });
        if (!ok) throw new Error('FORBIDDEN');
    }

    // 2. Kategoria „Inne" rozwiązana raz (nie w pętli) — dla wydatków bez kategorii, jak w createExpense.
    let inneCategoryId: number | null = null;
    if (rows.some(r => (r?.type ?? 'expense') === 'expense' && !r?.categoryId)) {
        const inne = await prisma.category.findFirst({ where: { name: 'Inne', userId: null } });
        inneCategoryId = inne?.id ?? null;
    }

    let count = 0;

    for (let index = 0; index < rows.length; index++) {
        const row = rows[index] ?? {};
        const type = row.type ?? 'expense';
        const { description, categoryId, date, store, personalAccountId } = row;
        const currency = (row.currency ?? 'PLN').toString().toUpperCase();

        const numericAmount = Number(row.amount);
        if (!row.amount || !Number.isFinite(numericAmount) || numericAmount <= 0) {
            skipped.push({ index, reason: 'Brak lub nieprawidłowa kwota' });
            continue;
        }
        const transactionDate = new Date(date);
        if (!date || isNaN(transactionDate.getTime())) {
            skipped.push({ index, reason: 'Brak lub nieprawidłowa data' });
            continue;
        }

        const finalCategoryId = categoryId
            ? Number(categoryId)
            : (type === 'expense' ? inneCategoryId : null);
        const amountDecimal = new Prisma.Decimal(numericAmount);

        try {
            await runFinancialTransaction(async (tx) => {
                // Kurs NBP z daty transakcji — RZUCA gdy brak kursu (NBP down + pusty cache),
                // co poniżej łapiemy jako „pominięty wiersz" (import nie może cicho księgować 1:1).
                const exchangeRate = await CurrencyService.getExchangeRate(currency, transactionDate);
                const exchangeRateDecimal = new Prisma.Decimal(exchangeRate);
                const plnAmount = amountDecimal.mul(exchangeRateDecimal).toDecimalPlaces(2);

                // ŚWIADOMIE bez checkBalanceWithTx — patrz nagłówek pliku (rdzeń I8).
                await (tx.expense.create as any)({
                    data: {
                        type,
                        amount: amountDecimal,
                        currency,
                        originalAmount: currency !== 'PLN' ? amountDecimal : null,
                        exchangeRate: currency !== 'PLN' ? exchangeRateDecimal : null,
                        plnAmount: currency !== 'PLN' ? plnAmount : amountDecimal,
                        description: description || store || 'Import historyczny',
                        categoryId: finalCategoryId,
                        transactionDate,
                        userId,
                        store,
                        personalAccountId: personalAccountId || null,
                        note: personalAccountId ? null : 'Import historyczny - brak przypisanego konta'
                    }
                });

                // Korekta salda przez wspólny prymityw: konwersja do waluty konta na saldzie
                // głównym + upsert AccountBalance w oryginalnej walucie. Tylko gdy wskazano konto
                // (import historyczny bez konta zostawia salda nietknięte, jak dotychczas).
                if (personalAccountId) {
                    await updateAccountBalance(tx, {
                        personalAccountId,
                        amount: amountDecimal,
                        currency,
                        type,
                        date: transactionDate
                    });
                }
            });
            count++;
        } catch (e) {
            if (isRateUnavailableError(e)) {
                skipped.push({ index, reason: `Brak kursu ${currency} na ${formatDate(transactionDate)}` });
                continue;
            }
            throw e;
        }
    }

    return { count, skipped };
};
