import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getPersonalAccounts,
    createPersonalAccount,
    updatePersonalAccount,
    deletePersonalAccount,
    archivePersonalAccount,
    unarchivePersonalAccount,
    getPersonalAccountsSummary
} from '../controllers/personalAccountController';

const router = Router();

router.use(authenticateToken);

router.get('/', getPersonalAccounts);
router.get('/summary', getPersonalAccountsSummary);
router.post('/', createPersonalAccount);
router.put('/:id', updatePersonalAccount);
router.patch('/:id/archive', archivePersonalAccount);
router.patch('/:id/unarchive', unarchivePersonalAccount);
router.delete('/:id', deletePersonalAccount);

export default router;
