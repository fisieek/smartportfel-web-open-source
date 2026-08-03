import prisma from '../../lib/prisma';
import { runFinancialTransaction } from '../../utils/financialTransaction';
import { checkBalanceWithTx } from './balanceService';

// ─────────────────────────────────────────────────────────────────────────────
// Słownik wzorców sklepów – stała na poziomie modułu, nie zaśmieca logiki
// ─────────────────────────────────────────────────────────────────────────────
export const STORE_PATTERNS: Record<string, string[]> = {
    'Sklepy spożywcze': ['biedronka', 'lidl', 'kaufland', 'auchan', 'carrefour', 'tesco', 'żabka', 'zabka', 'lewiatan', 'dino', 'netto', 'stokrotka', 'aldi', 'społem', 'spolem', 'pdp', 'mięso', 'warzywa', 'owoce', 'pieczywo', 'nabiał', 'ryby', 'mrożonki', 'słodycze', 'napoje', 'chleb', 'bułki', 'mleko', 'ser', 'jaja', 'woda', 'makaron', 'kasza', 'herbata', 'musli', 'chusteczki', 'majonez', 'czipsy', 'chipsy', 'herbaty', 'wafle kukurydziane', 'lody', 'slodycze', 'przyprawy'],
    'Stacje Paliw': ['orlen', 'bp', 'shell', 'lotos', 'circle k', 'circlek', 'paliwo', 'fuel', 'stacja paliw'],
    'Restauracje': ['mcdonalds', 'kfc', 'burger', 'pizza', 'pizzeria', 'ristorante', 'restaurant', 'restauracja', 'pyszne', 'wolt', 'glovo', 'kebab', 'sushi', 'trattoria', 'bistro', 'kawiarnia', 'starbucks', 'costa', 'grycan', 'mcdonald', 'manekin'],
    'Rozrywka': ['cinema', 'kino', 'netflix', 'spotify', 'steam', 'playstation', 'xbox', 'nintendo', 'ticketmaster', 'ebilet', 'eventim', 'hbo', 'disney', 'multikino', 'helios', 'alkohol', 'papierosy', 'wódka', 'piwo', 'wino', 'tytoń', 'koncert', 'koncerty', 'opener', 'bilard', 'prezent', 'prezenty'],
    'Służba zdrowia': ['dermatolog', 'dentysta', 'stomatolog', 'ortodonta', 'okulista', 'lekarz', 'doctor', 'lux med', 'luxmed', 'medicover', 'badania', 'kardiolog', 'fizjoterapeuta', 'physio', 'przychodnia', 'szpital', 'laboratorium', 'diagnostyka'],
    'Apteki': ['apteka', 'pharmacy', 'doz', 'gemini', 'cefarm', 'superpharm', 'super-pharm', 'leki', 'lek'],
    'Sklepy kosmetyczne': ['rossmann', 'hebe', 'douglas', 'sephora', 'natura', 'chemia', 'okres'],
    'Transport i Przejazdy': ['uber', 'bolt', 'free now', 'freenow', 'taxi', 'mpk', 'ztm', 'jakdojade', 'pkp', 'intercity', 'skm', 'bilety', 'autostrada', 'toll', 'vignette', 'hulajnoga', 'benzyna', 'paliwo', 'orlen', 'shell', 'bp', 'samochód'],
    'Markety budowlane': ['castorama', 'leroy', 'obi', 'bricoman', 'brico', 'praktiker', 'merlin'],
    'Elektronika': ['rtv euro agd', 'euro agd', 'media expert', 'media markt', 'mediamarkt', 'neonet', 'komputronik', 'x-kom', 'xkom', 'max elektro', 'sferis', 'elektronika', 'komputer'],
    'Ubrania i buty': ['zara', 'h&m', 'hm', 'reserved', 'eobuwie', 'zalando', 'modivo', 'c&a', 'ca', 'pepco', 'lpp', 'ccc', 'deichmann', 'answear', 'buty', 'odzież', 'ubrania'],
    'Podróże': ['booking', 'airbnb', 'lot', 'ryanair', 'wizzair', 'hotel', 'nocleg', 'tui', 'itaka', 'rainbow', 'wyjazd'],
    'Zakupy internetowe': ['allegro', 'amazon', 'ebay', 'aliexpress', 'temu', 'shein', 'inpost', 'paczkomat'],
    'Abonamenty': ['orange', 't-mobile', 'tmobile', 'play', 'plus', 'upc', 'vectra', 'multimedia', 'abonament', 'canal+', 'cyfrowy polsat', 'telefon'],
    'Zajęcia Sportowe': ['multisport', 'gym', 'siłownia', 'fitness', 'basen', 'decathlon', 'martes', 'intersport', 'zdrofit', 'cityfit'],
    'Opłaty': ['pge', 'gaz', 'prąd', 'prad', 'śmieci', 'czynsz', 'podatki', 'tauron', 'energa', 'pgnig', 'wodociągi', 'mieszkanie', 'składka w pracy'],
    'Dom': ['ikea', 'jysk', 'duka', 'home&you', 'action', 'tedi', 'agata meble', 'black red white', 'brw'],
    'Jedzenie i napoje': ['frisco', 'barmani', 'alkohol', 'winoteka'],
    'Usługi beauty': ['fryzjer', 'barber', 'kosmetyczka', 'paznokcie', 'manicure', 'pedicure', 'beauty'],
    'Edukacja': ['księgarnia', 'empik', 'kurs', 'szkoła', 'uczelnia', 'udemy', 'coursera', 'angielski', 'english', 'język'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Logika zmiany kategorii transakcji (z synchronizacją salda i typu)
// ─────────────────────────────────────────────────────────────────────────────
export const updateExpenseCategoryLogic = async (
    userId: string,
    expenseId: string,
    categoryId: number | null
) => {
    return await runFinancialTransaction(async (tx) => {
        const expense = await tx.expense.findFirst({
            where: { id: expenseId, userId }
        });

        if (!expense) {
            throw new Error('NOT_FOUND');
        }

        const newCategory = categoryId
            ? await tx.category.findUnique({ where: { id: categoryId } })
            : null;

        let newType = expense.type;
        if (newCategory?.name === 'Wpływ') {
            newType = 'income';
        } else if (expense.type === 'income') {
            newType = 'expense';
        }

        const amount = expense.amount;

        // Krok 1: cofnij poprzedni wpływ na saldo
        if (expense.personalAccountId) {
            if (expense.type === 'income') {
                await tx.personalAccount.update({
                    where: { id: expense.personalAccountId },
                    data: { balance: { decrement: amount } }
                });
            } else {
                await tx.personalAccount.update({
                    where: { id: expense.personalAccountId },
                    data: { balance: { increment: amount } }
                });
            }
        }

        // Krok 2: sprawdź, czy nowy typ (wydatek) nie przekroczy debetu
        if (expense.personalAccountId && newType !== 'income') {
            const balanceCheck = await checkBalanceWithTx(tx, amount, 'PLN', expense.personalAccountId);
            if (!balanceCheck.valid) {
                throw new Error('Zmiana kategorii spowodowałaby przekroczenie limitu debetu');
            }
        }

        // Krok 3: zapisz zmianę
        const updatedExpense = await tx.expense.update({
            where: { id: expenseId },
            data: {
                categoryId: categoryId ?? null,
                type: newType
            },
            include: {
                category: true,
                personalAccount: true,
                fromSavingsAccount: true,
                toPersonalAccount: true,
                savingsAccount: true,
                investment: true
            }
        });

        // Krok 4: zastosuj nowy wpływ na saldo
        if (updatedExpense.personalAccountId) {
            if (newType === 'income') {
                await tx.personalAccount.update({
                    where: { id: updatedExpense.personalAccountId },
                    data: { balance: { increment: amount } }
                });
            } else {
                await tx.personalAccount.update({
                    where: { id: updatedExpense.personalAccountId },
                    data: { balance: { decrement: amount } }
                });
            }
        }

        return updatedExpense;
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Logika zmiany sklepu transakcji (z listy) — bilansowo neutralna
// Tylko dla wydatków. Kategoria idzie za sklepem, a widoczna nazwa (description)
// jest nadpisywana nazwą sklepu. Kwota/konto/typ nietknięte → saldo bez zmian.
// ─────────────────────────────────────────────────────────────────────────────
export const updateExpenseStoreLogic = async (
    userId: string,
    expenseId: string,
    storeId: string
) => {
    const expense = await prisma.expense.findFirst({
        where: { id: expenseId, userId }
    });

    if (!expense) {
        throw new Error('NOT_FOUND');
    }

    // Edycja sklepu z listy dotyczy WYŁĄCZNIE wydatków
    if (expense.type !== 'expense') {
        throw new Error('FORBIDDEN');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });

    if (!store) {
        throw new Error('NOT_FOUND');
    }

    // Sklep musi należeć do użytkownika lub być systemowy (userId === null)
    if (store.userId !== null && store.userId !== userId) {
        throw new Error('FORBIDDEN');
    }

    return await prisma.expense.update({
        where: { id: expenseId },
        data: {
            storeId: store.id,
            store: store.name,
            categoryId: store.categoryId,
            description: store.name
        },
        include: {
            category: true,
            storeRef: true,
            personalAccount: true,
            fromSavingsAccount: true,
            toPersonalAccount: true,
            savingsAccount: true,
            investment: true
        }
    });
};

// ─────────────────────────────────────────────────────────────────────────────
// Logika masowego przypisywania kategorii na podstawie słownika wzorców
// ─────────────────────────────────────────────────────────────────────────────
export const recategorizeAllExpensesLogic = async (userId: string): Promise<number> => {
    const categories = await prisma.category.findMany();
    const expenses = await prisma.expense.findMany({
        where: { userId, type: 'expense' }
    });

    let updatedCount = 0;

    for (const expense of expenses) {
        const storeName = expense.store || expense.description || '';
        const lowerStore = storeName.toLowerCase();

        const exactMatch = categories.find(c =>
            c.name.toLowerCase() === lowerStore ||
            lowerStore.includes(c.name.toLowerCase())
        );

        let targetCategoryId: number | null = null;

        if (exactMatch && exactMatch.name !== 'Inne' && exactMatch.name !== 'Wpływ') {
            targetCategoryId = exactMatch.id;
        } else {
            for (const [patternCategory, patterns] of Object.entries(STORE_PATTERNS)) {
                if (patterns.some(p => lowerStore.includes(p))) {
                    const cat = categories.find(c => c.name === patternCategory);
                    if (cat) {
                        targetCategoryId = cat.id;
                        break;
                    }
                }
            }
        }

        if (targetCategoryId && targetCategoryId !== expense.categoryId) {
            await prisma.expense.update({
                where: { id: expense.id },
                data: { categoryId: targetCategoryId }
            });
            updatedCount++;
        }
    }

    return updatedCount;
};
