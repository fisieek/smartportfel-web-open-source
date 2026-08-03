import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MessageSquare, Loader2 } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import api from '../lib/api';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const { success, error } = useToast();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim()) return;

        setIsSending(true);
        try {
            await api.post('/system/feedback', { message });

            success('Wiadomość została wysłana. Dziękujemy za feedback!');
            setMessage('');
            onClose();
        } catch {
            error('Wystąpił błąd podczas wysyłania. Spróbuj ponownie później.');
        } finally {
            setIsSending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-[#0B0B0F] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden relative z-[160] shadow-2xl"
                    >
                        <div className="p-6 space-y-6">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                                        <MessageSquare className="w-5 h-5 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-white tracking-tight">Pomoc i Feedback</h2>
                                        <p className="text-xs text-gray-500">Daj nam znać, co możemy ulepszyć</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <p className="text-sm text-gray-400 leading-relaxed">
                                        Potrzebujesz pomocy? Widzisz błąd w systemie? Opisz poniżej swój problem, postaramy się pomóc jak najszybciej.
                                    </p>
                                    <textarea
                                        autoFocus
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder="Twoja wiadomość..."
                                        className="w-full h-32 bg-white/5 border border-white/10 rounded-xl p-4 text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors resize-none text-sm"
                                        disabled={isSending}
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSending || !message.trim()}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                                >
                                    {isSending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Wysyłanie...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4" />
                                            Wyślij zgłoszenie
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
