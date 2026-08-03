type ToastType = 'success' | 'error' | 'info' | 'warning';


export const emitToast = (message: string, type: ToastType = 'error') => {
    window.dispatchEvent(new CustomEvent('app:toast', {
        detail: { message, type }
    }));
};
