import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Lock, ArrowRight, ArrowLeft, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react";
import api from '../lib/api';
import { motion, AnimatePresence } from "framer-motion";

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            navigate('/login');
        }
    }, [token, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password.length < 8) {
            setError('Hasło musi mieć co najmniej 8 znaków');
            return;
        }
        if (password !== passwordConfirm) {
            setError('Hasła nie są takie same');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/auth/reset-password', { token, password });
            setSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Nieprawidłowy lub wygasły link. Spróbuj zresetować hasło ponownie.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050507] font-sans px-4">
            <div className="w-full max-w-[420px]">
                {/* Logo */}
                <div className="text-center mb-10">
                    <Link to="/" className="text-white text-xl font-bold tracking-tight hover:opacity-80 transition-opacity">
                        SmartPortfel
                    </Link>
                </div>

                <AnimatePresence mode="wait">
                    {!success ? (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <div className="text-center mb-8">
                                <h1 className="text-3xl font-black tracking-tight mb-2 uppercase text-white">
                                    Nowe hasło
                                </h1>
                                <p className="text-white/40 text-sm font-medium">
                                    Ustaw nowe hasło do swojego konta.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                                        Nowe hasło
                                    </Label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-white/20 group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <Input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Minimum 8 znaków"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            className="h-14 bg-white/5 border-white/5 pl-12 pr-12 focus:border-primary/50 focus:bg-white/[0.08] text-white placeholder:text-white/10 rounded-[5px]"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="passwordConfirm" className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                                        Potwierdź hasło
                                    </Label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Lock className="h-5 w-5 text-white/20 group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <Input
                                            id="passwordConfirm"
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Powtórz nowe hasło"
                                            value={passwordConfirm}
                                            onChange={(e) => setPasswordConfirm(e.target.value)}
                                            required
                                            className="h-14 bg-white/5 border-white/5 pl-12 focus:border-primary/50 focus:bg-white/[0.08] text-white placeholder:text-white/10 rounded-[5px]"
                                        />
                                    </div>
                                </div>

                                <AnimatePresence>
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="p-3 text-sm font-bold text-red-200 bg-red-500/10 border border-red-500/20 rounded-[5px] flex items-center gap-2"
                                        >
                                            <AlertCircle size={16} className="shrink-0" />
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-white text-black h-14 rounded-[5px] font-black shadow-xl shadow-black/20 hover:bg-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? "Zapisywanie..." : "Ustaw nowe hasło"}
                                    {!isLoading && <ArrowRight size={16} />}
                                </button>
                            </form>

                            <div className="text-center mt-8">
                                <Link
                                    to="/login"
                                    className="flex items-center justify-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium hover:text-white/70 transition-colors"
                                >
                                    <ArrowLeft size={14} />
                                    Wróć do logowania
                                </Link>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center"
                        >
                            <div className="flex justify-center mb-6">
                                <CheckCircle className="w-16 h-16 text-[#1eb3ab]" />
                            </div>
                            <h1 className="text-2xl font-black tracking-tight mb-3 uppercase text-white">
                                Hasło zmienione!
                            </h1>
                            <p className="text-white/50 text-sm mb-8">
                                Twoje hasło zostało pomyślnie zmienione. Za chwilę zostaniesz przekierowany do logowania.
                            </p>
                            <Link
                                to="/login"
                                className="text-[11px] text-[#1eb3ab] uppercase tracking-wider font-bold hover:text-white transition-colors"
                            >
                                Zaloguj się teraz
                            </Link>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-12 text-center text-[10px] text-white/10 uppercase tracking-[0.2em] font-medium">
                    © 2026 SmartPortfel
                </div>
            </div>
        </div>
    );
}
