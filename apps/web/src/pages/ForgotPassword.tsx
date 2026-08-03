import { useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Mail, ArrowRight, ArrowLeft, CheckCircle } from "lucide-react";
import api from '../lib/api';
import { motion, AnimatePresence } from "framer-motion";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            await api.post('/auth/forgot-password', { email });
            setSubmitted(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Wystąpił błąd. Spróbuj ponownie.');
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
                    {!submitted ? (
                        <motion.div
                            key="form"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                        >
                            <div className="text-center mb-8">
                                <h1 className="text-3xl font-black tracking-tight mb-2 uppercase text-white">
                                    Odzyskaj hasło
                                </h1>
                                <p className="text-white/40 text-sm font-medium">
                                    Podaj adres e-mail, a wyślemy Ci link do resetu hasła.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                                        Adres e-mail
                                    </Label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                            <Mail className="h-5 w-5 text-white/20 group-focus-within:text-primary transition-colors" />
                                        </div>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="nazwa@email.pl"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
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
                                            className="p-3 text-sm font-bold text-red-200 bg-red-500/10 border border-red-500/20 rounded-[5px] text-center"
                                        >
                                            {error}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <button
                                    type="submit"
                                    disabled={isLoading}
                                    className="w-full bg-white text-black h-14 rounded-[5px] font-black shadow-xl shadow-black/20 hover:bg-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 mt-4 uppercase tracking-[0.2em] text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? "Wysyłanie..." : "Wyślij link resetu"}
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
                                Sprawdź skrzynkę
                            </h1>
                            <p className="text-white/50 text-sm mb-2">
                                Jeśli konto z adresem <span className="text-white font-semibold">{email}</span> istnieje, wyślemy wiadomość z linkiem do resetu hasła.
                            </p>
                            <p className="text-white/30 text-xs mb-8">
                                Link jest ważny przez 1 godzinę.
                            </p>
                            <Link
                                to="/login"
                                className="flex items-center justify-center gap-2 text-[11px] text-white/40 uppercase tracking-wider font-medium hover:text-white/70 transition-colors"
                            >
                                <ArrowLeft size={14} />
                                Wróć do logowania
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
