import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050507] font-sans px-4">
            <div className="text-center max-w-lg">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {/* 404 number */}
                    <div className="relative mb-6 select-none">
                        <span
                            className="text-[160px] font-black leading-none text-white/[0.03] block"
                            aria-hidden="true"
                        >
                            404
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white/10 tracking-tighter">
                            404
                        </span>
                    </div>

                    <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-3">
                        Strona nie istnieje
                    </h1>
                    <p className="text-white/30 text-sm mb-10 leading-relaxed">
                        Strona, której szukasz, mogła zostać przeniesiona,<br />
                        usunięta lub adres URL jest nieprawidłowy.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <Link
                            to="/"
                            className="flex items-center justify-center gap-2 bg-white text-black px-6 py-3 rounded-[5px] font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all active:scale-95"
                        >
                            <Home size={15} />
                            Strona główna
                        </Link>
                        <button
                            onClick={() => window.history.back()}
                            className="flex items-center justify-center gap-2 bg-white/5 text-white/60 border border-white/10 px-6 py-3 rounded-[5px] font-black text-xs uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all active:scale-95"
                        >
                            <ArrowLeft size={15} />
                            Wróć
                        </button>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
