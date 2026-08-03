import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast from '../components/ui/Toast';
import type { ToastType } from '../components/ui/Toast';

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
    warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastItem {
    id: string;
    message: string;
    type: ToastType;
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    // Bufor ostatnio pokazanych toastów (message+type) do deduplikacji.
    const recentRef = useRef<Map<string, number>>(new Map());
    const DEDUPE_WINDOW_MS = 4000;

    const showToast = useCallback((message: string, type: ToastType = 'success') => {
        // Pomiń identyczny komunikat pokazany w ostatnich kilku sekundach
        // (zapobiega dublom z Promise.all i podwójnym renderom w React StrictMode).
        const key = `${type}:${message}`;
        const now = Date.now();
        const last = recentRef.current.get(key);
        if (last && now - last < DEDUPE_WINDOW_MS) return;
        recentRef.current.set(key, now);

        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
    }, []);

    const success = useCallback((message: string) => showToast(message, 'success'), [showToast]);
    const error = useCallback((message: string) => showToast(message, 'error'), [showToast]);
    const info = useCallback((message: string) => showToast(message, 'info'), [showToast]);
    const warning = useCallback((message: string) => showToast(message, 'warning'), [showToast]);

    useEffect(() => {
        const handleEvent = (e: Event) => {
            const customEvent = e as CustomEvent<{ message: string; type: ToastType }>;
            if (customEvent.detail) {
                showToast(customEvent.detail.message, customEvent.detail.type);
            }
        };

        window.addEventListener('app:toast', handleEvent);
        return () => window.removeEventListener('app:toast', handleEvent);
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
            {children}
            {createPortal(
                <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-auto sm:top-6 sm:right-6 z-[99999] flex flex-col-reverse sm:flex-col gap-3 pointer-events-none items-center sm:items-end">
                    {toasts.map((toast) => (
                        <div key={toast.id} className="pointer-events-auto">
                            <Toast
                                id={toast.id}
                                message={toast.message}
                                type={toast.type}
                                onClose={removeToast}
                            />
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
