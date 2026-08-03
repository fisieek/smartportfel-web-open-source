import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import prisma from '../../lib/prisma';
import { createExpenseBusinessLogic } from '../expense/expenseCrudService';
import { getExpensesLogic, getDashboardSummaryLogic } from '../expense/expenseViewService';
import { getMonthlyPlanLogic } from '../planningService';
import { resolveStoreCategory } from './resolveStoreCategory';
import { getPositionsLogic, createInvestmentBusinessLogic, getRetirementContributionStatus } from '../investmentViewService';
import { getSavingsSummaryLogic, getSavingsGoalsLogic } from '../savingsViewService';
import { resolveInvestmentAccount } from './resolveInvestmentAccount';
import type { McpScope } from './mcpTokenService';

// ── helpers ──────────────────────────────────────────────────────────────────
const zl = (n: number | string) =>
    `${Number(n).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Konto docelowe: po nazwie (case-insensitive) wśród kont usera; brak → główne; brak głównego → pierwsze. */
async function resolveAccount(userId: string, accountName?: string) {
    const accounts = await prisma.personalAccount.findMany({
        where: { userId, closedAt: null } as any,
        select: { id: true, name: true, isMain: true },
        orderBy: { createdAt: 'asc' },
    });
    if (accounts.length === 0) return null;
    if (accountName) {
        const byName = accounts.find(a => a.name.toLowerCase() === accountName.trim().toLowerCase());
        if (byName) return byName;
    }
    return accounts.find(a => a.isMain) ?? accounts[0];
}

// Wspólny kształt pozycji (preview ↔ commit)
const itemInputShape = {
    amount: z.number().positive().describe('Kwota w PLN (większa od zera)'),
    type: z.enum(['expense', 'income']).default('expense').describe('Typ: wydatek lub wpływ'),
    store: z.string().optional().describe('Sklep/źródło, np. "Biedronka" (wydatek) lub "Wypłata" (wpływ)'),
    date: z.string().optional().describe('Data ISO YYYY-MM-DD; brak = dzisiaj'),
    accountName: z.string().optional().describe('Nazwa konta; brak = konto główne'),
    note: z.string().optional().describe('Opcjonalna notatka'),
};

const resolvedItemShape = {
    amount: z.number().positive(),
    type: z.enum(['expense', 'income']),
    store: z.string(),
    date: z.string(),
    accountId: z.string(),
    accountName: z.string(),
    categoryId: z.number().nullable(),
    categoryName: z.string(),
    note: z.string().optional(),
};

/**
 * Buduje serwer MCP SmartPortfel związany z konkretnym userId (rozwiązanym z tokenu).
 * Zapis = dwustopniowo: preview_transactions → commit_transactions.
 *
 * `scope` (bug I3): przy 'read' narzędzia zapisu (`commit_transactions`/`commit_investment`)
 * NIE są rejestrowane — klient read-only ich nie widzi, więc nie ma czego wywołać.
 * Efektywny scope wylicza `authenticateMcp` (token w URL ⇒ zawsze 'read').
 */
export function buildMcpServer(userId: string, scope: McpScope = 'write'): McpServer {
    const server = new McpServer({ name: 'smartportfel', version: '1.0.0' });
    const canWrite = scope === 'write';

    // ── ZAPIS: krok 1 — podgląd (bez zapisu) ─────────────────────────────────
    server.registerTool(
        'preview_transactions',
        {
            title: 'Podgląd wydatków/wpływów',
            description:
                'Parsuje i rozwiązuje listę wydatków/wpływów (konto, sklep→kategoria, data) BEZ zapisu. ' +
                'Zwróć wynik użytkownikowi do potwierdzenia, a po akceptacji wywołaj commit_transactions z polem "items" z odpowiedzi.',
            inputSchema: { transactions: z.array(z.object(itemInputShape)).min(1) as any },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ transactions }: any) => {
            const items: any[] = [];
            for (const t of transactions) {
                const acc = await resolveAccount(userId, t.accountName);
                if (!acc) {
                    return text('Nie znaleziono żadnego konta osobistego. Najpierw dodaj konto w SmartPortfel.');
                }
                const date = t.date || todayISO();
                if (t.type === 'income') {
                    const wplyw = await prisma.category.findFirst({ where: { name: 'Wpływ', OR: [{ userId: null }, { userId }] } });
                    items.push({
                        amount: t.amount, type: 'income', store: t.store?.trim() || 'Wpływ', date,
                        accountId: acc.id, accountName: acc.name,
                        categoryId: wplyw?.id ?? null, categoryName: wplyw?.name ?? 'Wpływ', note: t.note,
                    });
                } else {
                    const r = await resolveStoreCategory(userId, t.store);
                    items.push({
                        amount: t.amount, type: 'expense', store: r.store, date,
                        accountId: acc.id, accountName: acc.name,
                        categoryId: r.categoryId, categoryName: r.categoryName, note: t.note,
                    });
                }
            }

            const total = items.reduce((s, i) => s + (i.type === 'expense' ? i.amount : 0), 0);
            const lines = items.map(i =>
                `• ${zl(i.amount)} — ${i.store} → ${i.categoryName} [${i.type === 'income' ? 'wpływ' : 'wydatek'}, konto: ${i.accountName}, ${i.date}]`
            ).join('\n');

            return text(
                `Do dodania (${items.length}), suma wydatków ${zl(total)}:\n${lines}\n\n` +
                `Poproś użytkownika o potwierdzenie. Po „tak" wywołaj commit_transactions z poniższym "items":\n` +
                '```json\n' + JSON.stringify({ items }, null, 2) + '\n```'
            );
        }
    );

    // ── ZAPIS: krok 2 — commit (zapis) ───────────────────────────────────────
    if (canWrite) server.registerTool(
        'commit_transactions',
        {
            title: 'Zapisz wydatki/wpływy',
            description:
                'Zapisuje pozycje zwrócone wcześniej przez preview_transactions (pole "items"). ' +
                'Wywołuj WYŁĄCZNIE po potwierdzeniu przez użytkownika.',
            inputSchema: { items: z.array(z.object(resolvedItemShape)).min(1) as any },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        async ({ items }: any) => {
            const created: any[] = [];
            const errors: string[] = [];
            for (const i of items) {
                try {
                    const exp = await createExpenseBusinessLogic(userId, {
                        type: i.type,
                        amount: i.amount,
                        currency: 'PLN',
                        date: i.date,
                        description: i.store,
                        store: i.store,
                        categoryId: i.categoryId ?? undefined,
                        personalAccountId: i.accountId,
                        note: i.note,
                    });
                    created.push({ id: exp.id, amount: i.amount, store: i.store, type: i.type });
                } catch (e: any) {
                    errors.push(`${i.store} (${zl(i.amount)}): ${e?.message === 'FORBIDDEN' ? 'brak dostępu do konta' : (e?.message || 'błąd')}`);
                }
            }

            // Pozostały budżet na bieżący miesiąc
            let budgetLine = '';
            try {
                const now = new Date();
                const plan: any = await getMonthlyPlanLogic(userId, now.getMonth() + 1, now.getFullYear());
                const planned = (plan.items || []).filter((x: any) => x.type === 'expense').reduce((s: number, x: any) => s + Number(x.amount), 0);
                const done = (plan.items || []).filter((x: any) => x.type === 'expense' && x.isDone).reduce((s: number, x: any) => s + Number(x.amount), 0);
                if (planned > 0) budgetLine = `\nBudżet (plan miesiąca): zostało ${zl(planned - done)} z ${zl(planned)}.`;
            } catch { /* budżet opcjonalny */ }

            const head = created.length ? `Dodano ${created.length} ✅` : 'Nie dodano żadnej pozycji.';
            const errLine = errors.length ? `\nBłędy:\n${errors.map(e => `• ${e}`).join('\n')}` : '';
            return text(`${head}${errLine}${budgetLine}`);
        }
    );

    // ── ODCZYT: konta + salda ────────────────────────────────────────────────
    server.registerTool(
        'get_accounts',
        {
            title: 'Salda kont',
            description: 'Zwraca konta osobiste użytkownika z saldami.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
            const accounts = await prisma.personalAccount.findMany({
                where: { userId, closedAt: null } as any,
                select: { name: true, bank: true, type: true, currency: true, balance: true, isMain: true },
                orderBy: { createdAt: 'asc' },
            });
            if (!accounts.length) return text('Brak kont osobistych.');
            const total = accounts.filter(a => (a.currency || 'PLN') === 'PLN').reduce((s, a) => s + Number(a.balance), 0);
            const lines = accounts.map(a => `• ${a.name}${a.isMain ? ' (główne)' : ''}: ${Number(a.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${a.currency || 'PLN'}`).join('\n');
            return text(`Konta:\n${lines}\n\nSuma (PLN): ${zl(total)}`);
        }
    );

    // ── ODCZYT: podsumowanie miesiąca ────────────────────────────────────────
    server.registerTool(
        'get_monthly_summary',
        {
            title: 'Podsumowanie miesiąca',
            description: 'Wydatki i wpływy w bieżącym miesiącu, top kategorie, ulubiony sklep.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
            const s: any = await getDashboardSummaryLogic(userId);
            const top = (s.categoryStats || []).slice(0, 5)
                .map((c: any) => `• ${c.name || c.category || 'Inne'}: ${zl(c.total ?? c.amount ?? 0)}`).join('\n');
            return text(
                `Bieżący miesiąc:\n` +
                `Wydatki: ${zl(s.totalExpenses || 0)}\n` +
                `Wpływy: ${zl(s.totalIncomes || 0)}\n` +
                (s.favoriteStore?.name ? `Ulubiony sklep: ${s.favoriteStore.name} (${s.favoriteStore.count || 0})\n` : '') +
                (top ? `\nTop kategorie:\n${top}` : '')
            );
        }
    );

    // ── ODCZYT: stan budżetu + raty ──────────────────────────────────────────
    server.registerTool(
        'get_budget_status',
        {
            title: 'Stan budżetu i raty',
            description: 'Plan miesiąca: zaplanowane wydatki, ile już opłacone, ile zostało, oraz raty kredytów.',
            inputSchema: {
                month: z.number().int().min(1).max(12).optional().describe('Miesiąc 1-12; brak = bieżący') as any,
                year: z.number().int().optional().describe('Rok; brak = bieżący') as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ month, year }: any) => {
            const now = new Date();
            const m = month ?? now.getMonth() + 1;
            const y = year ?? now.getFullYear();
            const plan: any = await getMonthlyPlanLogic(userId, m, y);
            const expItems = (plan.items || []).filter((x: any) => x.type === 'expense');
            const planned = expItems.reduce((s: number, x: any) => s + Number(x.amount), 0);
            const done = expItems.filter((x: any) => x.isDone).reduce((s: number, x: any) => s + Number(x.amount), 0);
            const installments = plan.loanInstallments || [];
            const instTotal = installments.reduce((s: number, r: any) => s + Number(r.amount), 0);
            const instLines = installments.map((r: any) => `• ${r.name}: ${zl(r.amount)}`).join('\n');
            return text(
                `Budżet ${m}/${y}:\n` +
                `Zaplanowane wydatki: ${zl(planned)}\n` +
                `Opłacone: ${zl(done)}\n` +
                `Zostało: ${zl(planned - done)}\n` +
                (installments.length ? `\nRaty kredytów (suma ${zl(instTotal)}):\n${instLines}` : '')
            );
        }
    );

    // ── ODCZYT: lista/szukanie transakcji ────────────────────────────────────
    server.registerTool(
        'list_transactions',
        {
            title: 'Lista transakcji',
            description:
                'Zwraca transakcje (domyślnie bieżący miesiąc, domyślnie WYŁĄCZNIE wpisy właściciela konta). ' +
                'Filtry: month, year, accountName, type, scope. ' +
                'Do porównań/top-N/wyszukiwania przefiltruj wynik samodzielnie.',
            inputSchema: {
                month: z.number().int().min(1).max(12).optional() as any,
                year: z.number().int().optional() as any,
                accountName: z.string().optional() as any,
                type: z.enum(['expense', 'income']).optional() as any,
                scope: z.enum(['mine', 'shared', 'all']).default('mine')
                    .describe('mine = tylko moje wpisy (domyślnie); shared = tylko wspólne konta gospodarstwa; all = jedno i drugie. Użyj shared/all TYLKO gdy użytkownik wprost pyta o wydatki gospodarstwa.') as any,
                limit: z.number().int().min(1).max(200).default(50) as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ month, year, accountName, type, scope: dataScope, limit }: any) => {
            // Domyślnie 'mine': łącznik MCP nie może z automatu wypuszczać do modelu wpisów
            // współczłonka gospodarstwa — on nie wyrażał na to zgody. Własne wpisy na wspólnych
            // kontach zostają widoczne (scope 'mine' filtruje po userId, nie po koncie).
            const filters: any = { scope: dataScope ?? 'mine' };
            if (month) filters.month = String(month);
            if (year) filters.year = String(year);
            if (type) filters.type = type;
            if (accountName) {
                const acc = await resolveAccount(userId, accountName);
                if (acc) filters.personalAccountId = acc.id;
            }
            const rows: any[] = await getExpensesLogic(userId, filters);
            const sliced = rows.slice(0, limit);
            if (!sliced.length) return text('Brak transakcji dla podanych filtrów.');
            const lines = sliced.map(r => {
                const d = new Date(r.transactionDate || r.date).toISOString().slice(0, 10);
                const sign = r.type === 'income' ? '+' : '-';
                return `• ${d} ${sign}${zl(r.amount)} — ${r.store || r.description}${r.category?.name ? ` [${r.category.name}]` : ''}${r.personalAccount?.name ? ` (${r.personalAccount.name})` : ''}`;
            }).join('\n');
            return text(`Transakcje (${sliced.length}/${rows.length}):\n${lines}`);
        }
    );

    // ── ODCZYT: dane referencyjne (sklepy/kategorie/konta) ────────────────────
    server.registerTool(
        'get_reference_data',
        {
            title: 'Dane referencyjne',
            description: 'Listy kont, kategorii i znanych sklepów użytkownika — pomocne przy mapowaniu sklep→kategoria i wyborze konta.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
            const [accounts, categories, stores] = await Promise.all([
                prisma.personalAccount.findMany({ where: { userId, closedAt: null } as any, select: { name: true, isMain: true } }),
                prisma.category.findMany({ where: { OR: [{ userId: null }, { userId }] }, select: { name: true } }),
                prisma.store.findMany({ where: { OR: [{ userId }, { userId: null }] }, select: { name: true, category: { select: { name: true } } }, take: 300 }),
            ]);
            return text(
                'Konta: ' + (accounts.map(a => a.name + (a.isMain ? '*' : '')).join(', ') || '—') + '\n' +
                'Kategorie: ' + (categories.map(c => c.name).join(', ') || '—') + '\n' +
                'Sklepy: ' + (stores.map(s => `${s.name}→${s.category?.name || 'Inne'}`).join(', ') || '—')
            );
        }
    );

    // ── ODCZYT: portfel inwestycyjny ─────────────────────────────────────────
    server.registerTool(
        'get_portfolio',
        {
            title: 'Portfel inwestycyjny',
            description: 'Łączna wartość portfela, koszt, zysk/strata, gotówka na kontach inwestycyjnych i alokacja po typie aktywa.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
            const { totals, allocationByType, positions } = await getPositionsLogic(userId);
            if (!positions.length && totals.cashPLN === 0) return text('Brak inwestycji i środków na kontach inwestycyjnych.');
            const alloc = allocationByType.map((a: any) => `• ${a.type}: ${zl(a.valuePLN)} (${a.pct}%)`).join('\n');
            return text(
                `Portfel:\n` +
                `Wartość instrumentów: ${zl(totals.currentValuePLN)}\n` +
                `Zainwestowano: ${zl(totals.investedPLN)}\n` +
                `Zysk/strata: ${zl(totals.plPLN)} (${totals.plPct}%)\n` +
                `Gotówka na kontach inwest.: ${zl(totals.cashPLN)}\n` +
                `Razem (instrumenty + gotówka): ${zl(totals.equityPLN)}\n` +
                `Liczba pozycji: ${positions.length}` +
                (alloc ? `\n\nAlokacja:\n${alloc}` : '')
            );
        }
    );

    // ── ODCZYT: pozycje inwestycyjne ─────────────────────────────────────────
    server.registerTool(
        'get_positions',
        {
            title: 'Pozycje inwestycyjne',
            description: 'Lista pozycji (instrument, ilość, wartość PLN, zysk/strata, udział). Opcjonalny filtr "search" po nazwie instrumentu, np. „VWCE".',
            inputSchema: {
                search: z.string().optional().describe('Filtr po nazwie instrumentu (case-insensitive), np. "VWCE"') as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ search }: any) => {
            const { positions } = await getPositionsLogic(userId);
            let rows = positions;
            if (search) {
                const q = String(search).toLowerCase();
                rows = positions.filter((p: any) => p.name.toLowerCase().includes(q));
            }
            if (!rows.length) return text(search ? `Brak pozycji pasujących do „${search}".` : 'Brak pozycji inwestycyjnych.');
            const lines = rows.map((p: any) =>
                `• ${p.name} (${p.type}): ${zl(p.currentValuePLN)} | ${p.totalQuantity} szt. | wynik ${zl(p.plPLN)} (${p.plPct}%) | udział ${p.allocationPct}%`
            ).join('\n');
            return text(`Pozycje (${rows.length}):\n${lines}`);
        }
    );

    // ── ODCZYT: oszczędności + cele ──────────────────────────────────────────
    server.registerTool(
        'get_savings',
        {
            title: 'Oszczędności i cele',
            description: 'Suma oszczędności oraz postęp celów oszczędnościowych.',
            inputSchema: {},
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async () => {
            const [summary, goals] = await Promise.all([
                getSavingsSummaryLogic(userId),
                getSavingsGoalsLogic(userId, { seed: false }),
            ]);
            const goalLines = goals.map((g: any) => {
                const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
                return `• ${g.name}${g.isMain ? ' (główny)' : ''}: ${zl(g.currentAmount)} z ${zl(g.targetAmount)} (${pct}%)`;
            }).join('\n');
            return text(
                `Oszczędności łącznie: ${zl(summary.total)} (${summary.accountsCount} kont)` +
                (goalLines ? `\n\nCele:\n${goalLines}` : '\n\nBrak zdefiniowanych celów.')
            );
        }
    );

    // ── ODCZYT: limity IKE/IKZE ──────────────────────────────────────────────
    server.registerTool(
        'get_retirement_limits',
        {
            title: 'Limity IKE/IKZE',
            description: 'Wpłaty na konta IKE/IKZE w danym roku vs roczny limit (ile jeszcze można wpłacić).',
            inputSchema: {
                year: z.number().int().optional().describe('Rok; brak = bieżący') as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ year }: any) => {
            const y = year ?? new Date().getFullYear();
            const rows = await getRetirementContributionStatus(userId, y);
            if (!rows.length) return text('Brak kont IKE/IKZE.');
            const lines = rows.map(r =>
                `• ${r.accountName} (${r.type}${r.ikzeBusiness ? ', działalność' : ''}): wpłacono ${zl(r.contributed)} z ${zl(r.limit)} — zostało ${zl(r.remaining)}`
            ).join('\n');
            return text(`Limity wpłat ${y}:\n${lines}`);
        }
    );

    // ── ODCZYT: wspólne wydatki (gospodarstwo) ───────────────────────────────
    server.registerTool(
        'get_shared_expenses',
        {
            title: 'Wspólne wydatki',
            description:
                'Wydatki na wspólnych kontach gospodarstwa (domyślnie bieżący miesiąc) z rozbiciem „kto ile". ' +
                'Obejmuje wpisy współczłonków gospodarstwa — wywołuj, gdy użytkownik pyta o wspólny budżet.',
            inputSchema: {
                month: z.number().int().min(1).max(12).optional() as any,
                year: z.number().int().optional() as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ month, year }: any) => {
            const now = new Date();
            const m = String(month ?? now.getMonth() + 1);
            const y = String(year ?? now.getFullYear());
            const rows: any[] = await getExpensesLogic(userId, { scope: 'shared', type: 'expense', month: m, year: y });
            if (!rows.length) return text('Brak wspólnych wydatków w tym okresie (lub brak wspólnych kont).');
            const byUser = new Map<string, number>();
            let total = 0;
            for (const r of rows) {
                const amt = Number(r.plnAmount ?? r.amount ?? 0);
                total += amt;
                byUser.set(r.userId, (byUser.get(r.userId) || 0) + amt);
            }
            // Bez `email` w select: dane kontaktowe współczłonka nie mają czego szukać w kontekście
            // zewnętrznego modelu. Nie da się wypuścić tego, czego nie pobieramy.
            const users = await prisma.user.findMany({
                where: { id: { in: Array.from(byUser.keys()) } },
                select: { id: true, username: true },
            });
            const nameOf = (id: string) => id === userId ? 'Ty' : (users.find(u => u.id === id)?.username || 'Współczłonek');
            const lines = Array.from(byUser.entries()).sort((a, b) => b[1] - a[1])
                .map(([id, amt]) => `• ${nameOf(id)}: ${zl(amt)}`).join('\n');
            return text(`Wspólne wydatki (${m}/${y}): ${zl(total)}\nKto ile:\n${lines}`);
        }
    );

    // ── ZAPIS INWESTYCJI: krok 1 — podgląd (bez zapisu) ──────────────────────
    server.registerTool(
        'preview_investment',
        {
            title: 'Podgląd inwestycji',
            description:
                'Rozwiązuje dane inwestycji do dodania (konto, ilość, cena, waluta) BEZ zapisu. ' +
                'Zwróć wynik użytkownikowi do potwierdzenia; po akceptacji wywołaj commit_investment z polem "item" z odpowiedzi.',
            inputSchema: {
                name: z.string().describe('Nazwa instrumentu, np. "VWCE" / "Obligacje EDO" / "Złoto"') as any,
                quantity: z.number().positive().default(1).describe('Ilość (sztuk)') as any,
                purchasePrice: z.number().positive().describe('Cena zakupu za sztukę') as any,
                currency: z.string().optional().describe('Waluta ceny (np. PLN, EUR, USD); brak = PLN') as any,
                accountName: z.string().optional().describe('Nazwa konta inwestycyjnego; brak = pierwsze konto') as any,
                type: z.string().optional().describe('Typ aktywa (np. ETF, STOCK, BOND, GOLD); brak = OTHER') as any,
                date: z.string().optional().describe('Data zakupu ISO YYYY-MM-DD; brak = dzisiaj') as any,
                isHistorical: z.boolean().optional().describe('true = wpis historyczny (nie pobiera środków z konta)') as any,
            },
            annotations: { readOnlyHint: true, openWorldHint: false },
        },
        async ({ name, quantity, purchasePrice, currency, accountName, type, date, isHistorical }: any) => {
            const acc = await resolveInvestmentAccount(userId, accountName);
            if (!acc) return text('Nie znaleziono konta inwestycyjnego. Najpierw dodaj konto w SmartPortfel.');
            const qty = quantity ?? 1;
            const cur = (currency || 'PLN').toUpperCase();
            const d = date || todayISO();
            const item = {
                name, quantity: qty, purchasePrice, currency: cur,
                accountId: acc.id, accountName: acc.name, type: type || 'OTHER',
                date: d, isHistorical: !!isHistorical,
            };
            const totalCost = qty * purchasePrice;
            const money = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return text(
                `Do dodania:\n` +
                `• ${name} — ${qty} szt. × ${money(purchasePrice)} ${cur} = ${money(totalCost)} ${cur}\n` +
                `  konto: ${acc.name} (saldo ${money(acc.balance)} ${acc.currency}), typ: ${item.type}, data: ${d}${isHistorical ? ', wpis historyczny' : ''}\n\n` +
                `Poproś użytkownika o potwierdzenie. Po „tak" wywołaj commit_investment z poniższym "item":\n` +
                '```json\n' + JSON.stringify({ item }, null, 2) + '\n```'
            );
        }
    );

    // ── ZAPIS INWESTYCJI: krok 2 — commit (zapis) ────────────────────────────
    if (canWrite) server.registerTool(
        'commit_investment',
        {
            title: 'Zapisz inwestycję',
            description: 'Zapisuje inwestycję zwróconą przez preview_investment (pole "item"). Wywołuj WYŁĄCZNIE po potwierdzeniu przez użytkownika.',
            inputSchema: {
                item: z.object({
                    name: z.string(),
                    quantity: z.number().positive(),
                    purchasePrice: z.number().positive(),
                    currency: z.string(),
                    accountId: z.string(),
                    accountName: z.string().optional(),
                    type: z.string().optional(),
                    date: z.string(),
                    isHistorical: z.boolean().optional(),
                }) as any,
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        },
        async ({ item }: any) => {
            try {
                await createInvestmentBusinessLogic(userId, {
                    name: item.name,
                    quantity: item.quantity,
                    purchasePrice: item.purchasePrice,
                    currency: item.currency,
                    accountId: item.accountId,
                    type: item.type,
                    purchaseDate: item.date,
                    isHistorical: item.isHistorical,
                });
                const acc = await prisma.investmentAccount.findUnique({
                    where: { id: item.accountId },
                    select: { name: true, balance: true, currency: true },
                });
                const saldo = acc
                    ? `\nSaldo konta ${acc.name}: ${Number(acc.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${acc.currency || 'PLN'}`
                    : '';
                return text(`Dodano inwestycję ✅ ${item.name} (${item.quantity} szt.)${saldo}`);
            } catch (e: any) {
                return text(`Nie udało się dodać: ${e?.message || 'błąd'}`);
            }
        }
    );

    return server;
}
