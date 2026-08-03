import { Router } from 'express';
import { login, register, updateProfile, changePassword, verifyEmail, forgotPassword, resetPassword, getMe, refreshToken, logout } from '../controllers/authController';
import { deleteAccount, exportData } from '../controllers/accountController';
import { authenticateToken } from '../middleware/authMiddleware';
import { authLimiter, emailLimiter, tokenLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.get('/verify/:token', tokenLimiter, verifyEmail);
router.post('/forgot-password', emailLimiter, forgotPassword);
router.post('/reset-password', tokenLimiter, resetPassword);

// Sesja mobilna: odnowienie access tokenu i wylogowanie (revoke refresh tokenu).
router.post('/refresh', authLimiter, refreshToken);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticateToken, getMe);
router.put('/profile', authenticateToken, updateProfile);
router.put('/password', authenticateToken, changePassword);

// RODO: eksport danych i trwałe usunięcie konta
router.get('/data-export', authenticateToken, exportData);
router.delete('/account', authenticateToken, deleteAccount);

export default router;
