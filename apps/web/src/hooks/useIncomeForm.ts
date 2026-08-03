import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { usePersonalAccounts, useSavingsAccounts, useInvestmentAccounts, useCategories, useMonthlyPlan } from './useQueries';
import { useCategorization } from './useCategorization';
import { incomeSchema } from '../lib/validations';
import { type PlanItem } from '../types/api';

const INCOME_SOURCE_ACCOUNT_RESTRICTIONS: Record<string, ('personal' | 'savings' | 'investment')[]> = {
    'Wypłata': ['personal'],
    'Premia': ['personal'],
    'Ankieta': ['personal'],
    'Dywidenda': ['investment'],
    'Odsetki': ['personal', 'savings', 'investment'],
};

interface UseIncomeFormProps {
    transaction: any;
    onSuccess: () => void;
    onClose: () => void;
    /**
     * Data początkowa (YYYY-MM-DD) dla NOWEGO wpływu. Używana tylko wtedy, gdy nie edytujemy —
     * przy edycji zawsze wygrywa data z rekordu. Brak = dzisiejsza data.
     */
    defaultDate?: string;
}

export function useIncomeForm({ transaction, onSuccess, onClose, defaultDate }: UseIncomeFormProps) {
    const isEditing = !!transaction;
    const { success, error: toastError } = useToast();

    const { data: personalAccountsRaw = [] } = usePersonalAccounts();
    const { data: savingsAccountsRaw = [] } = useSavingsAccounts();
    const { data: investmentAccountsRaw = [] } = useInvestmentAccounts();
    const { data: categoriesRaw = [] } = useCategories();

    const allAccounts = useMemo(() => {
        const accs: any[] = [];
        accs.push(...(personalAccountsRaw as any[]).map(acc => ({ ...acc, accountType: 'personal' as const })));
        accs.push(...(savingsAccountsRaw as any[]).map(acc => ({ ...acc, accountType: 'savings' as const })));
        accs.push(...(investmentAccountsRaw as any[]).map(acc => ({ ...acc, accountType: 'investment' as const })));
        return accs;
    }, [personalAccountsRaw, savingsAccountsRaw, investmentAccountsRaw]);

    // Form states
    const [amount, setAmount] = useState(transaction?.amount?.toString() || '');
    const [description, setDescription] = useState(transaction?.description || 'Wypłata');
    const [date, setDate] = useState(
        transaction?.transactionDate
            ? new Date(transaction.transactionDate).toISOString().split('T')[0]
            : (defaultDate || new Date().toISOString().split('T')[0])
    );
    const [personalAccountId, setPersonalAccountId] = useState(() => {
        if (transaction) {
            if (transaction.personalAccountId) return transaction.personalAccountId;
            if (transaction.savingsAccountId) return transaction.savingsAccountId;
            if (transaction.investmentAccountId) return transaction.investmentAccountId;
            return 'HISTORICAL';
        }
        return '';
    });
    const [categoryId, setCategoryId] = useState<number | undefined>(
        typeof transaction?.categoryId === 'string' ? parseInt(transaction.categoryId) : transaction?.categoryId
    );
    const [note, setNote] = useState(transaction?.note || '');
    const [isRecurring, setIsRecurring] = useState(transaction?.isRecurring || false);
    const [recurrenceInterval, setRecurrenceInterval] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'ANNUALLY'>(
        (transaction?.recurrenceInterval as any) || 'MONTHLY'
    );
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(
        transaction?.recurrenceEndDate ? new Date(transaction.recurrenceEndDate).toISOString().split('T')[0] : ''
    );

    const [currency, setCurrency] = useState(transaction?.currency || 'PLN');
    const [exchangeRate, setExchangeRate] = useState<number>(transaction?.exchangeRate || 1);
    const [isFetchingRate, setIsFetchingRate] = useState(false);

    const [y, m] = date.split('-');
    const { data: monthlyPlan } = useMonthlyPlan(m, y);

    const [matchingPlanItem, setMatchingPlanItem] = useState<PlanItem | null>(null);
    const [savedIncomeId, setSavedIncomeId] = useState<string | null>(null);
    const [showLinkConfirm, setShowLinkConfirm] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { findCategoryByStore } = useCategorization();

    // Fetch rate
    useEffect(() => {
        if (!currency || currency === 'EMPTY' || currency === 'PLN' || currency === 'PKT') {
            setExchangeRate(1);
            return;
        }

        const fetchRate = async () => {
            setIsFetchingRate(true);
            try {
                const res = await api.get(`/expenses/exchange-rate?currency=${currency}&date=${date}`);
                setExchangeRate(res.data.rate);
            } catch (err) {
                console.warn('[useIncomeForm] Rate fetch failed:', err);
                setExchangeRate(1);
            } finally {
                setIsFetchingRate(false);
            }
        };
        fetchRate();
    }, [currency, date]);

    // Auto-select category "Wpływ"
    useEffect(() => {
        if (!categoryId && categoriesRaw.length > 0) {
            const wpis = (categoriesRaw as any[]).find(c => c.name === 'Wpływ');
            if (wpis) setCategoryId(wpis.id);
        }
    }, [categoriesRaw, categoryId]);

    // Currency reset on account change
    useEffect(() => {
        if (!personalAccountId || personalAccountId === 'HISTORICAL') return;
        const selectedAcc = allAccounts.find(a => a.id === personalAccountId);
        if (!selectedAcc) return;

        const effectiveCurrency = selectedAcc.currency || (selectedAcc.type === 'LOYALTY_CARD' ? 'PKT' : 'PLN');
        const availableCurrencies = (selectedAcc.balances && selectedAcc.balances.length > 0)
            ? selectedAcc.balances.map((b: any) => b.currency)
            : [effectiveCurrency];

        if (availableCurrencies.length === 1 && currency !== availableCurrencies[0]) {
            setCurrency(availableCurrencies[0]);
        } else if (!availableCurrencies.includes(currency)) {
            setCurrency(availableCurrencies[0] || 'PLN');
        }
    }, [personalAccountId, allAccounts, currency]);

    // Plan matching logic
    useEffect(() => {
        if (!description || description.length < 2 || !monthlyPlan) {
            setMatchingPlanItem(null);
            return;
        }
        const lowerDesc = description.toLowerCase();

        // 1. Try smart categorization
        const smartMatch = findCategoryByStore(description);
        if (smartMatch && !categoryId) {
            setCategoryId(smartMatch.id);
        }

        const parsedAmount = parseFloat(amount.toString().replace(',', '.'));
        const matching = (monthlyPlan as any).items.find((item: any) => {
            const itemStore = String(item.store || item.name || '');
            return !item.isDone &&
                (itemStore.toLowerCase().includes(lowerDesc) || lowerDesc.includes(itemStore.toLowerCase())) &&
                (Math.abs(item.amount - parsedAmount) < 0.01);
        });
        setMatchingPlanItem(matching || null);
    }, [description, amount, monthlyPlan, findCategoryByStore, categoryId]);

    const allowedAccountTypes = INCOME_SOURCE_ACCOUNT_RESTRICTIONS[description] || ['personal', 'savings', 'investment'];
    const filteredAccounts = allAccounts.filter(acc =>
        !acc.accountType || allowedAccountTypes.includes(acc.accountType)
    );

    // Domyślne konto: gdy wybór jest pusty lub spoza dozwolonych — preferuj konto główne
    useEffect(() => {
        if (personalAccountId === 'HISTORICAL') return;
        if (filteredAccounts.length === 0) return;
        if (filteredAccounts.find(acc => acc.id === personalAccountId)) return;
        const mainPersonal = filteredAccounts.find(acc => acc.accountType === 'personal' && acc.isMain);
        setPersonalAccountId(mainPersonal?.id || filteredAccounts[0].id);
    }, [filteredAccounts, personalAccountId]);

    const validate = () => {
        const formData = {
            amount,
            date,
            personalAccountId: personalAccountId === 'HISTORICAL' ? 'HISTORICAL' : personalAccountId,
            categoryId,
            description,
            currency,
            note,
            isRecurring,
            recurrenceInterval,
            recurrenceEndDate,
            fromAccountId: personalAccountId,
        };

        const result = incomeSchema.safeParse(formData);
        if (!result.success) {
            const newErrors: Record<string, string> = {};
            result.error.issues.forEach((issue: any) => {
                const path = issue.path[0];
                if (typeof path === 'string') newErrors[path] = issue.message;
            });
            setErrors(newErrors);
            return false;
        }
        setErrors({});
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        try {
            const selectedAccount = allAccounts.find(acc => acc.id === personalAccountId);
            const payload = {
                type: 'income',
                amount: parseFloat(amount),
                description,
                date,
                personalAccountId: personalAccountId === 'HISTORICAL' ? undefined : (selectedAccount?.accountType === 'personal' ? personalAccountId : undefined),
                savingsAccountId: personalAccountId === 'HISTORICAL' ? undefined : (selectedAccount?.accountType === 'savings' ? personalAccountId : undefined),
                investmentAccountId: personalAccountId === 'HISTORICAL' ? undefined : (selectedAccount?.accountType === 'investment' ? personalAccountId : undefined),
                categoryId,
                store: 'Wpływ',
                note: note || undefined,
                isRecurring,
                recurrenceInterval: isRecurring ? recurrenceInterval : undefined,
                recurrenceEndDate: isRecurring ? (recurrenceEndDate || null) : undefined,
                currency: currency || 'PLN',
                exchangeRate,
            };

            let incomeId: string;
            if (isEditing && transaction) {
                await api.put(`/expenses/${transaction.id}`, payload);
                incomeId = transaction.id.toString();
                success('Wpływ został zaktualizowany');
            } else {
                const response = await api.post('/expenses', payload);
                incomeId = response.data.id;
                success('Wpływ został dodany');
            }

            if (matchingPlanItem && !isEditing) {
                setSavedIncomeId(incomeId);
                setShowLinkConfirm(true);
            } else {
                onSuccess();
                onClose();
            }
        } catch (error) {
            console.error('Błąd podczas zapisywania wpływu', error);
            toastError('Nie udało się zapisać wpływu');
        } finally {
            setLoading(false);
        }
    };

    const handleLinkToPlan = async () => {
        if (matchingPlanItem && savedIncomeId) {
            try {
                await api.post(`/planning/link-transaction/${matchingPlanItem.id}`, { expenseId: savedIncomeId });
            } catch (err) {
                console.error('Error linking income:', err);
            }
        }
        setShowLinkConfirm(false);
        onSuccess();
        onClose();
    };

    return {
        amount, setAmount,
        description, setDescription,
        date, setDate,
        personalAccountId, setPersonalAccountId,
        categoryId, setCategoryId,
        note, setNote,
        isRecurring, setIsRecurring,
        recurrenceInterval, setRecurrenceInterval,
        recurrenceEndDate, setRecurrenceEndDate,
        currency, setCurrency,
        exchangeRate,
        isFetchingRate,
        matchingPlanItem,
        showLinkConfirm, setShowLinkConfirm,
        errors,
        loading,
        handleSubmit,
        handleLinkToPlan,
        allAccounts,
        filteredAccounts,
        isEditing
    };
}
