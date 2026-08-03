import { useEffect, useState } from 'react';
import { Plug, Copy, Check, Trash2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';

type McpScope = 'read' | 'write';

interface McpTokenItem {
    id: string;
    prefix: string;
    name: string | null;
    scope: McpScope;
    lastUsedAt: string | null;
    createdAt: string;
}

export default function MCPSettings() {
    const [tokens, setTokens] = useState<McpTokenItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [newName, setNewName] = useState('');
    // Świeży token pokazywany RAZ po utworzeniu. read → URL z tokenem; write → snippet nagłówkowy (bez tokenu w URL).
    const [fresh, setFresh] = useState<{ token: string; scope: McpScope } | null>(null);
    const [copied, setCopied] = useState<'url' | 'snippet' | 'base' | 'header' | null>(null);
    const { success, error: toastError } = useToast();

    const mcpBase = `${window.location.origin}/api/mcp`;

    const fetchTokens = async () => {
        try {
            const res = await api.get('/mcp-tokens');
            setTokens(res.data);
        } catch {
            // błąd pobrania listy — obsłużony przez globalny toast w lib/api
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTokens();
    }, []);

    const createToken = async (scope: McpScope) => {
        setBusy(true);
        try {
            const res = await api.post('/mcp-tokens', { name: newName.trim() || undefined, scope });
            setFresh({ token: res.data.token, scope: res.data.scope ?? scope });
            setNewName('');
            success('Łącznik utworzony — skopiuj teraz, nie pokażemy go ponownie.');
            fetchTokens();
        } catch (e: any) {
            toastError(e?.response?.data?.message || 'Nie udało się utworzyć łącznika');
        } finally {
            setBusy(false);
        }
    };

    const revoke = async (id: string) => {
        setBusy(true);
        try {
            await api.delete(`/mcp-tokens/${id}`);
            success('Łącznik odwołany');
            if (fresh) setFresh(null);
            fetchTokens();
        } catch (e: any) {
            toastError(e?.response?.data?.message || 'Nie udało się odwołać łącznika');
        } finally {
            setBusy(false);
        }
    };

    const copy = async (value: string, which: 'url' | 'snippet' | 'base' | 'header') => {
        try {
            await navigator.clipboard.writeText(value);
            setCopied(which);
            setTimeout(() => setCopied(null), 1500);
        } catch {
            toastError('Nie udało się skopiować');
        }
    };

    const freshUrl = fresh && fresh.scope === 'read' ? `${mcpBase}/${fresh.token}` : null;
    // Snippet Claude Desktop. read → token w URL (tylko odczyt). write → token w nagłówku (nigdy w URL).
    const desktopSnippet = fresh
        ? JSON.stringify(
            {
                mcpServers: {
                    smartportfel: fresh.scope === 'read'
                        ? { command: 'npx', args: ['-y', 'mcp-remote', `${mcpBase}/${fresh.token}`] }
                        : { command: 'npx', args: ['-y', 'mcp-remote', mcpBase, '--header', `Authorization: Bearer ${fresh.token}`] },
                },
            },
            null,
            2
        )
        : '';
    const headerCli = fresh && fresh.scope === 'write'
        ? `npx -y mcp-remote ${mcpBase} --header "Authorization: Bearer ${fresh.token}"`
        : '';

    return (
        <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Plug size={20} className="text-primary" />
                SmartPortfel MCP — Claude / Perplexity
            </h3>
            <p className="text-sm text-gray-400 mb-6">
                Połącz SmartPortfel z Claude lub Perplexity i dodawaj wydatki oraz pytaj o finanse w naturalnym języku
                (np. „dzisiaj: 35 zł Biedronka, 89 zł Orlen"). Zapis zawsze prosi o potwierdzenie.
            </p>
                <div className="space-y-6">
                    {/* Metoda A: OAuth (Perplexity / Claude.ai / Claude Desktop) — wklej bazowy URL */}
                    <div className="bg-site border border-white/10 rounded-[5px] p-5 space-y-3">
                        <p className="text-sm text-gray-300">
                            <span className="font-semibold text-white">Zalecane (Perplexity, Claude.ai, Claude Desktop):</span> w aplikacji otwórz
                            {' '}<span className="font-semibold text-white">Łączniki / Connectors → Dodaj własny</span>, wklej poniższy adres i zapisz.
                            Zalogujesz się do SmartPortfel i potwierdzisz dostęp — bez kopiowania tokenu.
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 truncate text-xs text-white bg-black/40 border border-white/10 rounded-[4px] px-3 py-2.5">
                                {mcpBase}
                            </code>
                            <button
                                onClick={() => copy(mcpBase, 'base')}
                                className="shrink-0 h-9 px-3 rounded-[4px] bg-primary text-black text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90"
                            >
                                {copied === 'base' ? <Check size={14} /> : <Copy size={14} />} {copied === 'base' ? 'Skopiowano' : 'Kopiuj URL'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                            Metoda zaawansowana (plik konfiguracyjny <code>mcp-remote</code>, bez OAuth): wygeneruj token poniżej.
                        </p>
                    </div>

                    {/* Tworzenie — dwie metody: URL tylko-odczyt vs token pełny w nagłówku */}
                    <div className="space-y-3">
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Nazwa łącznika (opcjonalnie, np. Mój Claude)"
                            className="w-full h-11 px-3 bg-site border border-white/10 rounded-[5px] text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-primary/50"
                        />
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                onClick={() => createToken('read')}
                                disabled={busy}
                                className="flex-1 h-11 px-5 rounded-[5px] bg-primary text-black text-sm font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
                            >
                                Łącznik URL (tylko odczyt)
                            </button>
                            <button
                                onClick={() => createToken('write')}
                                disabled={busy}
                                className="flex-1 h-11 px-5 rounded-[5px] bg-white/10 text-white text-sm font-black uppercase tracking-wider hover:bg-white/20 disabled:opacity-40 transition-colors"
                            >
                                Token pełny (nagłówek)
                            </button>
                        </div>
                        <p className="text-xs text-gray-500">
                            <span className="text-white/70">Tylko odczyt</span> — prosty URL do wklejenia, ale token trafia do adresu (i logów), więc bez zapisu.
                            {' '}<span className="text-white/70">Pełny</span> — token w nagłówku <code>Authorization: Bearer</code> (nigdy w URL), pozwala też dodawać wpisy.
                        </p>
                        <p className="text-xs text-gray-500">
                            Łącznik domyślnie widzi <span className="text-white/70">wyłącznie Twoje wpisy</span>. Jeśli masz gospodarstwo domowe,
                            po wyraźnym pytaniu o wspólny budżet pokaże też wydatki na wspólnych kontach — bez danych kontaktowych współczłonków.
                        </p>
                    </div>

                    {/* Świeży token — pokazywany raz */}
                    {fresh && (
                        <div className="bg-primary/5 border border-primary/30 rounded-[5px] p-5 space-y-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider">
                                Skopiuj teraz — nie pokażemy tego ponownie
                            </p>

                            {fresh.scope === 'read' && freshUrl ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 min-w-0 truncate text-xs text-white bg-black/40 border border-white/10 rounded-[4px] px-3 py-2.5">
                                            {freshUrl}
                                        </code>
                                        <button
                                            onClick={() => copy(freshUrl, 'url')}
                                            className="shrink-0 h-9 px-3 rounded-[4px] bg-primary text-black text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90"
                                        >
                                            {copied === 'url' ? <Check size={14} /> : <Copy size={14} />} {copied === 'url' ? 'Skopiowano' : 'Kopiuj URL'}
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-amber-400/90">
                                        Łącznik <span className="font-semibold">tylko do odczytu</span>. Aby dodawać wpisy głosem/czatem, użyj tokenu pełnego lub OAuth.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-300">
                                        Wklej w konfiguracji <code>mcp-remote</code> (token w nagłówku — <span className="text-amber-400/90 font-semibold">nie wklejaj go do adresu URL</span>):
                                    </p>
                                    <div className="flex items-start gap-2">
                                        <pre className="flex-1 min-w-0 overflow-x-auto text-[11px] text-white/90 bg-black/40 border border-white/10 rounded-[4px] p-3">{headerCli}</pre>
                                        <button
                                            onClick={() => copy(headerCli, 'header')}
                                            className="shrink-0 h-9 px-3 rounded-[4px] bg-primary text-black text-xs font-bold inline-flex items-center gap-1.5 hover:opacity-90"
                                        >
                                            {copied === 'header' ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </>
                            )}

                            <details className="text-xs text-gray-400">
                                <summary className="cursor-pointer hover:text-white transition-colors">Zaawansowane: Claude Desktop (plik konfiguracyjny)</summary>
                                <div className="mt-2 flex items-start gap-2">
                                    <pre className="flex-1 min-w-0 overflow-x-auto text-[11px] text-white/80 bg-black/40 border border-white/10 rounded-[4px] p-3">{desktopSnippet}</pre>
                                    <button
                                        onClick={() => copy(desktopSnippet, 'snippet')}
                                        className="shrink-0 h-9 px-3 rounded-[4px] bg-white/10 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-white/20"
                                    >
                                        {copied === 'snippet' ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                </div>
                            </details>
                        </div>
                    )}

                    {/* Lista aktywnych łączników */}
                    <div>
                        <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Aktywne łączniki</p>
                        {loading ? (
                            <p className="text-sm text-gray-500">Ładowanie…</p>
                        ) : tokens.length === 0 ? (
                            <p className="text-sm text-gray-500">Brak. Wygeneruj pierwszy łącznik powyżej.</p>
                        ) : (
                            <ul className="space-y-2">
                                {tokens.map((t) => (
                                    <li key={t.id} className="flex items-center justify-between gap-3 bg-site border border-white/10 rounded-[5px] px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="text-sm text-white font-medium truncate flex items-center gap-2">
                                                <span className="truncate">{t.name || 'Łącznik'} <span className="text-gray-500 font-mono">{t.prefix}…</span></span>
                                                <span className={`shrink-0 text-[9px] font-black uppercase tracking-wider rounded-full px-2 py-0.5 border ${t.scope === 'write' ? 'bg-primary/15 text-primary border-primary/25' : 'bg-amber-500/15 text-amber-400 border-amber-500/25'}`}>
                                                    {t.scope === 'write' ? 'Pełny' : 'Tylko odczyt'}
                                                </span>
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {t.lastUsedAt ? `Ostatnio użyty: ${new Date(t.lastUsedAt).toLocaleString('pl-PL')}` : 'Jeszcze nieużywany'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => revoke(t.id)}
                                            disabled={busy}
                                            className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-danger/80 hover:text-danger transition-colors disabled:opacity-40"
                                        >
                                            <Trash2 size={14} /> Odwołaj
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
        </div>
    );
}
