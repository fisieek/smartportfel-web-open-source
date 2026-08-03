import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    id: string;
    message: string;
    type?: ToastType;
    onClose: (id: string) => void;
    duration?: number;
}

export default function Toast({ id, message, type = 'success', onClose, duration = 5000 }: ToastProps) {
    const [isExiting, setIsExiting] = useState(false);

    // Deklaracja PRZED efektem, który z niej korzysta: `const` nie jest hoistowany,
    // więc czytany z efektu „z góry" zamrażał starą referencję.
    const handleClose = useCallback(() => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 300);
    }, [id, onClose]);

    useEffect(() => {
        const timer = setTimeout(() => {
            handleClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, handleClose]);

    const icons = {
        success: <CheckCircle2 className="text-white/60" size={20} />,
        error: <AlertCircle className="text-rose-500" size={20} />,
        info: <Info className="text-blue-400" size={20} />,
        warning: <AlertCircle className="text-amber-500" size={20} />
    };

    const styles = {
        success: 'border-white/10 bg-[#1c2a33]/90 shadow-black/20',
        error: 'border-rose-500/20 bg-[#1c2a33]/90 shadow-rose-500/10',
        info: 'border-blue-400/20 bg-[#1c2a33]/90 shadow-blue-400/10',
        warning: 'border-amber-500/20 bg-[#1c2a33]/90 shadow-amber-500/10'
    };

    return (
        <div
            className={cn(
                "flex items-center gap-4 px-4 py-3 rounded-2xl border backdrop-blur-md shadow-2xl min-w-[280px] sm:min-w-[320px] max-w-[calc(100vw_-_2rem)] sm:max-w-md transition-all duration-300",
                styles[type],
                isExiting ? "opacity-0 translate-y-2 scale-95" : "opacity-100 translate-y-0 scale-100 animate-in slide-in-from-top-4"
            )}
        >
            <div className="shrink-0">
                {icons[type]}
            </div>
            <div className="flex-1">
                <p className="text-sm font-medium text-white">{message}</p>
            </div>
            <button
                onClick={handleClose}
                className="shrink-0 p-1 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
                <X size={16} />
            </button>
            <div
                className={cn(
                    "absolute bottom-0 left-0 h-1 bg-current opacity-20 transition-all ease-linear",
                    type === 'success' && 'text-white/40',
                    type === 'error' && 'text-rose-500',
                    type === 'info' && 'text-blue-400',
                    type === 'warning' && 'text-amber-500'
                )}
                style={{
                    width: '100%',
                    animation: `toast-progress ${duration}ms linear forwards`
                }}
            />
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes toast-progress {
                    from { width: 100%; }
                    to { width: 0%; }
                }
            `}} />
        </div>
    );
}
