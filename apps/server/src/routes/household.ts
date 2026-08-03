import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    getMyHousehold,
    createHousehold,
    inviteMember,
    acceptInvitation,
    declineInvitation,
    leaveHousehold,
    removeMember,
    getInvitationByToken
} from '../controllers/householdController';

const router = Router();

// Publiczny podgląd zaproszenia po tokenie (przed wymogiem logowania) — token jest sekretem
router.get('/invitation/:token', getInvitationByToken);

router.use(authenticateToken);

router.get('/', getMyHousehold);
router.post('/', createHousehold);
router.post('/invite', inviteMember);
router.post('/accept', acceptInvitation);
router.post('/decline', declineInvitation);
router.post('/leave', leaveHousehold);
router.delete('/members/:memberId', removeMember);

export default router;
