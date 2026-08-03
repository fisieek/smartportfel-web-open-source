import { Router } from 'express';
import { getStoresByCategory, createStore, deleteStore, getAllStores } from '../controllers/storeController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAllStores);
router.get('/category/:categoryId', getStoresByCategory);
router.post('/', createStore);
router.delete('/:id', deleteStore);

export default router;
