import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    maxWidth?: string;
    variant?: 'default' | 'dark' | 'clean';
    showHeader?: boolean;
    headerActions?: ReactNode;
    footer?: ReactNode;
}

export default function Modal({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    maxWidth = 'max-w-lg',
    variant = 'dark',
    showHeader = true,
    headerActions,
    footer
}: ModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleEsc);
        } else {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleEsc);
        }

        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleEsc);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm px-0 md:px-6"
            onClick={onClose}
        >
            <div
                className={`${variant === 'dark' ? 'bg-[#0a0a0a] border-t md:border border-white/5 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)]' : variant === 'clean' ? 'bg-[#0a0a0a] border-t md:border border-white/5' : 'bg-white'} w-full ${maxWidth} shadow-2xl animate-in fade-in slide-in-from-bottom-10 md:slide-in-from-bottom-0 md:zoom-in-95 duration-200 h-auto max-h-[92vh] md:max-h-[90vh] rounded-t-[20px] md:rounded-[5px] flex flex-col overflow-hidden pb-safe`}
                onClick={(e) => e.stopPropagation()}
            >
                {showHeader && (
                    <div className={`flex items-center justify-between px-4 py-2 md:px-5 md:py-2 ${variant === 'dark' || variant === 'clean' ? 'border-b border-white/5' : 'border-b border-gray-100'} shrink-0`}>
                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <h2 className={`text-lg font-black tracking-tight truncate ${variant === 'dark' || variant === 'clean' ? 'text-white' : 'text-[#162129]'}`}>{title}</h2>
                            {subtitle && <p className={`text-[10px] md:text-sm truncate ${variant === 'dark' || variant === 'clean' ? 'text-white/40' : 'text-gray-500'} font-medium`}>{subtitle}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                            {headerActions}
                            <button
                                onClick={onClose}
                                className={`p-2 rounded-[5px] transition-all ${variant === 'dark' || variant === 'clean' ? 'text-white/20 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                )}
                <div className={`${variant === 'clean' ? 'p-0' : 'p-4 md:p-6'} overflow-y-auto custom-scrollbar flex-1 relative`}>
                    {children}
                </div>
                {footer && (
                    <div className={`px-4 py-4 md:px-6 md:py-6 shrink-0 ${variant === 'dark' || variant === 'clean' ? 'border-t border-white/5' : 'border-t border-gray-100'}`}>
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
