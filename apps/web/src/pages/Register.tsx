"use client";

import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Lock, Eye, EyeOff, ArrowRight, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../lib/api';
import { AuthLayout } from '../layouts/AuthLayout';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

const INPUT_CLASS = 'h-11 rounded-[10px] border-white/[0.08] bg-white/[0.04] pl-12 text-[#f5f5f7] placeholder:text-white/25 focus:border-emerald-400/50 focus:bg-white/[0.06]';
const LABEL_CLASS = 'ml-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(245,245,247,0.38)]';

// Wyciąga czytelny komunikat z odpowiedzi /auth/register.
// Backend przy 400 zwraca { message, errors: { formErrors, fieldErrors } } (zod.flatten()).
function extractRegisterError(err: any): string {
    const data = err?.response?.data;
    const fieldErrors = data?.errors?.fieldErrors as Record<string, string[]> | undefined;
    if (fieldErrors) {
        const messages = Object.values(fieldErrors).flat().filter(Boolean);
        if (messages.length > 0) return messages.join('. ');
    }
    return data?.message || 'Błąd rejestracji';
}

export default function Register() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    // Parametr `?plan=` z dawnego cennika jest ignorowany — produkt jest darmowy i ma
    // jedną wersję. Stare linki i zakładki nadal otwierają działający formularz.

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [invitationToken, setInvitationToken] = useState<string | null>(null);
    const [invitationLocked, setInvitationLocked] = useState(false);
    const [invitationHousehold, setInvitationHousehold] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate('/dashboard');
        }

        // Rejestracja z zaproszenia do gospodarstwa: /register?invitation=<token>
        const inviteParam = searchParams.get('invitation');
        if (inviteParam) {
            setInvitationToken(inviteParam);
            api.get(`/household/invitation/${encodeURIComponent(inviteParam)}`)
                .then(res => {
                    const data = res.data;
                    if (data?.valid && data.email) {
                        setEmail(data.email);
                        setInvitationLocked(true);
                        setInvitationHousehold(data.householdName || null);
                    }
                })
                .catch(() => { /* nieprawidłowy token — zwykła rejestracja */ });
        }
    }, [navigate, searchParams]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Hasła nie są identyczne');
            return;
        }

        if (!acceptedTerms) {
            setError('Musisz zaakceptować Regulamin i Politykę Prywatności');
            return;
        }

        setIsLoading(true);

        try {
            await api.post('/auth/register', { name: username, email, password });
            setIsRegistered(true);
        } catch (err: any) {
            console.error('Registration error', err);
            setError(extractRegisterError(err));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthLayout wide>
            <AnimatePresence mode="wait">
                {isRegistered ? (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mx-auto max-w-[400px] py-4 text-center"
                    >
                        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/10">
                            <Mail className="size-8 text-emerald-400" />
                        </div>
                        <h1 className="auth-display mb-3 text-[26px] font-medium text-white">Sprawdź e-mail!</h1>
                        <p className="mb-8 text-[13px] text-[rgba(245,245,247,0.55)]">
                            Wysłaliśmy link weryfikacyjny na adres:<br />
                            <span className="font-medium text-white">{email}</span>
                        </p>
                        <div className="space-y-6">
                            <Link
                                to={invitationToken
                                    ? `/login?redirect=${encodeURIComponent(`/zaproszenie?token=${invitationToken}`)}`
                                    : '/login'}
                                className="auth-btn-primary h-11 w-full text-sm"
                            >
                                Przejdź do logowania <ArrowRight size={16} />
                            </Link>
                            <p className="text-[12px] text-white/35">
                                Możesz zamknąć to okno po potwierdzeniu maila.
                            </p>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="step2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="mx-auto max-w-[420px]"
                    >
                        <div className="mb-5 text-center">
                            <h1 className="auth-display text-[26px] font-medium text-white">Utwórz konto</h1>
                            <p className="mt-1 text-[13px] text-[rgba(245,245,247,0.55)]">
                                Darmowe, na zawsze. Bez karty.
                            </p>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="mb-6 rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-center text-sm font-medium text-red-200"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {invitationLocked && (
                            <div className="mb-6 rounded-[10px] border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
                                Zakładasz konto, aby dołączyć do wspólnego budżetu{invitationHousehold ? <> „<strong>{invitationHousehold}</strong>"</> : ''}. Adres e-mail jest powiązany z zaproszeniem i nie można go zmienić.
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div className="space-y-2.5">
                                <div className="space-y-1">
                                    <Label htmlFor="username" className={LABEL_CLASS}>Nazwa użytkownika</Label>
                                    <div className="group relative">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                            <User className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                                        </div>
                                        <Input
                                            id="username"
                                            type="text"
                                            required
                                            className={INPUT_CLASS}
                                            placeholder="Wpisz nazwę użytkownika"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="email" className={LABEL_CLASS}>Email</Label>
                                    <div className="group relative">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                            <Mail className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                                        </div>
                                        <Input
                                            id="email"
                                            type="email"
                                            required
                                            readOnly={invitationLocked}
                                            className={`${INPUT_CLASS} ${invitationLocked ? 'cursor-not-allowed opacity-70' : ''}`}
                                            placeholder="Wpisz swój email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="password" className={LABEL_CLASS}>Hasło</Label>
                                    <div className="group relative">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                            <Lock className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                                        </div>
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            required
                                            className={`${INPUT_CLASS} pr-12`}
                                            placeholder="Wybierz hasło"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white"
                                        >
                                            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <Label htmlFor="confirmPassword" className={LABEL_CLASS}>Powtórz hasło</Label>
                                    <div className="group relative">
                                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                            <Lock className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                                        </div>
                                        <Input
                                            id="confirmPassword"
                                            type={showPassword ? "text" : "password"}
                                            required
                                            className={`${INPUT_CLASS} pr-12`}
                                            placeholder="Powtórz hasło"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 pt-1">
                                <div className="flex h-5 items-center">
                                    <input
                                        id="terms"
                                        name="terms"
                                        type="checkbox"
                                        required
                                        checked={acceptedTerms}
                                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                                        className="h-4 w-4 rounded border-white/10 bg-white/5 text-emerald-400 focus:ring-emerald-400/50 focus:ring-offset-[#050507]"
                                    />
                                </div>
                                <div className="text-[12px] leading-snug">
                                    <Label htmlFor="terms" className="font-normal text-white/60">
                                        Rejestrując się akceptuję warunki{' '}
                                        <Link to="/regulamin" target="_blank" className="text-white transition-colors hover:text-emerald-300 hover:underline">
                                            Regulaminu
                                        </Link>
                                        {' '}oraz{' '}
                                        <Link to="/polityka-prywatnosci" target="_blank" className="text-white transition-colors hover:text-emerald-300 hover:underline">
                                            Politykę Prywatności
                                        </Link>.
                                    </Label>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="auth-btn-primary mt-3 h-11 w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isLoading ? "Rejestracja..." : "Utwórz konto"}
                                {!isLoading && <ArrowRight size={16} />}
                            </button>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mt-4 text-center">
                <p className="text-[13px] text-[rgba(245,245,247,0.55)]">
                    Masz już konto?{' '}
                    <Link to="/login" className="font-medium text-white transition-colors hover:text-emerald-300">Zaloguj się</Link>
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/15">© 2026 SmartPortfel</p>
            </div>

        </AuthLayout>
    );
}
