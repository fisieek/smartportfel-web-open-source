import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

/**
 * Rekoncyliacja sald (read-only) — wspólna logika dla skryptu CLI
 * (scripts/reconcile-balances.ts) i cronu (/api/system/cron/reconcile-balances).
 *
 * Inwarianty i znane odchylenia: patrz komentarz w scripts/reconcile-balances.ts.
 */

export interface DriftEntry {
    accountType: 'personal' | 'savings';
    accountId: string;
    accountName: string;
    /** '' dla kont oszczędnościowych (brak wymiaru waluty) */
    currency: string;
    /** balance - suma transakcji, jako string (Decimal) */
    drift: string;
}

const ZERO = new Prisma.Decimal(0);

const signedAmount = (type: string, amount: Prisma.Decimal): Prisma.Decimal =>
    type === 'income' ? amount : amount.mul(-1);

export async function computeDrifts(): Promise<{ drifts: DriftEntry[]; warns: DriftEntry[] }> {
    const drifts: DriftEntry[] = [];
    const warns: DriftEntry[] = [];

    const personalAccounts = await prisma.personalAccount.findMany({ include: { balances: true } });
    for (const acc of personalAccounts) {
        const [sourceExpenses, incomingTransfers, mortgagePayments] = await Promise.all([
            prisma.expense.findMany({
                where: { personalAccountId: acc.id },
                select: { type: true, amount: true, currency: true, targetAmount: true, targetCurrency: true }
            }),
            prisma.expense.findMany({
                where: { toPersonalAccountId: acc.id, type: 'internal_transfer' },
                select: { amount: true, currency: true }
            }),
            prisma.mortgagePayment.findMany({
                where: { mortgage: { personalAccountId: acc.id } },
                select: { totalAmount: true }
            })
        ]);

        const sums = new Map<string, Prisma.Decimal>();
        const addToSum = (currency: string, value: Prisma.Decimal) =>
            sums.set(currency, (sums.get(currency) ?? ZERO).add(value));

        for (const e of sourceExpenses) {
            addToSum(e.currency, signedAmount(e.type, e.amount));
            if (e.type === 'exchange' && e.targetAmount && e.targetCurrency) {
                addToSum(e.targetCurrency, e.targetAmount);
            }
        }
        for (const e of incomingTransfers) {
            addToSum(e.currency, e.amount);
        }
        for (const p of mortgagePayments) {
            addToSum('PLN', p.totalAmount.mul(-1));
        }

        for (const bal of acc.balances) {
            const derived = sums.get(bal.currency) ?? ZERO;
            if (!bal.balance.equals(derived)) {
                const entry: DriftEntry = {
                    accountType: 'personal',
                    accountId: acc.id,
                    accountName: acc.name,
                    currency: bal.currency,
                    drift: bal.balance.sub(derived).toString()
                };
                // Raty sprzed czerwca 2026 nie były księgowane w AccountBalance
                const isKnownDeviation = bal.currency === 'PLN' && mortgagePayments.length > 0;
                (isKnownDeviation ? warns : drifts).push(entry);
            }
        }
    }

    const savingsAccounts = await prisma.savingsAccount.findMany();
    for (const acc of savingsAccounts) {
        const [inflows, outflows] = await Promise.all([
            prisma.expense.aggregate({ where: { savingsAccountId: acc.id }, _sum: { amount: true } }),
            prisma.expense.aggregate({ where: { fromSavingsAccountId: acc.id }, _sum: { amount: true } })
        ]);
        const derived = (inflows._sum.amount ?? ZERO).sub(outflows._sum.amount ?? ZERO);
        if (!acc.balance.equals(derived)) {
            drifts.push({
                accountType: 'savings',
                accountId: acc.id,
                accountName: acc.name,
                currency: '',
                drift: acc.balance.sub(derived).toString()
            });
        }
    }

    return { drifts, warns };
}

export interface ReconcileResult {
    totalDrifts: number;
    /** dryfy nieobecne w baseline lub o zmienionej wartości — to jest sygnał alarmowy */
    newOrChanged: DriftEntry[];
    /** wpisy baseline, których drift zniknął (naprawiono/usunięto konto) */
    resolved: number;
    warns: number;
}

/**
 * Porównuje bieżące dryfy z baseline (balance_drift_baseline) i aktualizuje go:
 * - nowy/zmieniony drift → raportowany + zapisany jako nowy baseline
 *   (każda zmiana alarmuje dokładnie raz),
 * - drift zniknął → wpis baseline usuwany.
 */
export async function reconcileAgainstBaseline(): Promise<ReconcileResult> {
    const { drifts, warns } = await computeDrifts();
    const baselines = await prisma.balanceDriftBaseline.findMany();
    const baselineKey = (t: string, id: string, c: string) => `${t}|${id}|${c}`;
    const baselineMap = new Map(baselines.map(b => [baselineKey(b.accountType, b.accountId, b.currency), b]));

    const newOrChanged: DriftEntry[] = [];
    const seen = new Set<string>();

    for (const d of drifts) {
        const key = baselineKey(d.accountType, d.accountId, d.currency);
        seen.add(key);
        const base = baselineMap.get(key);
        if (!base || !base.drift.equals(new Prisma.Decimal(d.drift))) {
            newOrChanged.push(d);
            await prisma.balanceDriftBaseline.upsert({
                where: {
                    accountType_accountId_currency: {
                        accountType: d.accountType, accountId: d.accountId, currency: d.currency
                    }
                },
                create: {
                    accountType: d.accountType, accountId: d.accountId,
                    currency: d.currency, drift: new Prisma.Decimal(d.drift)
                },
                update: { drift: new Prisma.Decimal(d.drift) }
            });
        }
    }

    let resolved = 0;
    for (const b of baselines) {
        if (!seen.has(baselineKey(b.accountType, b.accountId, b.currency))) {
            await prisma.balanceDriftBaseline.delete({ where: { id: b.id } });
            resolved++;
        }
    }

    return { totalDrifts: drifts.length, newOrChanged, resolved, warns: warns.length };
}
