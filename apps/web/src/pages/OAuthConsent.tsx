import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Plug, ShieldCheck } from 'lucide-react';
import api from '../lib/api';

interface AuthReqInfo {
    clientName: string;
    scope: string;
    redirectHost: string;
}

export default function OAuthConsent() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const req = searchParams.get('req') || '';

    const [info, setInfo] = useState<AuthReqInfo | null>(null);
    // Brak `req` w adresie znamy od pierwszego renderu — stan początkowy mówi to wprost,
    // zamiast pokazywać spinner i gasić go efektem w tej samej klatce.
    const [loading, setLoading] = useState(!!req);
    const [error, setError] = useState<string | null>(req ? null : 'Nieprawidłowy link autoryzacji.');
    const [submitting, setSubmitting] = useState(false);

    const isLoggedIn = !!localStorage.getItem('token');

    useEffect(() => {
        if (!req) return;
        api.get(`/oauth/authrequest`, { params: { req } })
            .then((res) => setInfo(res.data))
            .catch((e) => setError(e?.response?.data?.message || 'Link autoryzacji wygasł lub jest nieprawidłowy.'))
            .finally(() => setLoading(false));
    }, [req]);

    const goLogin = () => {
        navigate(`/login?redirect=${encodeURIComponent(`/oauth/consent?req=${req}`)}`);
    };

    const decide = async (decision: 'allow' | 'deny') => {
        if (!isLoggedIn) {
            goLogin();
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await api.post('/oauth/approve', { req, decision });
            // Wróć do klienta MCP (Perplexity / Claude.ai) z kodem albo błędem.
            window.location.href = res.data.redirectUrl;
        } catch (e: any) {
            setError(e?.response?.data?.message || 'Coś poszło nie tak. Spróbuj ponownie.');
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-site px-4">
            <div className="w-full max-w-md bg-surface border border-white/10 rounded-[8px] p-8 shadow-card">
                <div className="flex items-center gap-2 mb-6">
                    <Plug size={22} className="text-primary" />
                    <span className="text-lg font-bold text-white">SmartPortfel</span>
                    <span className="ml-auto text-[10px] font-black uppercase tracking-wider bg-secondary/20 text-secondary border border-secondary/20 rounded-full px-2 py-0.5">
                        MCP
                    </span>
                </div>

                {loading ? (
                    <p className="text-sm text-gray-400">Ładowanie…</p>
                ) : error ? (
                    <div className="space-y-4">
                        <p className="text-sm text-danger">{error}</p>
                        <Link to="/dashboard" className="text-sm text-primary hover:underline">
                            Wróć do SmartPortfel
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <h1 className="text-xl font-bold text-white mb-2">Zezwolić na dostęp?</h1>
                            <p className="text-sm text-gray-300 leading-relaxed">
                                <span className="font-semibold text-white">{info?.clientName}</span> prosi o dostęp do Twoich
                                danych w SmartPortfel (odczyt wydatków, kont, oszczędności, inwestycji oraz dodawanie
                                transakcji — zawsze z potwierdzeniem).
                            </p>
                            <p className="text-xs text-gray-500 mt-3">
                                Jeśli masz gospodarstwo domowe: aplikacja może na Twoje wyraźne pytanie pokazać też
                                wydatki na wspólnych kontach. Dane kontaktowe współczłonków nie są udostępniane.
                            </p>
                            {info?.redirectHost && (
                                <p className="text-xs text-gray-500 mt-3">Po zatwierdzeniu wrócisz do: {info.redirectHost}</p>
                            )}
                        </div>

                        <div className="flex items-start gap-2 text-xs text-gray-400 bg-site border border-white/10 rounded-[5px] p-3">
                            <ShieldCheck size={16} className="text-primary shrink-0 mt-0.5" />
                            Dostęp możesz w każdej chwili odwołać w Ustawieniach → SmartPortfel MCP.
                        </div>

                        {!isLoggedIn && (
                            <p className="text-xs text-gray-500">Aby kontynuować, zaloguj się do SmartPortfel.</p>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => decide('deny')}
                                disabled={submitting}
                                className="flex-1 h-11 rounded-[5px] border border-white/10 text-sm font-medium text-gray-300 hover:bg-white/5 disabled:opacity-40 transition-colors"
                            >
                                Odrzuć
                            </button>
                            <button
                                onClick={() => decide('allow')}
                                disabled={submitting}
                                className="flex-1 h-11 rounded-[5px] bg-primary text-black text-sm font-black uppercase tracking-wider hover:opacity-90 disabled:opacity-40 transition-opacity"
                            >
                                {submitting ? 'Łączenie…' : isLoggedIn ? 'Zezwól' : 'Zaloguj i zezwól'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
