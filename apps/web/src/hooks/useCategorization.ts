import { useCallback } from 'react';
import { useCategories } from './useQueries';

interface Category {
    id: number;
    name: string;
    color: string;
    isSystemCategory?: boolean;
}

const STORE_PATTERNS: Record<string, string[]> = {
    'Sklepy spożywcze': ['biedronka', 'lidl', 'kaufland', 'auchan', 'carrefour', 'tesco', 'żabka', 'zabka', 'lewiatan', 'dino', 'netto', 'stokrotka', 'aldi', 'społem', 'spolem', 'dealz'],
    'Stacje Paliw': ['orlen', 'bp', 'shell', 'lotos', 'circle k', 'circlek', 'stacja paliw', 'amic'],
    'Restauracje': ['mcdonalds', 'kfc', 'burger', 'pizza', 'pizzeria', 'ristorante', 'restaurant', 'restauracja', 'pyszne', 'wolt', 'glovo', 'kebab', 'sushi', 'trattoria', 'bistro', 'kawiarnia', 'starbucks', 'costa', 'grycan'],
    'Rozrywka': ['cinema', 'kino', 'netflix', 'spotify', 'steam', 'playstation', 'xbox', 'nintendo', 'ticketmaster', 'ebilet', 'eventim', 'hbo', 'disney', 'multikino', 'helios', 'alkohol', 'papierosy', 'wódka', 'piwo', 'wino', 'tytoń', 'koncert', 'koncerty', 'opener', 'bilard', 'prezent', 'prezenty'],
    'Służba zdrowia': ['dermatolog', 'dentysta', 'stomatolog', 'ortodonta', 'okulista', 'lekarz', 'doctor', 'lux med', 'luxmed', 'medicover', 'badania', 'kardiolog', 'fizjoterapeuta', 'physio', 'przychodnia', 'szpital', 'laboratorium', 'diagnostyka'],
    'Apteki': ['apteka', 'pharmacy', 'doz', 'gemini', 'cefarm', 'superpharm', 'super-pharm'],
    'Sklepy kosmetyczne': ['rossmann', 'hebe', 'douglas', 'sephora', 'natura', 'chemia'],
    'Transport i Przejazdy': ['uber', 'bolt', 'free now', 'freenow', 'taxi', 'mpk', 'ztm', 'jakdojade', 'pkp', 'intercity', 'skm', 'bilety', 'autostrada', 'toll', 'vignette', 'hulajnoga', 'samochód'],
    'Markety budowlane': ['castorama', 'leroy', 'obi', 'bricoman', 'brico', 'praktiker', 'merlin'],
    'Elektronika': ['rtv euro agd', 'euro agd', 'media expert', 'media markt', 'mediamarkt', 'neonet', 'komputronik', 'x-kom', 'xkom', 'max elektro', 'sferis', 'elektronika'],
    'Ubrania i buty': ['zara', 'h&m', 'hm', 'reserved', 'eobuwie', 'zalando', 'modivo', 'c&a', 'ca', 'pepco', 'lpp', 'ccc', 'deichmann', 'answear'],
    'Podróże': ['booking', 'airbnb', 'lot', 'ryanair', 'wizzair', 'hotel', 'nocleg', 'tui', 'itaka', 'rainbow', 'wyjazd'],
    'Zakupy internetowe': ['allegro', 'amazon', 'ebay', 'aliexpress', 'temu', 'shein', 'inpost', 'paczkomat'],
    'Abonamenty': ['orange', 't-mobile', 'tmobile', 'play', 'plus', 'upc', 'vectra', 'multimedia', 'abonament', 'canal+', 'cyfrowy polsat', 'telefon'],
    'Zajęcia Sportowe': ['multisport', 'gym', 'siłownia', 'fitness', 'basen', 'decathlon', 'martes', 'intersport', 'zdrofit', 'cityfit'],
    'Dom': ['ikea', 'jysk', 'duka', 'home&you', 'action', 'tedi', 'agata meble', 'black red white', 'brw'],
    'Opłaty': ['pge', 'gaz', 'prąd', 'prad', 'śmieci', 'czynsz', 'podatki', 'tauron', 'energa', 'pgnig', 'wodociągi', 'mieszkanie', 'składka w pracy', 'internet', 'urząd skarbowy'],
    'Jedzenie i napoje': ['frisco', 'barmani', 'alkohol', 'winoteka'],
    'Usługi beauty': ['fryzjer', 'barber', 'kosmetyczka', 'paznokcie', 'manicure', 'pedicure', 'beauty'],
    'Edukacja': ['księgarnia', 'empik', 'kurs', 'szkoła', 'uczelnia', 'udemy', 'coursera', 'angielski', 'english', 'język'],
    'Wpływ': ['wpływ', 'przychód', 'wpłata'],
    'Wypłata': ['wypłata', 'wypłaty', 'wynagrodzenie'],
    'Premia': ['premia', 'premie', 'bonus', 'dodatek'],
    'Zwrot': ['zwrot'],
    'Ankieta': ['ankieta'],
    'Dywidenda': ['dywidenda'],
    'Odsetki': ['odsetki', 'kapitalizacja'],
    'Obligacje': ['obligacje', 'obligacja'],
    'Działalność gospodarcza': ['zus', 'ppe', 'vat', 'pit', 'księgowy', 'biuro rachunkowe'],
    'Ubezpieczenia': ['oc', 'ac', 'ubezpieczenie', 'generali', 'nnw'],
};

const INCOME_PATTERNS: Record<string, string[]> = {
    'Wypłata': ['wypłata', 'wypłaty', 'wynagrodzenie'],
    'Premia': ['premia', 'premie', 'bonus', 'dodatek'],
    'Zwrot': ['zwrot'],
    'Ankieta': ['ankieta'],
    'Dywidenda': ['dywidenda'],
    'Odsetki': ['odsetki', 'kapitalizacja'],
    'Obligacje': ['obligacje', 'obligacja'],
    'Inny przychód': ['wpływ', 'przychód', 'wpłata']
};

export const useCategorization = () => {
    const { data: categories = [] } = useCategories();

    const findCategoryByStore = useCallback((storeName: string): { id: number; name: string; isIncome: boolean; normalizedStore?: string } | null => {
        if (!storeName) return null;
        const lowerStore = storeName.toLowerCase().trim();

        // 1. Direct match with category names
        const exactMatch = (categories as Category[]).find(c =>
            c.name.toLowerCase() === lowerStore ||
            lowerStore.includes(c.name.toLowerCase())
        );

        if (exactMatch && !['Inne', 'Wpływ'].includes(exactMatch.name)) {
            return { id: exactMatch.id, name: exactMatch.name, isIncome: false };
        }

        // 2. Pattern based match
        for (const [categoryName, patterns] of Object.entries(STORE_PATTERNS)) {
            if (patterns.some(p => lowerStore.includes(p))) {
                const isIncomeType = ['Wpływ', 'Wypłata', 'Premia', 'Zwrot', 'Ankieta', 'Dywidenda', 'Odsetki', 'Obligacje'].includes(categoryName);

                const category = (categories as Category[]).find(c =>
                    c.name.toLowerCase() === (isIncomeType ? 'wpływ' : categoryName).toLowerCase()
                );

                if (category) {
                    let normalizedStore = undefined;
                    if (isIncomeType) {
                        for (const [incomeName, incomePatterns] of Object.entries(INCOME_PATTERNS)) {
                            if (incomePatterns.some(p => lowerStore.includes(p))) {
                                normalizedStore = incomeName;
                                break;
                            }
                        }
                    }

                    return {
                        id: category.id,
                        name: category.name,
                        isIncome: isIncomeType,
                        normalizedStore
                    };
                }
            }
        }

        return null;
    }, [categories]);

    return { findCategoryByStore };
};
