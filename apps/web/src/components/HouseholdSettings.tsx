import { useEffect, useState } from 'react';
import { Users, UserPlus, Crown, LogOut, Trash2, Check, X } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from './ui/ConfirmModal';

interface Member {
    id: string;
    role: 'OWNER' | 'MEMBER';
    user: { id: string; username: string; email: string };
}
interface Invitation {
    id: string;
    email: string;
    expiresAt: string;
}
interface PendingForMe {
    id: string;
    token: string;
    household: { name: string };
    invitedBy: { username: string };
}
interface HouseholdData {
    household: { id: string; name: string; members: Member[]; invitations?: Invitation[] } | null;
    role: 'OWNER' | 'MEMBER' | null;
    pendingInvitations: PendingForMe[];
}

export default function HouseholdSettings() {
    const [data, setData] = useState<HouseholdData | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [newName, setNewName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
    const { success, error: toastError } = useToast();

    const fetchData = async () => {
        try {
            const res = await api.get('/household');
            setData(res.data);
        } catch {
            // brak gospodarstwa = stan początkowy; nie blokujemy widoku
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // Odśwież dane, gdy użytkownik wraca do karty/okna — np. właściciel zobaczy
    // od razu, że zaproszony zaakceptował (akceptacja dzieje się w innej sesji).
    useEffect(() => {
        const refetchOnFocus = () => {
            if (document.visibilityState === 'visible') fetchData();
        };
        window.addEventListener('focus', refetchOnFocus);
        document.addEventListener('visibilitychange', refetchOnFocus);
        return () => {
            window.removeEventListener('focus', refetchOnFocus);
            document.removeEventListener('visibilitychange', refetchOnFocus);
        };
    }, []);

    const handleCreate = async () => {
        if (!newName.trim()) { toastError('Podaj nazwę gospodarstwa'); return; }
        setBusy(true);
        try {
            await api.post('/household', { name: newName.trim() });
            success('Gospodarstwo utworzone');
            setNewName('');
            await fetchData();
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Nie udało się utworzyć gospodarstwa');
        } finally { setBusy(false); }
    };

    const handleInvite = async () => {
        if (!inviteEmail.trim()) { toastError('Podaj adres e-mail'); return; }
        setBusy(true);
        try {
            await api.post('/household/invite', { email: inviteEmail.trim() });
            success('Zaproszenie wysłane');
            setInviteEmail('');
            await fetchData();
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Nie udało się wysłać zaproszenia');
        } finally { setBusy(false); }
    };

    const handleLeave = async () => {
        setBusy(true);
        try {
            const res = await api.post('/household/leave');
            success(res.data?.message || 'Opuszczono gospodarstwo');
            await fetchData();
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Nie udało się opuścić gospodarstwa');
        } finally { setBusy(false); }
    };

    const handleRemove = async (memberId: string) => {
        setBusy(true);
        try {
            await api.delete(`/household/members/${memberId}`);
            success('Członek usunięty');
            await fetchData();
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Nie udało się usunąć członka');
        } finally { setBusy(false); }
    };

    const handleRespond = async (token: string, accept: boolean) => {
        setBusy(true);
        try {
            await api.post(`/household/${accept ? 'accept' : 'decline'}`, { token });
            success(accept ? 'Dołączyłeś do gospodarstwa' : 'Zaproszenie odrzucone');
            await fetchData();
        } catch (e: any) {
            toastError(e?.response?.data?.error || 'Operacja nie powiodła się');
        } finally { setBusy(false); }
    };

    if (loading) return null;

    const household = data?.household;
    const isOwner = data?.role === 'OWNER';
    const pending = data?.pendingInvitations || [];

    return (
        <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                <Users size={20} className="text-primary" />
                Wspólny budżet (gospodarstwo domowe)
            </h3>
            <p className="text-sm text-gray-400 mb-6">
                Zaproś partnera lub rodzinę i wspólnie zarządzajcie kontami oznaczonymi jako wspólne.
                Konta prywatne pozostają widoczne tylko dla Ciebie.
            </p>

            {/* Oczekujące zaproszenia dla mnie */}
            {pending.length > 0 && (
                <div className="mb-6 space-y-2">
                    {pending.map(inv => (
                        <div key={inv.id} className="flex items-center justify-between gap-3 p-4 rounded-[5px] bg-primary/5 border border-primary/20">
                            <p className="text-sm text-gray-300">
                                <strong className="text-white">{inv.invitedBy.username}</strong> zaprasza Cię do
                                „<strong className="text-white">{inv.household.name}</strong>"
                            </p>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => handleRespond(inv.token, true)} disabled={busy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 border border-primary/30 text-primary rounded-[5px] hover:bg-primary/30 transition-colors text-sm font-medium disabled:opacity-50">
                                    <Check size={14} /> Dołącz
                                </button>
                                <button onClick={() => handleRespond(inv.token, false)} disabled={busy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 text-gray-400 rounded-[5px] hover:bg-white/10 transition-colors text-sm font-medium disabled:opacity-50">
                                    <X size={14} /> Odrzuć
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!household ? (
                /* Brak gospodarstwa — utwórz */
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="np. Nasz dom"
                        className="flex-1 bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-colors"
                    />
                    <button onClick={handleCreate} disabled={busy}
                        className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary/20 border border-primary/30 text-primary rounded-[5px] hover:bg-primary/30 transition-colors font-medium disabled:opacity-50 whitespace-nowrap">
                        <Users size={18} /> Utwórz gospodarstwo
                    </button>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Członkowie */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-white">{household.name}</h4>
                            <button onClick={() => setShowLeaveConfirm(true)} disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-[5px] hover:bg-rose-500/20 transition-colors text-sm font-medium disabled:opacity-50">
                                <LogOut size={14} /> {isOwner ? 'Usuń gospodarstwo' : 'Opuść'}
                            </button>
                        </div>
                        <div className="space-y-2">
                            {household.members.map(m => (
                                <div key={m.id} className="flex items-center justify-between p-3 rounded-[5px] bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-2 min-w-0">
                                        {m.role === 'OWNER' && <Crown size={14} className="text-amber-400 shrink-0" />}
                                        <span className="text-white font-medium truncate">{m.user.username}</span>
                                        <span className="text-gray-500 text-sm truncate">{m.user.email}</span>
                                    </div>
                                    {isOwner && m.role !== 'OWNER' && (
                                        <button onClick={() => handleRemove(m.id)} disabled={busy}
                                            className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors shrink-0" title="Usuń członka">
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Zaproszenia (tylko właściciel) */}
                    {isOwner && (
                        <div>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="email osoby do zaproszenia"
                                    className="flex-1 bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-colors"
                                />
                                <button onClick={handleInvite} disabled={busy}
                                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/5 border border-white/10 text-white rounded-[5px] hover:bg-white/10 transition-colors font-medium disabled:opacity-50 whitespace-nowrap">
                                    <UserPlus size={18} /> Zaproś
                                </button>
                            </div>
                            {household.invitations && household.invitations.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                    {household.invitations.map(inv => (
                                        <div key={inv.id} className="flex items-center gap-2 text-sm text-gray-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                            {inv.email}
                                            <span className="text-gray-600">— oczekuje</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={showLeaveConfirm}
                onClose={() => setShowLeaveConfirm(false)}
                onConfirm={handleLeave}
                variant="danger"
                title={isOwner ? 'Usuń gospodarstwo' : 'Opuść gospodarstwo'}
                message={isOwner
                    ? `Czy na pewno chcesz usunąć gospodarstwo „${household?.name}"? Tej operacji nie można cofnąć — konta przestaną być wspólne dla pozostałych członków.`
                    : `Czy na pewno chcesz opuścić gospodarstwo „${household?.name}"? Stracisz dostęp do wspólnych kont.`}
                confirmLabel={isOwner ? 'Usuń' : 'Opuść'}
            />
        </div>
    );
}
