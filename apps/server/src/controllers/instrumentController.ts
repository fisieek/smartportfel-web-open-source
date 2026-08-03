/**
 * Instrument Controller
 *
 * Wyszukiwanie instrumentów i ceny (bieżące oraz historyczne). Dwa niezależne źródła:
 *  - notowania akcji/ETF-ów/indeksów/krypto — przez wymienialnego dostawcę (`services/marketData`),
 *    który domyślnie jest WYŁĄCZONY: patrz `MARKET_DATA_PROVIDER`,
 *  - cena złota — NBP (`nbpGoldClient`), oficjalne publiczne API, działa zawsze.
 *
 * Bez dostawcy notowań wyszukiwanie zwraca pustą listę (poza złotem), a ceny 404 — czyli
 * ścieżki, które i tak istnieją dla nieznanego symbolu. Frontend pyta o `/capabilities`
 * i schowa wyszukiwarkę, zamiast pozwolić kliknąć w funkcję, której nie ma.
 */

import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import {
    getQuote,
    getHistoricalClose,
    hasLiveQuotes,
    marketDataProviderName,
    searchInstruments as searchWithProvider,
} from '../services/marketData';
import { getGoldPrice } from '../services/marketData/nbpGoldClient';
import { logger } from '../utils/logger';
import { captureServerError } from '../lib/reportError';

const GOLD_NBP_RESULT = {
    symbol: 'GOLD_NBP',
    name: 'Złoto (NBP)',
    type: 'GOLD',
    region: 'Poland',
    currency: 'PLN',
    matchScore: 1,
};

/**
 * GET /api/instruments/capabilities
 *
 * Co ta instancja umie w zakresie wycen. Front pyta o to raz i dostosowuje UI, zamiast
 * pokazywać wyszukiwarkę, która zawsze zwraca zero (ta sama zasada, co przy kluczu AI:
 * nie pozwalamy kliknąć w funkcję, której nie ma, żeby dopiero potem pokazać błąd).
 *
 * `goldPrice` jest zawsze `true` — NBP nie zależy od dostawcy notowań.
 */
export async function getCapabilities(_req: Request, res: Response) {
    res.json({
        liveQuotes: hasLiveQuotes(),
        provider: marketDataProviderName(),
        goldPrice: true,
    });
}

/**
 * GET /api/instruments/search?q=...
 */
export async function searchInstruments(req: Request, res: Response) {
    const query = (req.query.q as string) || '';

    if (!query.trim()) {
        return res.status(400).json({ error: 'Query parameter required' });
    }

    try {
        let results: any[] = await searchWithProvider(query);

        // Złoto NBP przy zapytaniach o złoto
        const lowerQuery = query.toLowerCase();
        if ('gold'.includes(lowerQuery) || 'złoto'.includes(lowerQuery) || 'zloto'.includes(lowerQuery)) {
            results = [GOLD_NBP_RESULT, ...results.filter(r => r.symbol !== 'GOLD_NBP')];
        }

        res.json(results.slice(0, 15));
    } catch (error) {
        captureServerError(error, req, 'Error searching instruments:');
        res.status(500).json({ error: 'Failed to search instruments' });
    }
}

/**
 * GET /api/instruments/price/:symbol?date=YYYY-MM-DD
 * Cena bieżąca (bez date / date=dziś) lub historyczna.
 */
export async function getHistoricalPrice(req: Request, res: Response) {
    const symbol = req.params.symbol;
    const date = req.query.date as string | undefined;

    if (!symbol) {
        return res.status(400).json({ error: 'Symbol required' });
    }
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    try {
        const today = new Date().toISOString().split('T')[0];
        let price: number | null = null;

        if (symbol.toUpperCase() === 'GOLD_NBP') {
            price = await getGoldPrice(date && date !== today ? date : undefined);
        } else if (!date || date === today) {
            const quote = await getQuote(symbol);
            price = quote ? quote.close : null;
        } else {
            price = await getHistoricalClose(symbol, date);
        }

        if (price === null) {
            return res.status(404).json({ error: 'Price data not found' });
        }

        res.json({
            symbol,
            date: date || today,
            close: price,
            "Time Series (Daily)": {
                [date || today]: {
                    "4. close": price.toString()
                }
            }
        });
    } catch (error) {
        captureServerError(error, req, 'Error fetching price:');
        res.status(500).json({ error: 'Failed to fetch price' });
    }
}

/**
 * POST /api/instruments
 * Upsert instrumentu (po symbolu) i opcjonalne powiązanie z inwestycją użytkownika.
 */
export async function addInstrumentToPortfolio(req: Request, res: Response) {
    try {
        const userId = (req as any).user.userId;
        const { symbol, name, type, currency, exchange, investmentId } = req.body;

        if (!symbol || !name || !type || !currency) {
            return res.status(400).json({
                error: 'Required fields: symbol, name, type, currency'
            });
        }

        const instrument = await prisma.instrument.upsert({
            where: { symbol },
            update: { name, type, currency, exchange: exchange || null },
            create: { symbol, name, type, currency, exchange: exchange || null },
        });

        if (investmentId) {
            const investment = await prisma.investment.findFirst({
                where: { id: investmentId, userId },
            });
            if (!investment) {
                return res.status(404).json({ error: 'Investment not found' });
            }
            await prisma.investment.update({
                where: { id: investmentId },
                data: { instrumentId: instrument.id },
            });
        }

        res.status(201).json(instrument);
    } catch (error) {
        captureServerError(error, req, 'Error adding instrument:');
        res.status(500).json({ error: 'Failed to add instrument' });
    }
}
