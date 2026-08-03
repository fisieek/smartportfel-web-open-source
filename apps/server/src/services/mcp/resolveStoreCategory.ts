import prisma from '../../lib/prisma';
import { STORE_PATTERNS } from '../expense/expenseMutationService';

export interface ResolvedStore {
    store: string;            // nazwa sklepu (free-text, trafia do expense.store)
    storeId: string | null;   // gdy dopasowano istniejący rekord Store
    categoryId: number | null;
    categoryName: string;
}

/**
 * Mapuje nazwę sklepu (lub storeId) na sklep + kategorię dla użytkownika.
 * Kolejność: storeId → istniejący sklep po nazwie → wzorce STORE_PATTERNS → "Inne".
 * Reużywa słownik wzorców z kategoryzacji wsadowej (expenseMutationService).
 */
export async function resolveStoreCategory(
    userId: string,
    storeName?: string,
    storeId?: string
): Promise<ResolvedStore> {
    const findCategoryByName = (name: string) =>
        prisma.category.findFirst({ where: { name, OR: [{ userId: null }, { userId }] } });

    const inne = await findCategoryByName('Inne');
    const fallback: ResolvedStore = {
        store: storeName?.trim() || 'Inne',
        storeId: null,
        categoryId: inne?.id ?? null,
        categoryName: inne?.name ?? 'Inne',
    };

    // 1. Jawny storeId
    if (storeId) {
        const s = await prisma.store.findFirst({
            where: { id: storeId, OR: [{ userId }, { userId: null }] },
            include: { category: true },
        });
        if (s) {
            return { store: s.name, storeId: s.id, categoryId: s.categoryId, categoryName: s.category?.name ?? fallback.categoryName };
        }
    }

    const name = storeName?.trim();
    if (!name) return fallback;

    // 2. Istniejący sklep usera/systemowy po nazwie (case-insensitive)
    const existing = await prisma.store.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, OR: [{ userId }, { userId: null }] },
        include: { category: true },
    });
    if (existing) {
        return { store: existing.name, storeId: existing.id, categoryId: existing.categoryId, categoryName: existing.category?.name ?? fallback.categoryName };
    }

    // 3. Wzorce STORE_PATTERNS → kategoria (nazwa sklepu zostaje free-text)
    const lower = name.toLowerCase();
    for (const [catName, patterns] of Object.entries(STORE_PATTERNS)) {
        if (patterns.some(p => lower.includes(p))) {
            const cat = await findCategoryByName(catName);
            if (cat) return { store: name, storeId: null, categoryId: cat.id, categoryName: cat.name };
        }
    }

    // 4. Fallback "Inne", zachowując podaną nazwę sklepu
    return { ...fallback, store: name };
}
