import { logger } from '../utils/logger';

/**
 * Raportowanie błędu serwerowego (500).
 *
 * Kontrolery łapią błędy we własnych try/catch i same zwracają `res.status(500)`,
 * więc nie docierają do globalnego error handlera — ten helper domyka tę lukę
 * i daje jedno miejsce, w którym błąd 500 jest zapisywany. Wołać WYŁĄCZNIE na
 * ścieżce 500 (nie dla biznesowych 4xx). Nie zmienia odpowiedzi HTTP.
 *
 * Ta instancja NIE wysyła błędów nigdzie na zewnątrz — trafiają wyłącznie do
 * logu procesu. Jeśli chcesz podpiąć własny system monitoringu błędów, to jest
 * jedyne miejsce do zmiany: ta funkcja jest już wywoływana z ~30 kontrolerów.
 */
export function captureServerError(
    error: unknown,
    req?: { method?: string; path?: string; user?: { userId?: string } },
    label?: string,
): void {
    const where = req?.method && req?.path ? ` (${req.method} ${req.path})` : '';
    logger.error(`${label || 'Server error:'}${where}`, error);
}
