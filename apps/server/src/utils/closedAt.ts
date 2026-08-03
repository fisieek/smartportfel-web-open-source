// Walidacja daty z przeszłości (archiwizacja kont, sprzedaż inwestycji).
// Domyślnie "teraz", odrzuca daty z przyszłości.
export type ParsedPastDate = { ok: true; date: Date } | { ok: false; error: string };

// Alias zachowany dla istniejących wywołań (archiwizacja kont).
export type ParsedClosedAt = ParsedPastDate;

export function parsePastDate(input: unknown, label = 'Data'): ParsedPastDate {
    if (input === undefined || input === null || input === '') {
        return { ok: true, date: new Date() };
    }
    const date = new Date(input as any);
    if (isNaN(date.getTime())) {
        return { ok: false, error: `Nieprawidłowa ${label.toLowerCase()}` };
    }
    if (date.getTime() > Date.now()) {
        return { ok: false, error: `${label} nie może być z przyszłości` };
    }
    return { ok: true, date };
}

export function parseClosedAt(input: unknown): ParsedClosedAt {
    return parsePastDate(input, 'Data zamknięcia');
}
