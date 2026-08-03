/**
 * Formatowanie kwot pieniężnych w całej aplikacji.
 * Kwoty finansowe zawsze zaokrąglamy do 2 miejsc po przecinku.
 */
export const formatMoney = (amount: number): string =>
    Number(amount).toLocaleString('pl-PL', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

export interface DisplayBalance {
    id?: string;
    currency: string;
    balance: number | string;
}

/**
 * Salda konta do wyświetlenia: per-walutowe balances[], a gdy ich brak —
 * główne saldo w walucie konta. Jedyne źródło prawdy dla kart i modali kont.
 */
export const getDisplayBalances = (account: {
    balance: number | string;
    currency?: string | null;
    balances?: DisplayBalance[] | null;
}): DisplayBalance[] =>
    (account.balances && account.balances.length > 0)
        ? account.balances
        : [{ currency: account.currency || 'PLN', balance: account.balance }];

/** Postęp celu oszczędnościowego — pozwala przekroczyć 100%, pasek capped. */
export const goalProgress = (current: number, target: number) => {
    const pct = target > 0 ? (current / target) * 100 : 0;
    return {
        pct: Math.round(pct),
        barWidth: Math.min(100, pct),
        exceeded: pct > 100,
        remaining: Math.max(0, target - current),
    };
};
