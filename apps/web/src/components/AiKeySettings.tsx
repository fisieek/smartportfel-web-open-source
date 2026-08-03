import { useEffect, useState } from 'react';
import { KeyRound, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';

type Provider = 'gemini' | 'openai';

interface AiKeyStatus {
    configured: boolean;
    provider: Provider | null;
    last4: string | null;
    createdAt: string | null;
    encryptionAvailable: boolean;
}

const PROVIDERS: { id: Provider; label: string; keysUrl: string; hint: string }[] = [
    {
        id: 'gemini',
        label: 'Google Gemini',
        keysUrl: 'https://aistudio.google.com/apikey',
        hint: 'Ma darmowy pakiet — w zupełności wystarcza do domowego użytku.',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        keysUrl: 'https://platform.openai.com/api-keys',
        hint: 'Rozliczane według zużycia na Twoim koncie OpenAI.',
    },
];

/**
 * BYOK — klucz API użytkownika do funkcji AI (kategoryzacja, odczyt PDF).
 * Klucz nigdy nie wraca z serwera: po zapisie widać tylko cztery ostatnie znaki.
 */
export default function AiKeySettings() {
    const [status, setStatus] = useState<AiKeyStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [provider, setProvider] = useState<Provider>('gemini');
    const [apiKey, setApiKey] = useState('');
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const { success, error: toastError } = useToast();

    const fetchStatus = async () => {
        try {
            const res = await api.get('/ai/key');
            setStatus(res.data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleSave = async () => {
        if (!apiKey.trim()) return;
        setSaving(true);
        try {
            const res = await api.put('/ai/key', { provider, apiKey: apiKey.trim() });
            setStatus(res.data);
            setApiKey(''); // nie trzymamy jawnego klucza w stanie dłużej niż to konieczne
            setEditing(false);
            success('Klucz AI zapisany i zweryfikowany.');
        } catch (e: any) {
            toastError(e.response?.data?.message || 'Nie udało się zapisać klucza.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            const res = await api.delete('/ai/key');
            setStatus(res.data);
            setConfirmDelete(false);
            success('Klucz AI usunięty.');
        } catch (e: any) {
            toastError(e.response?.data?.message || 'Nie udało się usunąć klucza.');
        }
    };

    const card = (children: React.ReactNode) => (
        <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden h-fit">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <KeyRound size={20} className="text-secondary" />
                Klucz AI
            </h3>
            {children}
        </div>
    );

    if (loading) {
        return card(<div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" /> Ładowanie…</div>);
    }
    if (!status) return card(<p className="text-sm text-gray-400">Nie udało się odczytać stanu klucza.</p>);

    // Instancja bez AI_KEY_ENCRYPTION_KEY nie może bezpiecznie przechować klucza.
    if (!status.encryptionAvailable) {
        return card(
            <p className="text-sm text-gray-400 leading-relaxed">
                Funkcje AI są wyłączone na tej instancji — administrator nie ustawił
                <code className="mx-1 rounded bg-white/5 px-1.5 py-0.5 text-[12px] text-gray-300">AI_KEY_ENCRYPTION_KEY</code>,
                więc klucze użytkowników nie mogą być przechowywane. Reszta aplikacji działa normalnie.
            </p>
        );
    }

    const active = PROVIDERS.find(p => p.id === provider)!;

    return card(
        <div className="space-y-5">
            {status.configured && !editing ? (
                <>
                    <div className="flex items-center justify-between gap-4 p-4 rounded-[5px] bg-white/5 border border-white/5">
                        <div>
                            <p className="font-bold text-white">
                                {PROVIDERS.find(p => p.id === status.provider)?.label ?? status.provider}
                            </p>
                            <p className="text-sm text-gray-400 font-mono">•••••••••{status.last4}</p>
                        </div>
                        <span className="text-xs text-emerald-400 font-medium">Aktywny</span>
                    </div>
                    <p className="text-xs text-gray-500">
                        Dodany {status.createdAt ? new Date(status.createdAt).toLocaleDateString('pl-PL') : '—'}.
                        Klucz jest zaszyfrowany i używany wyłącznie do Twoich zapytań — bez limitów po naszej stronie.
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setProvider(status.provider ?? 'gemini'); setEditing(true); }}
                            className="px-4 py-2 bg-white/5 border border-white/10 text-white font-medium rounded-[5px] hover:bg-white/10 transition-colors text-sm"
                        >
                            Zamień klucz
                        </button>
                        {confirmDelete ? (
                            <>
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 bg-rose-500/15 border border-rose-500/30 text-rose-300 font-medium rounded-[5px] hover:bg-rose-500/25 transition-colors text-sm"
                                >
                                    Na pewno usuń
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                                >
                                    Anuluj
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="inline-flex items-center gap-1.5 px-4 py-2 text-gray-400 hover:text-rose-300 transition-colors text-sm"
                            >
                                <Trash2 size={14} /> Usuń
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        Funkcje AI — automatyczna kategoryzacja wydatków, odczyt wyciągów PDF i szybkie
                        dodawanie głosem — działają na Twoim własnym kluczu API. Klucz jest szyfrowany
                        i używany wyłącznie do Twoich zapytań: idą prosto do dostawcy, na Twoje konto.
                        Nie ma żadnych limitów po naszej stronie.
                    </p>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Dostawca</label>
                        <div className="grid grid-cols-2 gap-2">
                            {PROVIDERS.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setProvider(p.id)}
                                    className={`px-4 py-2.5 rounded-[5px] border text-sm font-medium transition-colors ${
                                        provider === p.id
                                            ? 'bg-white/10 border-white/20 text-white'
                                            : 'bg-site border-white/10 text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <p className="mt-2 text-xs text-gray-500">{active.hint}</p>
                    </div>

                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Klucz API</label>
                        <input
                            type="password"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="Wklej klucz…"
                            className="w-full bg-site border border-white/10 rounded-[5px] px-5 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary/50 transition-colors"
                        />
                        <a
                            href={active.keysUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                        >
                            Skąd wziąć klucz {active.label} <ExternalLink size={12} />
                        </a>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleSave}
                            disabled={saving || !apiKey.trim()}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white font-medium rounded-[5px] hover:bg-white/10 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {saving ? 'Weryfikuję u dostawcy…' : 'Zapisz klucz'}
                        </button>
                        {editing && (
                            <button
                                onClick={() => { setEditing(false); setApiKey(''); }}
                                className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
                            >
                                Anuluj
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
