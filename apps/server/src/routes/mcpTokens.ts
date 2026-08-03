import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { createMcpToken, getMcpTokens, deleteMcpToken } from '../controllers/mcpTokenController';

const router = Router();

// Zarządzanie tokenami MCP — tylko zalogowany użytkownik.
router.use(authenticateToken);

router.post('/', createMcpToken);
router.get('/', getMcpTokens);
router.delete('/:id', deleteMcpToken);

export default router;
