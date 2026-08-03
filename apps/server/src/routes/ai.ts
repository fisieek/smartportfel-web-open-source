import { Router } from 'express';
import multer from 'multer';
import { mapTransactions, detectColumns, parsePdf, mapInvestments, quickParse } from '../controllers/aiController';
import { authenticateToken } from '../middleware/authMiddleware';
import { getAiKeyStatus, setAiKey, deleteAiKey } from '../controllers/aiKeyController';
import { aiKeyLimiter } from '../middleware/rateLimitMiddleware';

// Upload tylko PDF (CSV/XLSX parsowane są po stronie klienta i idą jako tekst).
// Limit 10 MB — memoryStorage na serverless: bez limitu duży plik wyczerpałby pamięć funkcji.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const isPdf = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
        cb(null, isPdf); // odrzucenie → req.file puste → handler zwraca 400 „Brak pliku"
    },
});
const router = Router();

router.use(authenticateToken);

router.post('/map-transactions', mapTransactions);
router.post('/detect-columns', detectColumns);
router.post('/parse-pdf', upload.single('file'), parsePdf);
router.post('/map-investments', mapInvestments);
router.post('/quick-parse', quickParse);

// BYOK — klucz API użytkownika do funkcji AI.
router.get('/key', getAiKeyStatus);
router.put('/key', aiKeyLimiter, setAiKey);
router.delete('/key', deleteAiKey);

export default router;
