/**
 * 📝 Logger Service
 * 
 * Prosty wrapper nad console, który pozwala na:
 * 1. Wyłączanie logów debug na produkcji.
 * 2. Standaryzację formatu logów.
 * 3. Łatwą migrację na Winston/Pino w przyszłości.
 */

const IS_PROD = process.env.NODE_ENV === 'production';

export const logger = {
    info: (message: string, ...args: any[]) => {
        console.log(`[INFO] ${new Date().toISOString()}: ${message}`, ...args);
    },

    warn: (message: string, ...args: any[]) => {
        console.warn(`[WARN] ${new Date().toISOString()}: ${message}`, ...args);
    },

    error: (message: string, ...args: any[]) => {
        // Na produkcji błędy logujemy zawsze z pełnym kontekstem (bez haseł!)
        console.error(`[ERROR] ${new Date().toISOString()}: ${message}`, ...args);
    },

    debug: (message: string, ...args: any[]) => {
        if (!IS_PROD) {
            console.debug(`[DEBUG] ${new Date().toISOString()}: ${message}`, ...args);
        }
    }
};
