import { z } from 'zod';

// Wspólne reguły
const amountSchema = z.string().refine((val) => {
    const num = parseFloat(val);
    return !isNaN(num) && num > 0;
}, {
    message: "Kwota musi być liczbą większą od 0"
});

const dateSchema = z.string().min(1, "Data jest wymagana");

// Schemat Wydatku
export const expenseSchema = z.object({
    amount: amountSchema,
    date: dateSchema,
    personalAccountId: z.string().min(1, "Wybierz konto"),
    categoryId: z.string().min(1, "Wybierz kategorię"),
    store: z.string().min(1, "Wpisz nazwę sklepu"),
    currency: z.string().default('PLN'),
    note: z.string().optional(),
    isRecurring: z.boolean().optional(),
    recurrenceInterval: z.string().optional(),
    recurrenceEndDate: z.string().optional(),
});

// Schemat Przychodu
export const incomeSchema = z.object({
    amount: amountSchema,
    date: dateSchema,
    personalAccountId: z.string().min(1, "Wybierz konto"),
    description: z.string().min(1, "Wpisz źródło przychodu"),
    categoryId: z.union([z.number(), z.string()]).optional(),
    currency: z.string().default('PLN'),
    note: z.string().optional(),
    isRecurring: z.boolean().optional(),
    recurrenceInterval: z.string().optional(),
    recurrenceEndDate: z.string().optional(),
});

// Schemat Przelewu (Wewnętrznego/Oszczędnościowego/Inwestycyjnego)
export const transferSchema = z.object({
    amount: amountSchema,
    date: dateSchema,
    fromAccountId: z.string().min(1, "Wybierz konto źródłowe"),
    toAccountId: z.string().min(1, "Wybierz konto docelowe"),
    currency: z.string().default('PLN'),
    note: z.string().optional(),
}).refine(data => data.fromAccountId !== data.toAccountId, {
    message: "Konto źródłowe i docelowe muszą być różne",
    path: ["toAccountId"]
});

export type ExpenseFormData = z.infer<typeof expenseSchema>;
export type IncomeFormData = z.infer<typeof incomeSchema>;
export type TransferFormData = z.infer<typeof transferSchema>;
