import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Szyfrowanie sekretów użytkownika w spoczynku (AES-256-GCM).
 * Używane przez BYOK — klucze API do AI, które użytkownik podaje w ustawieniach.
 *
 * Klucz główny: AI_KEY_ENCRYPTION_KEY (64 znaki hex = 32 bajty). Format jest
 * walidowany przy starcie serwera (index.ts) — tu sprawdzamy tylko obecność.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // standardowy 96-bitowy nonce dla GCM

export class EncryptionUnavailableError extends Error {
    constructor() {
        super('AI_KEY_ENCRYPTION_KEY nie jest skonfigurowany');
        this.name = 'EncryptionUnavailableError';
    }
}

export class DecryptionFailedError extends Error {
    constructor() {
        super('Nie można odszyfrować zapisanego sekretu');
        this.name = 'DecryptionFailedError';
    }
}

let cachedKey: Buffer | null = null;
let resolved = false;

function masterKey(): Buffer | null {
    if (resolved) return cachedKey;
    resolved = true;
    const raw = (process.env.AI_KEY_ENCRYPTION_KEY || '').trim();
    cachedKey = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
    return cachedKey;
}

/** Czy instancja w ogóle potrafi przechowywać klucze użytkowników. */
export function isEncryptionConfigured(): boolean {
    return masterKey() !== null;
}

/** Tylko do testów — zeruje cache po podmianie zmiennej środowiskowej. */
export function resetEncryptionCache(): void {
    cachedKey = null;
    resolved = false;
}

export interface SealedSecret {
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
}

/**
 * `aad` (Additional Authenticated Data) = userId. Wiąże szyfrogram z konkretnym
 * wierszem: przeklejenie ciphertext/iv/authTag na inne konto nie odszyfruje się.
 */
export function seal(plaintext: string, aad: string): SealedSecret {
    const key = masterKey();
    if (!key) throw new EncryptionUnavailableError();

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGO, key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function open(sealed: SealedSecret, aad: string): string {
    const key = masterKey();
    if (!key) throw new EncryptionUnavailableError();

    try {
        const decipher = createDecipheriv(ALGO, key, sealed.iv);
        decipher.setAAD(Buffer.from(aad, 'utf8'));
        decipher.setAuthTag(sealed.authTag); // GCM: final() rzuci przy niezgodnym tagu
        return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
    } catch {
        // Najczęstsza przyczyna: rotacja AI_KEY_ENCRYPTION_KEY. Nie logujemy szczegółów,
        // żeby nie wypuścić fragmentów szyfrogramu do logów.
        throw new DecryptionFailedError();
    }
}
