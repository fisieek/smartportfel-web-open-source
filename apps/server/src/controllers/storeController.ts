import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { validateStoreOwnership } from '../utils/ownershipValidator';
import { captureServerError } from '../lib/reportError';

const MAX_CUSTOM_STORES_PER_CATEGORY = 20;

/**
 * Pobiera sklepy dla danej kategorii
 */
export const getStoresByCategory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { categoryId } = req.params;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const catId = parseInt(categoryId);
        if (isNaN(catId)) {
            res.status(400).json({ message: 'Nieprawidłowe ID kategorii' });
            return;
        }

        const stores = await prisma.store.findMany({
            where: {
                categoryId: catId,
                userId: userId
            },
            orderBy: {
                name: 'asc'
            }
        });

        res.json(stores);
    } catch (error) {
        captureServerError(error, req, '[getStoresByCategory] Error:');
        res.status(500).json({ message: 'Błąd podczas pobierania sklepów' });
    }
};

/**
 * Pobiera wszystkie sklepy użytkownika
 */
export const getAllStores = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const stores = await prisma.store.findMany({
            where: {
                OR: [
                    { userId },
                    { userId: null }
                ]
            },
            include: { category: true },
            orderBy: { name: 'asc' }
        });

        res.json(stores);
    } catch (error) {
        captureServerError(error, req, '[getAllStores] Error:');
        res.status(500).json({ message: 'Błąd podczas pobierania sklepów' });
    }
};

/**
 * Tworzy nowy sklep w kategorii
 */
export const createStore = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const { name, categoryId } = req.body;

        if (!name || name.trim().length === 0) {
            res.status(400).json({ message: 'Nazwa sklepu jest wymagana' });
            return;
        }

        if (name.length > 25) {
            res.status(400).json({ message: 'Nazwa sklepu może mieć maksymalnie 25 znaków' });
            return;
        }

        const catId = parseInt(categoryId);
        if (isNaN(catId)) {
            res.status(400).json({ message: 'Nieprawidłowe ID kategorii' });
            return;
        }

        // Sprawdź czy kategoria istnieje i jest dostępna dla użytkownika
        const category = await prisma.category.findFirst({
            where: {
                id: catId,
                OR: [
                    { userId: null },
                    { userId }
                ]
            }
        });

        if (!category) {
            res.status(404).json({ message: 'Kategoria nie znaleziona' });
            return;
        }

        // Sprawdź limit sklepów w tej kategorii
        const storeCount = await prisma.store.count({
            where: { userId, categoryId: catId }
        });

        if (storeCount >= MAX_CUSTOM_STORES_PER_CATEGORY) {
            res.status(400).json({
                message: `Osiągnięto limit sklepów w tej kategorii (${MAX_CUSTOM_STORES_PER_CATEGORY})`
            });
            return;
        }

        // Sprawdź duplikaty w tej kategorii
        const existing = await prisma.store.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                categoryId: catId,
                OR: [
                    { userId },
                    { userId: null }
                ]
            }
        });

        if (existing) {
            res.status(400).json({ message: 'W tej kategorii istnieje już sklep o tej samej nazwie' });
            return;
        }

        const store = await prisma.store.create({
            data: {
                name,
                categoryId: catId,
                userId
            }
        });

        res.status(201).json(store);
    } catch (error) {
        captureServerError(error, req, '[createStore] Error:');
        res.status(500).json({ message: 'Błąd podczas tworzenia sklepu' });
    }
};

/**
 * Usuwa sklep
 */
export const deleteStore = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        const store = await prisma.store.findUnique({
            where: { id: id }
        });

        if (!store) {
            res.status(404).json({ message: 'Sklep nie znaleziony' });
            return;
        }

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const isOwner = await validateStoreOwnership(id, userId);
        if (!isOwner) {
            res.status(403).json({ message: 'Nie masz uprawnień do usunięcia tego sklepu' });
            return;
        }

        // Sprawdź czy sklep jest używany w wydatkach
        const usedCount = await prisma.expense.count({
            where: { storeId: id }
        });

        if (usedCount > 0) {
            res.status(400).json({
                message: 'Nie można usunąć sklepu, który jest używany w wydatkach.'
            });
            return;
        }

        await prisma.store.delete({
            where: { id }
        });

        res.json({ message: 'Sklep został usunięty' });
    } catch (error) {
        captureServerError(error, req, '[deleteStore] Error:');
        res.status(500).json({ message: 'Błąd podczas usuwania sklepu' });
    }
};
