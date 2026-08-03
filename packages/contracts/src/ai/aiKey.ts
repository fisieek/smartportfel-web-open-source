import { z } from "zod";

/** Dostawcy AI obsługiwani w BYOK. Gemini pierwszy — ma darmowy tier. */
export const AiProviderSchema = z.enum(["gemini", "openai"]);

export const SetAiKeyRequestSchema = z.object({
    provider: AiProviderSchema,
    // Bez regexów per-dostawca — formaty kluczy się zmieniają (OpenAI robił to już dwa razy).
    // Twardą weryfikacją jest jedno realne zapytanie do dostawcy przed zapisem.
    apiKey: z
        .string()
        .trim()
        .min(20, "Klucz wygląda na zbyt krótki")
        .max(400, "Klucz wygląda na zbyt długi")
        .regex(/^\S+$/, "Klucz nie może zawierać spacji"),
});

export const AiKeyStatusSchema = z.object({
    configured: z.boolean(),
    provider: AiProviderSchema.nullable(),
    /** Ostatnie 4 znaki klucza — jedyny fragment, jaki kiedykolwiek wraca do klienta. */
    last4: z.string().nullable(),
    createdAt: z.string().nullable(),
    /** false = instancja nie ma AI_KEY_ENCRYPTION_KEY, więc nie przyjmie klucza. */
    encryptionAvailable: z.boolean(),
});

export type SetAiKeyRequest = z.infer<typeof SetAiKeyRequestSchema>;
export type AiKeyStatus = z.infer<typeof AiKeyStatusSchema>;
