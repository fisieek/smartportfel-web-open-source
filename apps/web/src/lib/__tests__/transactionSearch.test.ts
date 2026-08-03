import { describe, it, expect } from 'vitest';
import { matchesAmount } from '../transactionSearch';

describe('matchesAmount', () => {
    it('znajduje kwotę wpisaną wprost', () => {
        expect(matchesAmount({ amount: 250 }, '250')).toBe(true);
        expect(matchesAmount({ amount: 250.5 }, '250.5')).toBe(true);
    });

    it('przecinek i kropka są wymienne (Polacy piszą przecinkiem)', () => {
        expect(matchesAmount({ amount: 150.5 }, '150,5')).toBe(true);
        expect(matchesAmount({ amount: 150.5 }, '150,50')).toBe(true);
        expect(matchesAmount({ amount: 150.5 }, '150.50')).toBe(true);
    });

    it('dopasowuje po podciągu, więc grosze nie muszą się zgadzać', () => {
        expect(matchesAmount({ amount: 250.99 }, '250')).toBe(true);
        expect(matchesAmount({ amount: 1250 }, '250')).toBe(true); // świadomie: to filtr, nie równość
    });

    it('nie dopasowuje kwoty, która nie zawiera szukanych cyfr', () => {
        expect(matchesAmount({ amount: 250 }, '399')).toBe(false);
        expect(matchesAmount({ amount: 12 }, '120')).toBe(false);
    });

    it('ignoruje znak minus i separator tysięcy w zapytaniu', () => {
        expect(matchesAmount({ amount: -430 }, '430')).toBe(true);
        expect(matchesAmount({ amount: 1250.5 }, '1 250,5')).toBe(true);
    });

    it('szuka też po kwocie przeliczonej na PLN', () => {
        // 100 EUR ≈ 430 PLN — użytkownik pamięta jedną albo drugą liczbę
        const tx = { amount: 100, plnAmount: 430.25 };
        expect(matchesAmount(tx, '100')).toBe(true);
        expect(matchesAmount(tx, '430,25')).toBe(true);
    });

    it('zapytanie bez cyfr nigdy nie jest kwotą', () => {
        expect(matchesAmount({ amount: 250 }, 'biedronka')).toBe(false);
        expect(matchesAmount({ amount: 250 }, '')).toBe(false);
    });

    it('znosi brak i śmieci w danych, bez wyjątku', () => {
        expect(matchesAmount({}, '250')).toBe(false);
        expect(matchesAmount({ amount: null, plnAmount: undefined }, '250')).toBe(false);
        expect(matchesAmount({ amount: 'nie-liczba' }, '250')).toBe(false);
        expect(matchesAmount({ amount: '250.00' }, '250')).toBe(true); // string z API też ma działać
    });
});
