import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';

const MAX_RETRIES = 3;

/**
 * Transakcja dla operacji na saldach. Serializable eliminuje TOCTOU:
 * dwie równoległe operacje na tym samym koncie nie mogą obie przejść kontroli
 * debetu na podstawie tego samego (nieaktualnego) salda. Konflikt serializacji
 * (P2034) jest bezpieczny do ponowienia — stąd retry z krótkim backoffem.
 */
export async function runFinancialTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    opts: { timeout?: number } = {}
): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await prisma.$transaction(fn, {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                timeout: opts.timeout ?? 15000,
            });
        } catch (err: any) {
            if (err?.code === 'P2034' && attempt < MAX_RETRIES) {
                lastError = err;
                await new Promise(resolve => setTimeout(resolve, attempt * 50));
                continue;
            }
            throw err;
        }
    }
    throw lastError;
}
