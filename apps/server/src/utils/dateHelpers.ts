import { logger } from './logger';

// Tworzy datę w polskiej strefie czasowej (Europe/Warsaw)
// Automatycznie obsługuje czas letni (CEST +02:00) i zimowy (CET +01:00)
export const createPolishDate = (year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date => {
    const monthStr = String(month).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const hourStr = String(hour).padStart(2, '0');
    const minStr = String(min).padStart(2, '0');
    const secStr = String(sec).padStart(2, '0');
    const msStr = String(ms).padStart(3, '0');

    try {
        // Określ offset dla polskiej strefy czasowej (CET/CEST)
        // Sprawdzamy czy dany dzień jest w czasie letnim czy zimowym
        const testDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Europe/Warsaw',
            timeZoneName: 'longOffset'
        });
        const parts = formatter.formatToParts(testDate);
        const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+01:00';
        // offsetPart będzie np. "GMT+01:00" lub "GMT+02:00"
        const offset = offsetPart.replace('GMT', '');

        const isoString = `${year}-${monthStr}-${dayStr}T${hourStr}:${minStr}:${secStr}.${msStr}${offset}`;
        // logger.info(`[createPolishDate] Creating date: ${isoString}`);
        return new Date(isoString);
    } catch (error) {
        logger.warn(`[createPolishDate] Error creating date for ${year}-${month}-${day}:`, error);
        // Fallback: utworzenie daty UTC jako przybliżenie (lepsze to niż 500)
        // Na hostingu serwer zwykle chodzi w UTC
        return new Date(year, month - 1, day, hour, min, sec, ms);
    }
};
