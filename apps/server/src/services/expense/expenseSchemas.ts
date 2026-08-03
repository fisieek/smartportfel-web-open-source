import { z } from 'zod';

/**
 * Kontrakt wejścia dla logiki księgowania (`expenseCrudService`).
 *
 * Zakres schematu: KSZTAŁT i TYPY wejścia (coerce string/Decimal → number,
 * string/Date → Date, enum typu i interwału, stripowanie nieznanych pól).
 * Walidacja WARUNKOWA per-typ (wymagane konta, dane przewalutowania) zostaje
 * w serwisie — schemat jej nie dubluje.
 *
 * Callerzy `createExpenseBusinessLogic`:
 *  - `expenseController.createExpense` (surowe `req.body`, amount/date jako number/string),
 *  - `planningController.markItemAsPaid` (amount jako `Prisma.Decimal`, date jako `Date`!),
 *  - `mcpServer.commit_transactions` (obiekt składany ręcznie, amount:number).
 * Dlatego amount/date są `z.coerce.*` — muszą łykać Decimal/Date bez utraty danych.
 */

// Rzucane, gdy wejście nie spełnia kontraktu. Kontroler mapuje na 400
// (przed tym etapem błędy walidacji wpadały w `else` → 500).
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export const EXPENSE_TYPES = [
    'expense',
    'income',
    'internal_transfer',
    'savings_transfer',
    'investment_transfer',
    'exchange',
] as const;

// categoryId bywa stringiem albo liczbą (serwis robi `Number(categoryId)`); nie coerce'ujemy,
// żeby zachować dzisiejsze `categoryId ? Number(categoryId) : null` (w tym '' → null).
const idLike = z.union([z.string(), z.number()]).nullish();

export const expenseCreateSchema = z
    .object({
        type: z.enum(EXPENSE_TYPES).default('expense'),
        amount: z.coerce.number().positive(),
        date: z.coerce.date(),
        // Bez transform uppercase — istnieje waluta 'PKT' i chcemy zachowanie 1:1.
        currency: z.string().length(3).default('PLN'),
        description: z.string().nullish(),
        categoryId: idLike,
        store: z.string().nullish(),
        storeId: z.string().nullish(),
        note: z.string().nullish(),
        personalAccountId: z.string().nullish(),
        toPersonalAccountId: z.string().nullish(),
        fromSavingsAccountId: z.string().nullish(),
        savingsAccountId: z.string().nullish(),
        investmentId: z.string().nullish(),
        investmentAccountId: z.string().nullish(),
        savingsGoalId: z.string().nullish(),
        isRecurring: z.boolean().nullish(),
        recurrenceInterval: z.enum(['MONTHLY', 'ANNUALLY']).nullish(),
        // Serwis robi `recurrenceEndDate ? new Date(recurrenceEndDate) : null` — trzymamy luźno.
        recurrenceEndDate: z.union([z.string(), z.date()]).nullish(),
        targetAmount: z.coerce.number().positive().nullish(),
        targetCurrency: z.string().nullish(),
    })
    .strip();

export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;

/**
 * Mapuje `ZodError` z `expenseCreateSchema` na ISTNIEJĄCE polskie komunikaty,
 * żeby kontrakt błędów dla web/mobile/MCP nie zmienił się. `raw` = surowe wejście
 * (potrzebne, by odróżnić „brak kwoty/daty" od „kwota ≤ 0" tak jak dziś).
 */
export const mapCreateExpenseError = (error: z.ZodError, raw: any): ValidationError => {
    // Lustro dawnego `if (!amount || !date)` — falsy (0, '', null, undefined) → ten sam komunikat.
    if (!raw?.amount || !raw?.date) {
        return new ValidationError('Kwota i data są wymagane');
    }

    const issue = error.issues[0];
    const field = issue?.path[0];

    if (field === 'amount' || field === 'date') {
        return new ValidationError('Kwota musi być liczbą większą od zera');
    }
    if (field === 'recurrenceInterval') {
        return new ValidationError('Nieprawidłowy interwał cykliczności (dozwolone: MONTHLY, ANNUALLY)');
    }

    // Pozostałe (np. currency o złej długości, zły typ) — komunikat Zoda jako fallback.
    return new ValidationError(issue?.message ?? 'Nieprawidłowe dane transakcji');
};

/**
 * Kontrakt wejścia dla edycji (`updateExpenseBusinessLogic`) — semantyka PARTIAL:
 * pole ABSENT (`undefined`) = „nie zmieniaj", pole `null`/falsy = „wyczyść" (serwis
 * rozróżnia to przez `field !== undefined ? ... : old`). Dlatego BRAK defaultów i
 * `.optional()`/`.nullish()` — inaczej rozróżnienie undefined vs null by zniknęło.
 *
 * Świadome (spójne z 4a): `type`/`amount`/`currency`/`recurrenceInterval` walidowane
 * (enum/liczba/długość) — złe wejście daje 400 zamiast dawnego 500 (plain Error →
 * `else` w kontrolerze) lub cichego zapisu śmieci. `amount` bez `.positive()` — dawny
 * update tego nie sprawdzał (1:1); coerce łapie tylko nie-liczby (dawniej crash w Prismie).
 * `date`/`recurrenceEndDate` luźne (bez coerce) — serwis robi `x ? new Date(x) : old`,
 * więc falsy ('') musi dalej znaczyć „zachowaj/wyczyść" jak dotąd.
 */
export const expenseUpdateSchema = z
    .object({
        type: z.enum(EXPENSE_TYPES).optional(),
        amount: z.coerce.number().optional(),
        date: z.union([z.string(), z.date()]).optional(),
        currency: z.string().length(3).optional(),
        description: z.string().nullish(),
        categoryId: idLike,
        store: z.string().nullish(),
        storeId: z.string().nullish(),
        note: z.string().nullish(),
        personalAccountId: z.string().nullish(),
        toPersonalAccountId: z.string().nullish(),
        fromSavingsAccountId: z.string().nullish(),
        savingsAccountId: z.string().nullish(),
        investmentId: z.string().nullish(),
        investmentAccountId: z.string().nullish(),
        savingsGoalId: z.string().nullish(),
        isRecurring: z.boolean().nullish(),
        recurrenceInterval: z.enum(['MONTHLY', 'ANNUALLY']).nullish(),
        recurrenceEndDate: z.union([z.string(), z.date()]).nullish(),
        targetAmount: z.coerce.number().nullish(),
        targetCurrency: z.string().nullish(),
    })
    .strip();

export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;

export const mapUpdateExpenseError = (error: z.ZodError): ValidationError => {
    const issue = error.issues[0];
    const field = issue?.path[0];

    if (field === 'recurrenceInterval') {
        return new ValidationError('Nieprawidłowy interwał cykliczności (dozwolone: MONTHLY, ANNUALLY)');
    }
    if (field === 'amount') {
        return new ValidationError('Kwota musi być liczbą');
    }

    return new ValidationError(issue?.message ?? 'Nieprawidłowe dane transakcji');
};
