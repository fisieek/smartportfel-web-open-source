import { AlertCircle, Check, X, AlertTriangle, Info } from 'lucide-react';
import Modal from './Modal';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'primary' | 'warning' | 'info';
}

export default function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = 'Potwierdź',
    cancelLabel = 'Anuluj',
    variant = 'primary'
}: ConfirmModalProps) {
    const getVariantStyles = () => {
        switch (variant) {
            case 'danger':
                return {
                    iconBg: 'bg-rose-500/10 text-rose-500 shadow-rose-500/5',
                    buttonBg: 'bg-rose-500 text-white shadow-rose-500/20',
                    icon: <AlertCircle size={32} />
                };
            case 'warning':
                return {
                    iconBg: 'bg-amber-500/10 text-amber-500 shadow-amber-500/5',
                    buttonBg: 'bg-amber-500 text-black shadow-amber-500/20',
                    icon: <AlertTriangle size={32} />
                };
            case 'info':
                return {
                    iconBg: 'bg-blue-500/10 text-blue-500 shadow-blue-500/5',
                    buttonBg: 'bg-blue-500 text-white shadow-blue-500/20',
                    icon: <Info size={32} />
                };
            default:
                return {
                    iconBg: 'bg-primary/10 text-primary shadow-primary/5',
                    buttonBg: 'bg-primary text-white shadow-primary/20',
                    icon: <Check size={32} />
                };
        }
    };

    const styles = getVariantStyles();

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            maxWidth="max-w-md"
        >
            <div className="space-y-6 h-full flex flex-col">
                <div className="flex flex-col items-center text-center space-y-4 py-4">
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${styles.iconBg}`}>
                        {styles.icon}
                    </div>
                    <p className="text-gray-300 text-base leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="flex justify-end gap-2 mt-auto pt-4">
                    <button
                        onClick={onClose}
                        className="h-9 px-4 text-gray-500 font-bold uppercase tracking-widest text-[10px] hover:text-white transition-all rounded-[5px] hover:bg-white/5"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`h-9 px-6 flex items-center gap-2 font-black uppercase tracking-widest text-[10px] rounded-[5px] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg ${styles.buttonBg}`}
                    >
                        <span>{confirmLabel}</span>
                        {variant === 'danger' ? <X size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
