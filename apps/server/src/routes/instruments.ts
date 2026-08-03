import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
    searchInstruments,
    getHistoricalPrice,
    addInstrumentToPortfolio,
    getCapabilities,
} from '../controllers/instrumentController';

const router = Router();

// Wyszukiwanie i ceny wymagają zalogowania (dane publiczne, ale chronimy własny serwer przed scrapingiem)
router.get('/capabilities', authenticateToken, getCapabilities);
router.get('/search', authenticateToken, searchInstruments);
router.get('/price/:symbol', authenticateToken, getHistoricalPrice);

router.post('/', authenticateToken, addInstrumentToPortfolio);

export default router;
