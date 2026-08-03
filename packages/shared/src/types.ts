export interface User {
    id: string;
    email: string;
    username?: string; // Added from Settings.tsx
    firstName?: string;
    lastName?: string;
}

export interface Category {
    id: number;
    name: string;
    color: string;
    description?: string;
    icon?: string | null;
    isSystemCategory?: boolean;
}

export interface PersonalAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
    currency: string;
    type: string;
    icon?: string;
    color?: string;
    isMain?: boolean;
    isMultiCurrency?: boolean;
    balances?: { currency: string; balance: number }[];
    isShared?: boolean;
    // Ustawiane przez backend dla kont wspólnych NALEŻĄCYCH do współczłonka gospodarstwa.
    isSharedFromHousehold?: boolean;
    ownerName?: string | null;
}

export interface SavingsAccount {
    id: string;
    name: string;
    bank: string;
    balance: number;
}

// Zagregowana POZYCJA inwestycyjna (per aktywo, scalona ponad kontami) z endpointu /investments/positions.
export interface InvestmentPositionTxn {
    id: string;
    accountId: string | null;
    accountName: string | null;
    quantity: number;
    purchasePrice: number;
    currentValue: number;
    currency: string;
    purchaseDate: string;
}

export interface InvestmentPosition {
    key: string;
    name: string;
    type: string;
    currency: string; // 'MIXED' gdy aktywo trzymane w różnych walutach
    totalQuantity: number;
    investedPLN: number;
    currentValuePLN: number;
    plPLN: number;
    plPct: number;
    avgPricePLN: number;
    allocationPct: number;
    accounts: string[];
    transactionsCount: number;
    sparkline: { date: string; valuePLN: number }[];
    /** Kurs NBP niedostępny — wartości PLN policzone po kursie z cache (bug I2). */
    staleRate?: boolean;
}

export interface PositionsResponse {
    positions: InvestmentPosition[];
    totals: {
        investedPLN: number;
        currentValuePLN: number;
        plPLN: number;
        plPct: number;
        cashPLN: number;
        equityPLN: number;
        /** Któraś wartość policzona po nieaktualnym kursie z cache (NBP niedostępne). */
        staleRate?: boolean;
        /** Najstarsza data kursu użytego z cache ('YYYY-MM-DD') — do komunikatu w UI. */
        rateAsOf?: string;
    };
    allocationByType: { type: string; valuePLN: number; pct: number }[];
}

// Sprzedany lot inwestycyjny ze zrealizowanym zyskiem/stratą (z endpointu /investments/sold).
export interface SoldPosition {
    id: string;
    name: string;
    type: string;
    currency: string;
    quantity: number;
    purchasePrice: number;
    salePrice: number;
    purchaseDate: string;
    soldAt: string;
    accountName: string | null;
    realizedPLN: number;
    realizedPct: number;
}

export interface SoldPositionsResponse {
    positions: SoldPosition[];
    totalRealizedPLN: number;
}

export interface InvestmentAccount {
    id: string;
    name: string;
    description?: string;
    balance: number;
    provider?: string;
    currency?: string;
    accountType?: 'STANDARD' | 'IKE' | 'IKZE';
    ikzeBusiness?: boolean;
}

export interface SavingsGoal {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    isMain?: boolean;
}

export interface Investment {
    id: string;
    name: string;
    currentValue: number;
}

export interface Transaction {
    id: string;
    amount: number;
    date: string; // fallback date
    transactionDate?: string; // main date field often used
    store: string;
    category?: Category;
    categoryId?: number;
    accountId: string;
    type: 'expense' | 'income' | 'internal_transfer' | 'savings_transfer' | 'investment_transfer';
    description: string; // used for store name/description in UI
    note?: string;
    isPlanned?: boolean;
    currency: string;
    plnAmount?: number;
    personalAccountId?: string;
    personalAccount?: {
        id: string;
        name: string;
        bank: string;
        type?: string;
        currency?: string;
        balance?: number;
    };
    fromSavingsAccountId?: string;
    toPersonalAccountId?: string;
    savingsAccountId?: string;
    investmentAccountId?: string;
    savingsGoalId?: string;
    storeId?: string;
    exchangeRate?: number;
    originalAmount?: number;
    isRecurring?: boolean;
    recurrenceInterval?: string;
    recurrenceEndDate?: string;
    _side?: 'source' | 'target' | 'exchange_source' | 'exchange_target';
}

export interface PlanItem extends PlannedTransaction {
    linkedRealExpenseId?: string;
}

export interface PlannedTransaction {
    id: string;
    amount: number;
    dayOfMonth?: number;
    month?: number;
    year?: number;
    store: string;
    categoryId: number;
    category?: Category;
    isExecuted: boolean;
    type: 'expense' | 'income';
    currency?: string;
    repeatType?: 'NONE' | 'MONTHLY';
}

export interface ApiResponse<T> {
    data: T;
    message?: string;
    error?: string;
}
