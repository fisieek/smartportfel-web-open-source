import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
    seal,
    open,
    isEncryptionConfigured,
    resetEncryptionCache,
    EncryptionUnavailableError,
    DecryptionFailedError,
} from '../crypto';

const KEY_A = randomBytes(32).toString('hex');
const KEY_B = randomBytes(32).toString('hex');
const ORIGINAL = process.env.AI_KEY_ENCRYPTION_KEY;

function useKey(hex: string | undefined) {
    if (hex === undefined) delete process.env.AI_KEY_ENCRYPTION_KEY;
    else process.env.AI_KEY_ENCRYPTION_KEY = hex;
    resetEncryptionCache();
}

beforeEach(() => useKey(KEY_A));
afterAll(() => useKey(ORIGINAL));

describe('crypto (AES-256-GCM)', () => {
    it('seal → open zwraca oryginalny sekret', () => {
        const secret = 'sk-test-abcdefghijklmnopqrstuvwxyz';
        expect(open(seal(secret, 'user-1'), 'user-1')).toBe(secret);
    });

    it('szyfrogram nie zawiera jawnego sekretu', () => {
        const secret = 'sk-test-abcdefghijklmnopqrstuvwxyz';
        const sealed = seal(secret, 'user-1');
        expect(sealed.ciphertext.toString('utf8')).not.toContain(secret);
        expect(sealed.ciphertext.toString('hex')).not.toContain(Buffer.from(secret).toString('hex'));
    });

    it('każde szyfrowanie ma inny IV (ten sam tekst → inny szyfrogram)', () => {
        const a = seal('taki sam sekret', 'user-1');
        const b = seal('taki sam sekret', 'user-1');
        expect(a.iv.equals(b.iv)).toBe(false);
        expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    });

    // Sedno wiązania AAD: dump bazy nie pozwala przenieść klucza na inne konto.
    it('nie odszyfruje się pod innym userId', () => {
        const sealed = seal('sekret', 'user-1');
        expect(() => open(sealed, 'user-2')).toThrow(DecryptionFailedError);
    });

    it('wykrywa manipulację szyfrogramem (authTag)', () => {
        const sealed = seal('sekret', 'user-1');
        sealed.ciphertext[0] ^= 0xff;
        expect(() => open(sealed, 'user-1')).toThrow(DecryptionFailedError);
    });

    it('rotacja klucza głównego unieważnia zapisane sekrety', () => {
        const sealed = seal('sekret', 'user-1');
        useKey(KEY_B);
        expect(() => open(sealed, 'user-1')).toThrow(DecryptionFailedError);
    });

    it('bez AI_KEY_ENCRYPTION_KEY szyfrowanie jest niedostępne', () => {
        useKey(undefined);
        expect(isEncryptionConfigured()).toBe(false);
        expect(() => seal('sekret', 'user-1')).toThrow(EncryptionUnavailableError);
    });

    it('klucz o złym formacie traktujemy jak brak konfiguracji', () => {
        useKey('za-krotki-i-nie-hex');
        expect(isEncryptionConfigured()).toBe(false);
    });
});
