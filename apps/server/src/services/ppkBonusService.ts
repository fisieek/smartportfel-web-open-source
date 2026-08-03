import { startOfMonth } from 'date-fns';
import prisma from '../lib/prisma';
import { WELCOME_BONUS, ANNUAL_BONUS, annualTopUpThreshold } from '../utils/ppkCalculator';

const WELCOME_NOTE = 'welcome';
const annualNote = (year: number) => `annual:${year}`;
const isCanonicalNote = (note: string | null | undefined): boolean =>
    note === WELCOME_NOTE || (typeof note === 'string' && /^annual:\d{4}$/.test(note));

/**
 * Ustala, jakie dotacje państwowe PPK POWINNY istnieć dla użytkownika na podstawie
 * jego wpłat (EMPLOYEE/EMPLOYER) i idempotentnie dopisuje brakujące.
 *
 * Kontekst (audyt I1): dotacje powstawały wyłącznie w pętli backfillu `setupPPK`
 * (przez `getPPKBonuses`), a comiesięczny `confirmSuggestion` dopisywał tylko wpłaty
 * pracownika/pracodawcy — więc premia powitalna użytkownika konfigurującego PPK w 1–2
 * miesiącu przepadała, a dopłata roczna była bezwarunkowa i księgowana w złym roku.
 *
 * Reguły:
 * - Premia powitalna (250 zł): jednorazowa, gdy istnieją ≥3 wpłaty EMPLOYEE
 *   (odpowiednik „wpłaty za min. 3 miesiące"). Datowana na miesiąc 3. wpłaty.
 * - Dopłata roczna (240 zł): raz na ZAKOŃCZONY rok kalendarzowy Y (Y < rok bieżący),
 *   gdy suma wpłat podstawowych (EMPLOYEE+EMPLOYER) w roku ≥ próg ustawowy
 *   (3,5% × 6 × min. wynagrodzenie). Datowana na 15 kwietnia roku następnego
 *   (bez datowania w przyszłość).
 *
 * Samo-korekta: wpisy STATE_* bez kanonicznego `note` (bezwarunkowe/mistimed dopłaty
 * sprzed naprawy) są usuwane i przeliczane od nowa — bez osobnego skryptu backfillu.
 *
 * Cała operacja w jednej transakcji, idempotentna (drugie wywołanie nic nie zmienia).
 */
export const reconcilePPKBonuses = async (userId: string): Promise<void> => {
    const config = await prisma.pPKConfig.findUnique({ where: { userId } });
    if (!config) return;

    await prisma.$transaction(async (tx) => {
        const transactions = await tx.pPKTransaction.findMany({
            where: { userId },
            orderBy: { date: 'asc' }
        });

        // 1. Samo-korekta: usuń legacy dotacje bez kanonicznego `note`.
        const legacyIds = transactions
            .filter((t) => (t.type === 'STATE_WELCOME' || t.type === 'STATE_ANNUAL') && !isCanonicalNote(t.note))
            .map((t) => t.id);
        if (legacyIds.length > 0) {
            await tx.pPKTransaction.deleteMany({ where: { id: { in: legacyIds } } });
        }

        const surviving = transactions.filter((t) => !legacyIds.includes(t.id));
        const employeeTx = surviving.filter((t) => t.type === 'EMPLOYEE');

        // 2. Premia powitalna (250 zł): ≥3 wpłaty EMPLOYEE, brak istniejącego STATE_WELCOME.
        const hasWelcome = surviving.some((t) => t.type === 'STATE_WELCOME' && t.note === WELCOME_NOTE);
        if (!hasWelcome && employeeTx.length >= 3) {
            const thirdMonth = startOfMonth(employeeTx[2].date);
            await tx.pPKTransaction.create({
                data: {
                    userId,
                    date: thirdMonth,
                    type: 'STATE_WELCOME',
                    amount: WELCOME_BONUS,
                    note: WELCOME_NOTE
                }
            });
        }

        // 3. Dopłata roczna (240 zł): per zakończony rok spełniający próg wpłat podstawowych.
        const currentYear = new Date().getFullYear();
        const basicByYear = new Map<number, number>();
        for (const t of surviving) {
            if (t.type !== 'EMPLOYEE' && t.type !== 'EMPLOYER') continue;
            const year = t.date.getFullYear();
            basicByYear.set(year, (basicByYear.get(year) || 0) + Number(t.amount));
        }

        const existingAnnualYears = new Set(
            surviving
                .filter((t) => t.type === 'STATE_ANNUAL' && isCanonicalNote(t.note))
                .map((t) => Number((t.note as string).split(':')[1]))
        );

        const now = new Date();
        for (const [year, basicSum] of basicByYear) {
            if (year >= currentYear) continue; // tylko zakończone lata
            if (basicSum < annualTopUpThreshold(year)) continue; // próg niespełniony
            if (existingAnnualYears.has(year)) continue; // już naliczona

            const creditDate = new Date(year + 1, 3, 15); // 15 kwietnia roku następnego
            await tx.pPKTransaction.create({
                data: {
                    userId,
                    date: creditDate < now ? creditDate : now,
                    type: 'STATE_ANNUAL',
                    amount: ANNUAL_BONUS,
                    note: annualNote(year)
                }
            });
        }
    });
};
