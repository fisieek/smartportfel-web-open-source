import { useState } from 'react';
import { User, Mail, Lock, Save, CheckCircle, AlertCircle, Tag, ChevronRight, HelpCircle, Github, Download, Trash2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FeedbackModal from '../components/FeedbackModal';
import HouseholdSettings from '../components/HouseholdSettings';
import MCPSettings from '../components/MCPSettings';
import AiKeySettings from '../components/AiKeySettings';
import { GITHUB_REPO_URL } from '../lib/constants';
import api from '../lib/api';

interface User {
    username: string;
    email: string;
}

export default function Settings() {
    const storedUser = localStorage.getItem('user');
    const initialUser = storedUser ? JSON.parse(storedUser) : { username: '', email: '' };

    const [username, setUsername] = useState(initialUser.username);
    const [email, setEmail] = useState(initialUser.email);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState<'success' | 'error'>('success');
    const [saving, setSaving] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmValue, setDeleteConfirmValue] = useState('');
    const [deleting, setDeleting] = useState(false);
    const navigate = useNavigate();

    const showMessage = (text: string, type: 'success' | 'error') => {
        setMessage(text);
        setMessageType(type);
        setTimeout(() => setMessage(''), 4000);
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const response = await api.put('/auth/profile', { username, email });
            localStorage.setItem('user', JSON.stringify(response.data.user));
            showMessage('Profil zaktualizowany!', 'success');
        } catch (error: any) {
            showMessage(error.response?.data?.message || 'Błąd aktualizacji profilu', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            showMessage('Hasła nie są takie same', 'error');
            return;
        }
        if (newPassword.length < 8) {
            showMessage('Hasło musi mieć min. 8 znaków', 'error');
            return;
        }

        setSaving(true);
        try {
            const response = await api.put('/auth/password', { currentPassword, newPassword });
            // Serwer unieważnia wszystkie sesje i zwraca świeży token dla TEGO urządzenia —
            // bez podmiany kolejne żądanie dostałoby 403 i wylogowało użytkownika.
            if (response.data?.token) {
                localStorage.setItem('token', response.data.token);
            }
            showMessage('Hasło zostało zmienione! Wylogowaliśmy pozostałe urządzenia.', 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            showMessage(error.response?.data?.message || 'Błąd zmiany hasła', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleExportData = async () => {
        setExporting(true);
        try {
            const response = await api.get('/auth/data-export', { responseType: 'blob' });
            const url = window.URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'smartportfel-export.json';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showMessage('Eksport danych pobrany!', 'success');
        } catch (error: any) {
            showMessage(error.response?.data?.message || 'Błąd eksportu danych', 'error');
        } finally {
            setExporting(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!deleteConfirmValue) {
            showMessage('Potwierdź usunięcie hasłem lub adresem e-mail', 'error');
            return;
        }
        setDeleting(true);
        try {
            // Backend wymaga hasła dla kont hasłowych, a e-maila dla kont bez hasła —
            // wysyłamy wpisaną wartość jako oba pola, serwer sam wybiera właściwą weryfikację
            await api.delete('/auth/account', {
                data: { password: deleteConfirmValue, confirmEmail: deleteConfirmValue }
            });
            localStorage.clear();
            window.location.href = '/';
        } catch (error: any) {
            showMessage(error.response?.data?.message || 'Błąd usuwania konta', 'error');
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {message && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-[5px] ${messageType === 'success'
                    ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                    : 'bg-rose-500/20 border border-rose-500/30 text-rose-400'
                    }`}>
                    {messageType === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Rząd 1: Profil i Hasło */}
                {/* Profil */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none"></div>
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2 relative z-10">
                        <User size={20} className="text-primary" />
                        Profil
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Nazwa użytkownika</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-site border border-white/10 rounded-[5px] px-5 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                                <Mail size={16} /> Adres e-mail
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-site border border-white/10 rounded-[5px] px-5 py-3 text-white focus:outline-none focus:border-primary/50 transition-colors"
                            />
                        </div>
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-[5px] hover:bg-white/10 transition-colors disabled:opacity-50 font-medium"
                        >
                            <Save size={18} />
                            {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
                        </button>
                    </div>
                </div>

                {/* Hasło */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden h-full">
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                        <Lock size={20} className="text-primary" />
                        Hasło
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Obecne hasło</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-colors"
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Nowe hasło</label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-2">Powtórz nowe hasło</label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-primary/50 transition-colors"
                                />
                            </div>
                        </div>
                        <button
                            onClick={handleChangePassword}
                            disabled={saving}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-[5px] hover:bg-white/10 transition-colors disabled:opacity-50 font-medium"
                        >
                            <Lock size={18} />
                            {saving ? 'Zapisywanie...' : 'Zmień hasło'}
                        </button>
                    </div>
                </div>

                {/* Rząd 2: Open source i Inne */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden h-fit">
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-secondary/10 rounded-full blur-3xl pointer-events-none"></div>
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2 relative z-10">
                        <Github size={20} className="text-secondary" />
                        Open source
                    </h3>
                    <div className="space-y-4 relative z-10">
                        <p className="text-sm text-gray-400 leading-relaxed">
                            SmartPortfel jest w całości darmowy, a jego kod otwarty. Wszystkie moduły —
                            inwestycje, PPK, kredyty, łączniki MCP — są dostępne dla każdego, bez limitów
                            i bez wersji płatnej.
                        </p>
                        <p className="text-sm text-gray-400 leading-relaxed">
                            Aplikacja do finansów osobistych zna Twoje najbardziej wrażliwe dane. Otwarty kod
                            znaczy, że nie musisz wierzyć na słowo — możesz sprawdzić, co się z nimi dzieje,
                            albo postawić własną instancję.
                        </p>
                        <a
                            href={GITHUB_REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white font-medium rounded-[5px] hover:bg-white/10 transition-colors text-sm"
                        >
                            <Github size={16} />
                            Zobacz kod na GitHubie
                        </a>
                    </div>
                </div>

                <AiKeySettings />

                <div className="space-y-8">
                    {/* Kategorie i Sklepy */}
                    <div className="bg-surface border border-white/5 rounded-[5px] p-6 shadow-card relative overflow-hidden group cursor-pointer h-fit" onClick={() => navigate('/dashboard/settings/categories')}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none group-hover:bg-primary/10 transition-all"></div>
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-primary/10 rounded-[5px] flex items-center justify-center text-primary border border-primary/20">
                                    <Tag size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Kategorie i Sklepy</h3>
                                    <p className="text-sm text-gray-400">Zarządzaj własnymi regułami</p>
                                </div>
                            </div>
                            <ChevronRight size={24} className="text-gray-500 group-hover:text-white transition-colors" />
                        </div>
                    </div>

                    {/* Pomoc */}
                    <div className="bg-surface border border-white/5 rounded-[5px] p-6 shadow-card relative overflow-hidden group cursor-pointer h-fit" onClick={() => setIsFeedbackModalOpen(true)}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-16 -mt-16 pointer-events-none group-hover:bg-emerald-500/10 transition-all"></div>
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 bg-emerald-500/10 rounded-[5px] flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                                    <HelpCircle size={24} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Pomoc</h3>
                                    <p className="text-sm text-gray-400">Masz pytania? Chętnie pomożemy!</p>
                                </div>
                            </div>
                            <ChevronRight size={24} className="text-gray-500 group-hover:text-white transition-colors" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Wspólny budżet (gospodarstwo domowe) */}
            <HouseholdSettings />

            {/* SmartPortfel MCP (Claude / Perplexity) */}
            <MCPSettings />

            {/* Prywatność i dane (RODO) */}
            <div className="bg-surface border border-white/5 rounded-[5px] p-8 shadow-card relative overflow-hidden">
                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                    <ShieldCheck size={20} className="text-primary" />
                    Prywatność i dane
                </h3>
                <p className="text-sm text-gray-400 mb-6">
                    Zgodnie z RODO masz prawo do kopii swoich danych oraz do ich trwałego usunięcia.
                    Szczegóły znajdziesz w <a href="/polityka-prywatnosci" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">polityce prywatności</a>.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 rounded-[5px] bg-white/5 border border-white/5 flex flex-col gap-3">
                        <h4 className="font-semibold text-white">Eksport danych</h4>
                        <p className="text-sm text-gray-400 flex-1">
                            Pobierz wszystkie swoje dane (konta, transakcje, cele, inwestycje) jako plik JSON.
                        </p>
                        <button
                            onClick={handleExportData}
                            disabled={exporting}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white rounded-[5px] hover:bg-white/10 transition-colors disabled:opacity-50 font-medium w-fit"
                        >
                            <Download size={18} />
                            {exporting ? 'Przygotowuję...' : 'Pobierz moje dane'}
                        </button>
                    </div>
                    <div className="p-4 rounded-[5px] bg-rose-500/5 border border-rose-500/20 flex flex-col gap-3">
                        <h4 className="font-semibold text-rose-400">Usunięcie konta</h4>
                        {!showDeleteConfirm ? (
                            <>
                                <p className="text-sm text-gray-400 flex-1">
                                    Trwale usuwa konto i wszystkie dane. Aktywna subskrypcja zostanie anulowana.
                                    Tej operacji nie można cofnąć.
                                </p>
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-[5px] hover:bg-rose-500/20 transition-colors font-medium w-fit"
                                >
                                    <Trash2 size={18} />
                                    Usuń konto
                                </button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-gray-400">
                                    Potwierdź <strong>hasłem</strong> (jeśli Twoje konto nie ma hasła — wpisz swój <strong>adres e-mail</strong>):
                                </p>
                                <input
                                    type="password"
                                    value={deleteConfirmValue}
                                    onChange={(e) => setDeleteConfirmValue(e.target.value)}
                                    placeholder="Hasło lub adres e-mail"
                                    className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-2.5 text-white focus:outline-none focus:border-rose-500/50 transition-colors"
                                />
                                <div className="flex gap-3">
                                    <button
                                        onClick={handleDeleteAccount}
                                        disabled={deleting}
                                        className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-[5px] hover:bg-rose-600 transition-colors disabled:opacity-50 font-medium"
                                    >
                                        <Trash2 size={18} />
                                        {deleting ? 'Usuwanie...' : 'Usuń trwale'}
                                    </button>
                                    <button
                                        onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmValue(''); }}
                                        disabled={deleting}
                                        className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-[5px] hover:bg-white/10 transition-colors font-medium"
                                    >
                                        Anuluj
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
            />
        </div>
    );
}
