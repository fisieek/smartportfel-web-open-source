import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Check, X, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { SEO } from '../components/SEO';
import LandingNav from '../components/LandingV2/LandingNav';
import Footer from '../components/LandingV2/Footer';

interface InvitationInfo {
    valid: boolean;
    status?: string;
    expired?: boolean;
    email?: string;
    householdName?: string;
    inviterName?: string;
}

/**
 * Wspólna ramka wszystkich stanów tej strony.
 *
 * Zadeklarowana NA POZIOMIE MODUŁU, nie w środku `InvitationPage`. Komponent
 * tworzony w trakcie renderu jest przy każdym przejściu innym typem, więc React
 * odmontowuje poddrzewo i gubi jego stan (tu: zawartość znika i pojawia się od nowa
 * przy każdej zmianie `loading`/`busy`).
 */
const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white border border-neutral-200 rounded-2xl shadow-xl p-8 text-center">
            <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-[#1eb3ab]/10 flex items-center justify-center">
                <Users size={26} className="text-[#1eb3ab]" />
            </div>
            {children}
        </div>
    </div>
);

/**
 * Strona zaproszenia do gospodarstwa (link z e-maila): /zaproszenie?token=...
 * Niezalogowany — prośba o logowanie/rejestrację. Zalogowany — Dołącz / Odrzuć.
 */
export default function InvitationPage() {
    const [params] = useSearchParams();
    const token = params.get('token') || '';
    const navigate = useNavigate();
    const { success, error: toastError } = useToast();

    const [info, setInfo] = useState<InvitationInfo | null>(null);
    // Bez tokenu nie ma czego pobierać — zaczynamy od razu w stanie „po ładowaniu",
    // zamiast wchodzić w spinner i gasić go efektem w tej samej klatce.
    const [loading, setLoading] = useState(!!token);
    const [busy, setBusy] = useState(false);
    const isLoggedIn = !!localStorage.getItem('token');

    useEffect(() => {
        if (!token) return;
        api.get(`/household/invitation/${encodeURIComponent(token)}`)
            .then(res => setInfo(res.data))
            .catch(() => setInfo({ valid: false }))
            .finally(() => setLoading(false));
    }, [token]);

    const respond = async (accept: boolean) => {
        setBusy(true);
        try {
            await api.post(`/household/${accept ? 'accept' : 'decline'}`, { token });
            success(accept ? 'Dołączyłeś do wspólnego budżetu!' : 'Zaproszenie odrzucone');
            navigate('/dashboard/settings');
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Operacja nie powiodła się');
            setBusy(false);
        }
    };

    let content: React.ReactNode;
    if (loading) {
        content = <Card><Loader2 size={24} className="mx-auto animate-spin text-neutral-400" /></Card>;
    } else if (!token || !info || !info.valid) {
        const msg = info?.expired
            ? 'To zaproszenie wygasło.'
            : info?.status === 'ACCEPTED'
                ? 'To zaproszenie zostało już wykorzystane.'
                : 'Zaproszenie jest nieprawidłowe lub nie istnieje.';
        content = (
            <Card>
                <AlertCircle size={28} className="mx-auto mb-3 text-amber-500" />
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Nieprawidłowe zaproszenie</h1>
                <p className="text-gray-600 mb-6">{msg}</p>
                <Link to="/" className="text-[#1eb3ab] font-semibold hover:underline">Wróć na stronę główną</Link>
            </Card>
        );
    } else if (!isLoggedIn) {
        content = (
            <Card>
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Zaproszenie do wspólnego budżetu</h1>
                <p className="text-gray-600 mb-1">
                    <strong>{info.inviterName}</strong> zaprasza Cię do „<strong>{info.householdName}</strong>".
                </p>
                <p className="text-sm text-gray-500 mb-6">
                    Zaloguj się lub załóż konto na adres <strong>{info.email}</strong>, aby dołączyć.
                </p>
                <div className="flex gap-3 justify-center">
                    <Link to={`/login?redirect=${encodeURIComponent(`/zaproszenie?token=${token}`)}`}
                        className="px-6 py-3 bg-black text-white rounded-full font-bold hover:bg-neutral-800 transition-colors">
                        Zaloguj się
                    </Link>
                    <Link to={`/register?invitation=${encodeURIComponent(token)}`}
                        className="px-6 py-3 bg-white border border-neutral-300 text-gray-900 rounded-full font-bold hover:bg-neutral-50 transition-colors">
                        Załóż konto
                    </Link>
                </div>
            </Card>
        );
    } else {
        content = (
            <Card>
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Zaproszenie do wspólnego budżetu</h1>
                <p className="text-gray-600 mb-6">
                    <strong>{info.inviterName}</strong> zaprasza Cię do „<strong>{info.householdName}</strong>".
                    Po dołączeniu zobaczycie wspólnie konta oznaczone jako wspólne.
                </p>
                <div className="flex gap-3 justify-center">
                    <button onClick={() => respond(true)} disabled={busy}
                        className="flex items-center gap-2 px-6 py-3 bg-[#1eb3ab] text-white rounded-full font-bold hover:bg-[#179a93] transition-colors disabled:opacity-50">
                        <Check size={18} /> Dołącz
                    </button>
                    <button onClick={() => respond(false)} disabled={busy}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-neutral-300 text-gray-700 rounded-full font-bold hover:bg-neutral-50 transition-colors disabled:opacity-50">
                        <X size={18} /> Odrzuć
                    </button>
                </div>
            </Card>
        );
    }

    return (
        <div className="bg-white min-h-screen flex flex-col text-neutral-900" style={{ color: '#000000' }}>
            <SEO title="Zaproszenie do wspólnego budżetu" />
            <LandingNav />
            <main className="flex-grow pt-[100px]">{content}</main>
            <Footer />
        </div>
    );
}
