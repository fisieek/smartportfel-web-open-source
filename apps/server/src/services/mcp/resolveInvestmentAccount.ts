import prisma from '../../lib/prisma';

export interface ResolvedInvestmentAccount {
    id: string;
    name: string;
    provider: string;
    balance: number;
    currency: string;
    accountType: string;
}

/**
 * Konto inwestycyjne docelowe: po nazwie (case-insensitive) wśród kont usera;
 * brak nazwy/dopasowania → pierwsze (najstarsze) konto. null, gdy brak kont.
 */
export async function resolveInvestmentAccount(
    userId: string,
    accountName?: string
): Promise<ResolvedInvestmentAccount | null> {
    const accounts = await prisma.investmentAccount.findMany({
        where: { userId, closedAt: null } as any,
        orderBy: { createdAt: 'asc' },
    });
    if (accounts.length === 0) return null;

    let chosen = accounts[0];
    if (accountName) {
        const byName = accounts.find(a => a.name.toLowerCase() === accountName.trim().toLowerCase());
        if (byName) chosen = byName;
    }

    return {
        id: chosen.id,
        name: chosen.name,
        provider: chosen.provider,
        balance: Number(chosen.balance),
        currency: chosen.currency || 'PLN',
        accountType: chosen.accountType,
    };
}
