import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';

// Mockujemy instancję API, żeby kontrolować odpowiedzi i sprawdzać payload.
vi.mock('../lib/api', () => ({
    default: {
        get: vi.fn(() => Promise.resolve({ data: {} })),
        post: vi.fn(() => Promise.resolve({ data: {} })),
    },
}));

import api from '../lib/api';

const mockedApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

function renderAt(path: string) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Register />
        </MemoryRouter>
    );
}

describe('Register', () => {
    beforeEach(() => {
        localStorage.clear();
        mockedApi.get.mockReset().mockResolvedValue({ data: {} });
        mockedApi.post.mockReset().mockResolvedValue({ data: {} });
    });

    // Regresja: backend (RegisterRequestSchema) oczekuje pola `name`.
    // Wcześniej front wysyłał `username` -> 400 "Nieprawidłowe dane rejestracji".
    it('wysyła pole `name` (nie `username`) do /auth/register', async () => {
        const user = userEvent.setup();
        renderAt('/register');

        await user.type(await screen.findByPlaceholderText('Wpisz nazwę użytkownika'), 'testuser');
        await user.type(screen.getByPlaceholderText('Wpisz swój email'), 'test@example.com');
        await user.type(screen.getByPlaceholderText('Wybierz hasło'), 'password123');
        await user.type(screen.getByPlaceholderText('Powtórz hasło'), 'password123');
        await user.click(screen.getByRole('checkbox'));
        await user.click(screen.getByRole('button', { name: /utwórz konto/i }));

        await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());

        const [url, payload] = mockedApi.post.mock.calls[0];
        expect(url).toBe('/auth/register');
        expect(payload).toMatchObject({ name: 'testuser', email: 'test@example.com', password: 'password123' });
        expect(payload).not.toHaveProperty('username');
        // Produkt jest darmowy — rejestracja nie wysyła już żadnego planu.
        expect(payload).not.toHaveProperty('plan');
    });

    // Stare linki z cennika (/register?plan=PRO) muszą dalej otwierać działający formularz.
    it('ignoruje parametr ?plan= i pokazuje formularz', async () => {
        renderAt('/register?plan=PRO');

        expect(await screen.findByPlaceholderText('Wpisz nazwę użytkownika')).toBeInTheDocument();
        expect(screen.queryByText(/wybierz plan/i)).not.toBeInTheDocument();
    });

    // Fix 1: e-mail z zaproszenia jest wstawiony i zablokowany.
    it('uzupełnia i blokuje e-mail z zaproszenia (?invitation=)', async () => {
        mockedApi.get.mockResolvedValue({
            data: { valid: true, email: 'zaproszony@example.com', householdName: 'Nasz Dom' },
        });

        renderAt('/register?invitation=tok123');

        await waitFor(() =>
            expect(mockedApi.get).toHaveBeenCalledWith('/household/invitation/tok123')
        );

        const emailInput = await screen.findByDisplayValue('zaproszony@example.com');
        expect(emailInput).toHaveAttribute('readonly');
    });
});
