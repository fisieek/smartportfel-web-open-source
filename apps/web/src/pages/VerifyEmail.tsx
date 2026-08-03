import { useEffect, useState, useRef } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../lib/api';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const navigate = useNavigate();
    const verificationStarted = useRef(false);

    useEffect(() => {
        if (verificationStarted.current) return;
        verificationStarted.current = true;

        const verifyToken = async () => {
            if (!token) {
                setStatus('error');
                setMessage('Brak tokenu weryfikacyjnego.');
                return;
            }

            try {
                const response = await api.get(`/auth/verify/${token}`);
                setStatus('success');
                setMessage(response.data.message);

                // Optional: Redirect after success
                setTimeout(() => {
                    navigate('/login');
                }, 5000);
            } catch (err: any) {
                console.error('Verification error', err);
                setStatus('error');
                setMessage(err.response?.data?.message || 'Wystąpił błąd podczas weryfikacji.');
            }
        };

        verifyToken();
    }, [token, navigate]);

    return (
        <div className="min-h-screen bg-[#050507] flex items-center justify-center p-8 font-sans text-white">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-[460px] bg-white/[0.02] border border-white/5 p-12 rounded-2xl text-center"
            >
                <div className="flex justify-center mb-8">
                    {status === 'loading' && (
                        <div className="bg-primary/10 p-5 rounded-full">
                            <Loader2 className="size-10 text-primary animate-spin" />
                        </div>
                    )}
                    {status === 'success' && (
                        <div className="bg-emerald-500/10 p-5 rounded-full">
                            <CheckCircle2 className="size-10 text-emerald-400" />
                        </div>
                    )}
                    {status === 'error' && (
                        <div className="bg-rose-500/10 p-5 rounded-full">
                            <XCircle className="size-10 text-rose-400" />
                        </div>
                    )}
                </div>

                <h1 className="text-3xl font-black uppercase tracking-tight mb-4">
                    {status === 'loading' ? 'Weryfikacja...' :
                        status === 'success' ? 'Adres zweryfikowany!' :
                            'Błąd weryfikacji'}
                </h1>

                <p className="text-white/40 text-sm font-medium mb-10">
                    {message || 'Zaraz sprawdzimy autentyczność Twojego adresu e-mail.'}
                </p>

                {status === 'success' && (
                    <div className="space-y-4">
                        <Link
                            to="/login"
                            className="w-full bg-white text-black h-14 rounded-[5px] font-black shadow-xl shadow-black/20 hover:bg-gray-200 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-xs"
                        >
                            Zaloguj się teraz <ArrowRight size={16} />
                        </Link>
                        <p className="text-[10px] text-white/20 uppercase tracking-widest font-bold">
                            Zostaniesz przekierowany za kilka sekund...
                        </p>
                    </div>
                )}

                {status === 'error' && (
                    <Link
                        to="/register"
                        className="w-full bg-white/5 border border-white/5 text-white h-14 rounded-[5px] font-black hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-xs"
                    >
                        Spróbuj ponownie się zarejestrować
                    </Link>
                )}

                <div className="mt-12 text-[10px] text-white/10 uppercase tracking-[0.2em] font-medium text-center">
                    © 2026 SmartPortfel
                </div>
            </motion.div>
        </div>
    );
}
