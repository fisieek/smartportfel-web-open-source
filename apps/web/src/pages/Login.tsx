"use client";

import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Eye, EyeOff, User, Lock, ArrowRight } from "lucide-react";
import api from '../lib/api';
import { motion, AnimatePresence } from "framer-motion";
import { AuthLayout } from "../layouts/AuthLayout";

export default function Login() {
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Cel po zalogowaniu — tylko ścieżki wewnętrzne (ochrona przed open redirect).
    const redirectParam = searchParams.get('redirect');
    const safeRedirect = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
        ? redirectParam
        : '/dashboard';

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate(safeRedirect);
        }
    }, [navigate, safeRedirect]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await api.post('/auth/login', { email, password });

            localStorage.setItem('token', response.data.token);
            localStorage.setItem('user', JSON.stringify(response.data.user));

            navigate(safeRedirect);
        } catch (err: any) {
            console.error('Login error', err);
            if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
                setError('Twoje konto nie zostało jeszcze zweryfikowane. Sprawdź swoją skrzynkę e-mail.');
            } else {
                setError(err.response?.data?.message || 'Nieprawidłowy e-mail lub hasło. Spróbuj ponownie.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const inputClass = "h-11 rounded-[10px] border-white/[0.08] bg-white/[0.04] pl-12 text-[#f5f5f7] placeholder:text-white/25 focus:border-emerald-400/50 focus:bg-white/[0.06]";
    const labelClass = "ml-1 text-[10px] font-medium uppercase tracking-[0.14em] text-[rgba(245,245,247,0.38)]";

    return (
        <AuthLayout art="deck">
            {/* Nagłówek */}
            <div className="mb-6 text-center">
                <h1 className="auth-display mb-1.5 text-[28px] font-medium text-white">Witaj ponownie</h1>
                <p className="text-[13px] text-[rgba(245,245,247,0.55)]">Zaloguj się, aby zarządzać finansami.</p>
            </div>

            {/* Formularz */}
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="email" className={labelClass}>Email / Login</Label>
                    <div className="group relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <User className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                        </div>
                        <Input
                            id="email"
                            type="text"
                            placeholder="nazwa@email.pl"
                            value={email}
                            autoComplete="off"
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className={inputClass}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label htmlFor="password" className={labelClass}>Hasło</Label>
                    <div className="group relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                            <Lock className="h-5 w-5 text-white/25 transition-colors group-focus-within:text-emerald-400" />
                        </div>
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className={`${inputClass} pr-12`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white"
                        >
                            {showPassword ? (
                                <EyeOff className="size-5" />
                            ) : (
                                <Eye className="size-5" />
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/25">
                        Sesja ważna 30 dni
                    </span>
                    <Link
                        to="/forgot-password"
                        className="text-xs font-medium text-white/60 transition-colors hover:text-white"
                    >
                        Zapomniałeś hasła?
                    </Link>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="rounded-[10px] border border-red-500/20 bg-red-500/10 p-3 text-center text-sm font-medium text-red-200"
                        >
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="auth-btn-primary mt-5 h-11 w-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isLoading ? "Logowanie..." : "Zaloguj się"}
                    {!isLoading && <ArrowRight size={16} />}
                </button>
            </form>

            {/* Rejestracja */}
            <div className="mt-4 text-center">
                <p className="text-[13px] text-[rgba(245,245,247,0.55)]">
                    Nie masz konta?{" "}
                    <Link to="/register" className="font-medium text-white transition-colors hover:text-emerald-300">
                        Zarejestruj się
                    </Link>
                </p>
                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-white/15">© 2026 SmartPortfel</p>
            </div>

        </AuthLayout>
    );
}
