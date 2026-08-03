import { z } from "zod";

export const LoginRequestSchema = z.object({
    email: z.string().email("Niepoprawny format email").or(z.string().min(3, "Login za krótki")),
    // Logowanie tylko sprawdza niepuste hasło — istniejący użytkownicy mogą mieć krótsze hasła sprzed zaostrzenia polityki
    password: z.string().min(1, "Hasło jest wymagane")
});

export const RegisterRequestSchema = z.object({
    name: z.string().min(2, "Imię/Nazwa za krótka"),
    email: z.string().email("Niepoprawny format email"),
    password: z.string().min(8, "Hasło musi mieć min. 8 znaków")
});

export const AuthResponseSchema = z.object({
    userId: z.string(),
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    user: z.object({
        id: z.string(),
        email: z.string(),
        username: z.string()
    })
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
