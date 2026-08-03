import type { Request, Response, NextFunction } from 'express';
import { captureServerError } from '../lib/reportError';

/**
 * Globalny error handler Expressa. MUSI być rejestrowany jako OSTATNI `app.use`,
 * ZA wszystkimi trasami — w Expressie `next(err)` znajduje tylko error-handlery
 * zarejestrowane w stacku za bieżącą trasą. Rejestracja przed trasami (dawny bug
 * I4) sprawiała, że błędy uciekające z kontrolerów omijały ten handler → nigdzie
 * nie były zapisywane i mogły wyciec stackiem poza guardem NODE_ENV.
 */
export const globalErrorHandler = (
    error: any,
    req: Request,
    res: Response,
    _next: NextFunction,
) => {
    captureServerError(error, req, 'GLOBAL ERROR');
    if (!res.headersSent) {
        res.status(500).json({
            error: 'Internal Server Error',
            details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
            path: req.path,
        });
    }
};
