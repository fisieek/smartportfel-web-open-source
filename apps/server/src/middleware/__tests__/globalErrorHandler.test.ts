import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';

const { captureServerError } = vi.hoisted(() => ({ captureServerError: vi.fn() }));

vi.mock('../../lib/reportError', () => ({ captureServerError }));

vi.mock('../../utils/logger', () => ({
    logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { globalErrorHandler } from '../errorHandler';

const makeReq = (): Partial<Request> => ({ method: 'POST', path: '/api/expenses' });

const makeRes = (headersSent = false): Partial<Response> & { _status?: number; _json?: any } => {
    const res: any = { headersSent };
    res.status = vi.fn().mockImplementation((s: number) => { res._status = s; return res; });
    res.json = vi.fn().mockImplementation((j: any) => { res._json = j; return res; });
    return res;
};

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe('globalErrorHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    });

    it('zwraca 500 z kształtem { error, path } dla błędu, który dojdzie do handlera', () => {
        const res = makeRes();
        globalErrorHandler(new Error('boom'), makeReq() as Request, res as Response, vi.fn());

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res._json.error).toBe('Internal Server Error');
        expect(res._json.path).toBe('/api/expenses');
    });

    it('zapisuje błąd razem z żądaniem, w którym wystąpił', () => {
        const err = new Error('boom');
        const req = makeReq() as Request;
        globalErrorHandler(err, req, makeRes() as Response, vi.fn());

        expect(captureServerError).toHaveBeenCalledWith(err, req, 'GLOBAL ERROR');
    });

    it('NIE odpowiada gdy nagłówki już wysłane (guard headersSent)', () => {
        const res = makeRes(true);
        globalErrorHandler(new Error('boom'), makeReq() as Request, res as Response, vi.fn());

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
        // Błąd i tak zostaje zapisany, niezależnie od stanu odpowiedzi
        expect(captureServerError).toHaveBeenCalled();
    });

    it('dołącza details (stack) poza produkcją', () => {
        process.env.NODE_ENV = 'development';
        const res = makeRes();
        const err = new Error('boom');
        globalErrorHandler(err, makeReq() as Request, res as Response, vi.fn());

        expect(res._json.details).toBe(err.stack);
    });

    it('pomija details na produkcji', () => {
        process.env.NODE_ENV = 'production';
        const res = makeRes();
        globalErrorHandler(new Error('boom'), makeReq() as Request, res as Response, vi.fn());

        expect(res._json.details).toBeUndefined();
    });
});
