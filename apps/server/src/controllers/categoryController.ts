import { Response } from 'express';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { validateCategoryOwnership } from '../utils/ownershipValidator';
import { captureServerError } from '../lib/reportError';

const MAX_CUSTOM_CATEGORIES = 10;

/**
 * Pobiera wszystkie kategorie dostępne dla użytkownika 
 * (systemowe + własne)
 */
export const getCategories = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const categories = await prisma.category.findMany({
            where: {
                OR: [
                    { userId: null },
                    { userId: userId }
                ]
            },
            orderBy: {
                name: 'asc'
            }
        });

        res.json(categories);
    } catch (error) {
        captureServerError(error, req, '[getCategories] Error:');
        res.status(500).json({ message: 'Błąd podczas pobierania kategorii' });
    }
};

/**
 * Tworzy nową kategorię dla użytkownika
 */
export const createCategory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const { name, color, icon, description } = req.body;

        if (!name || name.trim().length === 0) {
            res.status(400).json({ message: 'Nazwa kategorii jest wymagana' });
            return;
        }

        if (name.length > 25) {
            res.status(400).json({ message: 'Nazwa kategorii może mieć maksymalnie 25 znaków' });
            return;
        }

        // Sprawdź limit
        const customCount = await prisma.category.count({
            where: { userId }
        });

        if (customCount >= MAX_CUSTOM_CATEGORIES) {
            res.status(400).json({
                message: `Osiągnięto limit customowych kategorii (${MAX_CUSTOM_CATEGORIES})`
            });
            return;
        }

        // Sprawdź duplikaty (systemowe lub własne)
        const existing = await prisma.category.findFirst({
            where: {
                name: { equals: name, mode: 'insensitive' },
                OR: [
                    { userId: null },
                    { userId }
                ]
            }
        });

        if (existing) {
            res.status(400).json({ message: 'Kategoria o tej nazwie już istnieje' });
            return;
        }

        const category = await prisma.category.create({
            data: {
                name,
                color: color || '#8e44ad',
                icon: icon || 'tag',
                description: description || '',
                userId
            }
        });

        res.status(201).json(category);
    } catch (error) {
        captureServerError(error, req, '[createCategory] Error:');
        res.status(500).json({ message: 'Błąd podczas tworzenia kategorii' });
    }
};

/**
 * Aktualizuje kategorię użytkownika
 */
export const updateCategory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;
        const { name, color, icon, description } = req.body;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const categoryId = parseInt(id);
        if (isNaN(categoryId)) {
            res.status(400).json({ message: 'Nieprawidłowe ID kategorii' });
            return;
        }

        // Pobierz kategorię i sprawdź czy należy do użytkownika
        const existing = await prisma.category.findUnique({
            where: { id: categoryId }
        });

        if (!existing) {
            res.status(404).json({ message: 'Kategoria nie znaleziona' });
            return;
        }

        const isOwner = await validateCategoryOwnership(categoryId, userId);
        if (!isOwner) {
            res.status(403).json({ message: 'Nie masz uprawnień do edycji tej kategorii' });
            return;
        }

        // Sprawdź duplikaty jeśli nazwa się zmienia
        if (name && name !== existing.name) {
            if (name.length > 25) {
                res.status(400).json({ message: 'Nazwa kategorii może mieć maksymalnie 25 znaków' });
                return;
            }

            const duplicate = await prisma.category.findFirst({
                where: {
                    name: { equals: name, mode: 'insensitive' },
                    id: { not: categoryId },
                    OR: [
                        { userId: null },
                        { userId }
                    ]
                }
            });

            if (duplicate) {
                res.status(400).json({ message: 'Kategoria o tej nazwie już istnieje' });
                return;
            }
        }

        const updated = await prisma.category.update({
            where: { id: categoryId },
            data: {
                name: name || undefined,
                color: color || undefined,
                icon: icon || undefined,
                description: description || undefined
            }
        });

        res.json(updated);
    } catch (error) {
        captureServerError(error, req, '[updateCategory] Error:');
        res.status(500).json({ message: 'Błąd podczas aktualizacji kategorii' });
    }
};

/**
 * Usuwa kategorię użytkownika
 */
export const deleteCategory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        const { id } = req.params;

        if (!userId) {
            res.status(401).json({ message: 'Brak ID użytkownika' });
            return;
        }

        const categoryId = parseInt(id);
        if (isNaN(categoryId)) {
            res.status(400).json({ message: 'Nieprawidłowe ID kategorii' });
            return;
        }

        const existing = await prisma.category.findUnique({
            where: { id: categoryId }
        });

        if (!existing) {
            res.status(404).json({ message: 'Kategoria nie znaleziona' });
            return;
        }

        const isOwner = await validateCategoryOwnership(categoryId, userId);
        if (!isOwner) {
            res.status(403).json({ message: 'Nie masz uprawnień do usunięcia tej kategorii' });
            return;
        }

        // Sprawdź czy kategoria jest używana w wydatkach
        const usedCount = await prisma.expense.count({
            where: { categoryId }
        });

        if (usedCount > 0) {
            res.status(400).json({
                message: 'Nie można usunąć kategorii, która jest używana w wydatkach. Najpierw zmień kategorię tych wydatków.'
            });
            return;
        }

        // Usuń powiązane sklepy
        await prisma.store.deleteMany({
            where: { categoryId }
        });

        await prisma.category.delete({
            where: { id: categoryId }
        });

        res.json({ message: 'Kategoria została usunięta' });
    } catch (error) {
        captureServerError(error, req, '[deleteCategory] Error:');
        res.status(500).json({ message: 'Błąd podczas usuwania kategorii' });
    }
};
