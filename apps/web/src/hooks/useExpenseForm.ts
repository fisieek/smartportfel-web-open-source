import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { useTransactionFormData, useMonthlyPlan } from './useQueries';
import { useCategorization } from './useCategorization';
import { expenseSchema, transferSchema } from '../lib/validations';
import { type PlanItem } from '../types/api';

export type TransactionType = 'expense' | 'income' | 'internal_transfer' | 'savings_transfer' | 'investment_transfer';

interface UseExpenseFormProps {
    transaction: any;
    onSuccess: () => void;
    onClose: () => void;
    /**
     * Data początkowa (YYYY-MM-DD) dla NOWEJ transakcji. Używana tylko wtedy, gdy nie edytujemy —
     * przy edycji zawsze wygrywa data z rekordu. Brak = dzisiejsza data.
     */
    defaultDate?: string;
}

export function useExpenseForm({ transaction, onSuccess, onClose, defaultDate }: UseExpenseFormProps) {
    const isEditing = !!transaction;
    const [transactionType, setTransactionType] = useState<TransactionType>(transaction?.type || 'expense');
    const { success, error: toastError, warning } = useToast();

    const {
        personalAccounts,
        savingsAccounts,
        investmentAccounts,
        categories,
        savingsGoals: goals,
        stores: allUserStores,
    } = useTransactionFormData();

    // Form states
    const [amount, setAmount] = useState(transaction?.amount?.toString() || '');
    const [date, setDate] = useState(
        transaction?.transactionDate
            ? new Date(transaction.transactionDate).toISOString().split('T')[0]
            : (defaultDate || new Date().toISOString().split('T')[0])
    );
    const [personalAccountId, setPersonalAccountId] = useState(
        transaction?.personalAccountId || (transaction && !transaction.personalAccountId && !transaction.fromSavingsAccountId && !transaction.investmentAccountId ? 'HISTORICAL' : '')
    );
    const [fromSavingsAccountId, setFromSavingsAccountId] = useState(transaction?.fromSavingsAccountId || '');
    const [fromInvestmentAccountId, setFromInvestmentAccountId] = useState(
        transaction?.type === 'internal_transfer' && transaction?.investmentAccountId && (transaction?.toPersonalAccountId || transaction?.savingsAccountId)
            ? transaction.investmentAccountId
            : ''
    );
    const [toPersonalAccountId, setToPersonalAccountId] = useState(transaction?.toPersonalAccountId || '');
    const [toInvestmentAccountId, setToInvestmentAccountId] = useState(
        transaction?.type === 'internal_transfer' && transaction?.investmentAccountId && (transaction?.personalAccountId || transaction?.fromSavingsAccountId)
            ? transaction.investmentAccountId
            : ''
    );

    const [categoryId, setCategoryId] = useState(transaction?.categoryId?.toString() || '');
    const [store, setStore] = useState(transaction?.store || '');
    const [storeId, setStoreId] = useState(transaction?.storeId || '');
    const [note, setNote] = useState(transaction?.note || '');
    const [savingsAccountId, setSavingsAccountId] = useState(transaction?.savingsAccountId || '');
    const [savingsGoalId, setSavingsGoalId] = useState(transaction?.savingsGoalId || '');

    const [isRecurring, setIsRecurring] = useState(transaction?.isRecurring || false);
    const [recurrenceInterval, setRecurrenceInterval] = useState(transaction?.recurrenceInterval || 'MONTHLY');
    const [recurrenceEndDate, setRecurrenceEndDate] = useState(
        transaction?.recurrenceEndDate ? new Date(transaction.recurrenceEndDate).toISOString().split('T')[0] : ''
    );

    const [currency, setCurrency] = useState(transaction?.currency || 'PLN');
    const [exchangeRate, setExchangeRate] = useState<number>(transaction?.exchangeRate || 1);

    const [y, m] = date.split('-');
    const { data: monthlyPlan } = useMonthlyPlan(m, y);

    const [matchingPlanItem, setMatchingPlanItem] = useState<PlanItem | null>(null);
    const [savedExpenseId, setSavedExpenseId] = useState<string | null>(null);
    const [showLinkConfirm, setShowLinkConfirm] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { findCategoryByStore } = useCategorization();

    // Auto-select main account
    useEffect(() => {
        if (!isEditing && personalAccounts.length > 0 && !personalAccountId && !fromSavingsAccountId && !fromInvestmentAccountId) {
            const mainAcc = (personalAccounts as any[]).find(acc => acc.isMain);
            if (mainAcc) setPersonalAccountId(mainAcc.id);
        }
    }, [personalAccounts, isEditing, personalAccountId, fromSavingsAccountId, fromInvestmentAccountId]);

    // Auto-select main goal
    useEffect(() => {
        if (goals.length > 0 && !savingsGoalId) {
            const mainGoal = (goals as any[]).find(g => g.isMain);
            if (mainGoal) setSavingsGoalId(mainGoal.id);
        }
    }, [goals, savingsGoalId]);

    // Fetch exchange rate
    useEffect(() => {
        if (!currency || currency === 'EMPTY' || currency === 'PLN' || currency === 'PKT') {
            setExchangeRate(1);
            return;
        }

        const fetchRate = async () => {
            try {
                const res = await api.get(`/expenses/exchange-rate?currency=${currency}&date=${date}`);
                setExchangeRate(res.data.rate);
            } catch (err) {
                console.warn('[useExpenseForm] Rate fetch failed:', err);
                setExchangeRate(1);
            }
        };

        fetchRate();
    }, [currency, date]);

    // Update currency when account changes
    useEffect(() => {
        if (!personalAccountId || personalAccountId === 'HISTORICAL') return;
        const selectedAcc = (personalAccounts as any[]).find(a => a.id === personalAccountId);
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
    }, [personalAccountId, personalAccounts, currency]);

    // Auto-select store and category for specific account types
    useEffect(() => {
        if (!personalAccountId || personalAccountId === 'HISTORICAL') return;
        if (isEditing && transaction?.personalAccountId === personalAccountId) return;

        const selectedAcc = (personalAccounts as any[]).find(a => a.id === personalAccountId);
        if (!selectedAcc || !selectedAcc.type) return;

        const AUTO_SELECT_TYPES = ['LOYALTY_CARD', 'GIFT_CARD', 'VOUCHER'];
        if (AUTO_SELECT_TYPES.includes(selectedAcc.type) && selectedAcc.bank) {
            const shopName = selectedAcc.bank;
            if (store !== shopName) {
                setStore(shopName);
                const matchedStore = (allUserStores as any[]).find(s => s.name.toLowerCase() === shopName.toLowerCase());
                if (matchedStore) {
                    setStoreId(matchedStore.id);
                    if (matchedStore.category) setCategoryId(matchedStore.category.id.toString());
                } else {
                    setStoreId('');
                }
            }
        }
    }, [personalAccountId, personalAccounts, allUserStores, isEditing, transaction, store]);

    // Auto-classify and Plan detection
    useEffect(() => {
        const setFallbackCategory = () => {
            const otherCat = (categories as any[]).find(c => c.name === 'Inne');
            if (otherCat) setCategoryId(otherCat.id.toString());
        };

        if (!store || store.length < 2) {
            setFallbackCategory();
            setMatchingPlanItem(null);
            return;
        }

        if (storeId) {
            setMatchingPlanItem(null);
            return;
        }

        const lowerStore = store.toLowerCase();

        // 1. Check user stores first (highest priority)
        const matchedUserStore = (allUserStores as any[]).find(s => s.name.toLowerCase() === lowerStore);
        if (matchedUserStore && matchedUserStore.category) {
            setCategoryId(matchedUserStore.category.id.toString());
        } else {
            // 2. Fallback to smart categorization patterns
            const smartCategory = findCategoryByStore(store);
            if (smartCategory) {
                setCategoryId(smartCategory.id.toString());
            }
        }

        // 3. Plan detection
        if (monthlyPlan && (monthlyPlan as any).items) {
            const parsedAmount = parseFloat(amount.toString().replace(',', '.'));
            const matching = (monthlyPlan as any).items.find((item: any) => {
                const itemStore = String(item.store || item.name || '');
                return !item.isDone &&
                    (itemStore.toLowerCase().includes(lowerStore) || lowerStore.includes(itemStore.toLowerCase())) &&
                    (Math.abs(item.amount - parsedAmount) < 0.01);
            });
            setMatchingPlanItem(matching || null);
        }
    }, [store, storeId, amount, categories, monthlyPlan, findCategoryByStore, allUserStores]);

    const validate = () => {
        const formData = {
            amount,
            date,
            personalAccountId: personalAccountId === 'HISTORICAL' ? 'HISTORICAL' : (personalAccountId || fromSavingsAccountId || fromInvestmentAccountId),
            categoryId,
            store,
            currency,
            note,
            isRecurring,
            recurrenceInterval,
            recurrenceEndDate,
            fromAccountId: personalAccountId || fromSavingsAccountId || fromInvestmentAccountId,
            toAccountId: toPersonalAccountId || savingsAccountId || toInvestmentAccountId,
        };

        const schema = transactionType === 'expense' ? expenseSchema : transferSchema;
        const result = schema.safeParse(formData);

        if (!result.success) {
            const newErrors: Record<string, string> = {};
            result.error.issues.forEach((issue: any) => {
                const path = issue.path[0];
                if (typeof path === 'string') {
                    newErrors[path] = issue.message;
                }
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
            const payload: any = {
                type: transactionType,
                amount: parseFloat(amount.toString().replace(',', '.')),
                currency,
                exchangeRate,
                date,
                personalAccountId: personalAccountId === 'HISTORICAL' ? null : (personalAccountId || undefined),
                fromSavingsAccountId: fromSavingsAccountId || undefined,
            };

            if (transactionType === 'expense') {
                let finalCatId = categoryId;
                if (!finalCatId) {
                    const inneCat = (categories as any[]).find(c => c.name === 'Inne');
                    if (inneCat) finalCatId = inneCat.id.toString();
                }
                payload.categoryId = finalCatId;
                payload.store = store || undefined;
                payload.storeId = storeId || undefined;
                payload.note = note || undefined;
                payload.description = store || 'Wydatek';
            } else if (transactionType === 'internal_transfer') {
                payload.personalAccountId = personalAccountId || undefined;
                payload.fromSavingsAccountId = fromSavingsAccountId || undefined;
                payload.toPersonalAccountId = toPersonalAccountId || undefined;
                payload.savingsAccountId = savingsAccountId || undefined;
                payload.investmentAccountId = fromInvestmentAccountId || toInvestmentAccountId || undefined;
                payload.savingsGoalId = (savingsAccountId && savingsGoalId) ? savingsGoalId : undefined;
                payload.description = 'Przelew wewnętrzny';
            }

            payload.isRecurring = isRecurring;
            if (isRecurring) {
                payload.recurrenceInterval = recurrenceInterval;
                payload.recurrenceEndDate = recurrenceEndDate || null;
            }

            let expenseId: string;
            if (isEditing && transaction) {
                await api.put(`/expenses/${transaction.id}`, payload);
                expenseId = transaction.id;

                const selectedAcc = (personalAccounts as any[]).find(acc => acc.id === personalAccountId);
                const parsedAmount = parseFloat(amount.toString().replace(',', '.'));
                if (selectedAcc && (selectedAcc.balance - parsedAmount) < 0) {
                    warning('Transakcja została zaktualizowana (podjęto środki z debetu)');
                } else {
                    success('Transakcja została zaktualizowana');
                }
            } else {
                const response = await api.post('/expenses', payload);
                expenseId = response.data.id;

                const selectedAcc = (personalAccounts as any[]).find(acc => acc.id === personalAccountId);
                const parsedAmount = parseFloat(amount.toString().replace(',', '.'));
                if (selectedAcc && (selectedAcc.balance - parsedAmount) < 0) {
                    warning('Transakcja została dodana (podjęto środki z debetu)');
                } else {
                    success('Transakcja została dodana');
                }
            }

            if (matchingPlanItem && !isEditing) {
                setSavedExpenseId(expenseId);
                setShowLinkConfirm(true);
            } else {
                onSuccess();
                onClose();
            }
        } catch (error: any) {
            console.error('Błąd podczas zapisywania transakcji', error);
            toastError(error.response?.data?.message || 'Nie udało się zapisać transakcji');
        } finally {
            setLoading(false);
        }
    };

    const handleLinkToPlan = async () => {
        if (matchingPlanItem && savedExpenseId) {
            try {
                await api.post(`/planning/link-transaction/${matchingPlanItem.id}`, { expenseId: savedExpenseId });
            } catch (err) {
                console.error('Error linking expense:', err);
            }
        }
        setShowLinkConfirm(false);
        onSuccess();
        onClose();
    };

    return {
        isEditing,
        transactionType,
        setTransactionType,
        amount,
        setAmount,
        date,
        setDate,
        personalAccountId,
        setPersonalAccountId,
        fromSavingsAccountId,
        setFromSavingsAccountId,
        fromInvestmentAccountId,
        setFromInvestmentAccountId,
        toPersonalAccountId,
        setToPersonalAccountId,
        toInvestmentAccountId,
        setToInvestmentAccountId,
        categoryId,
        setCategoryId,
        store,
        setStore,
        storeId,
        setStoreId,
        note,
        setNote,
        savingsAccountId,
        setSavingsAccountId,
        savingsGoalId,
        setSavingsGoalId,
        isRecurring,
        setIsRecurring,
        recurrenceInterval,
        setRecurrenceInterval,
        recurrenceEndDate,
        setRecurrenceEndDate,
        currency,
        setCurrency,
        exchangeRate,
        matchingPlanItem,
        showLinkConfirm,
        setShowLinkConfirm,
        errors,
        setErrors,
        loading,
        handleSubmit,
        handleLinkToPlan,
        personalAccounts,
        savingsAccounts,
        investmentAccounts,
        categories,
        goals,
        allUserStores
    };
}
