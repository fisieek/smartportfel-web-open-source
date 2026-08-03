import axios from 'axios';
import { emitToast } from './events';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:3000/api'),
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor to attach the token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Add a response interceptor to handle errors globally
api.interceptors.response.use(
    (response) => response,
    (error) => {
        let message = error.response?.data?.error || error.response?.data?.message || 'Wystąpił nieoczekiwany błąd';
        const status = error.response?.status;

        // Ensure message is a string to avoid React error #31 (trying to render objects)
        if (typeof message !== 'string') {
            message = JSON.stringify(message);
        }

        // Don't show toast for 401 as it's usually handled by auth logic (redirect to login)
        if (status === 401) {
            localStorage.removeItem('token');
        } else if (status !== 404) {
            // 403 pokazujemy — po usunięciu gatingu PRO zostały tylko realne odmowy
            // (własność w gospodarstwie domowym, scope tokenu MCP), o których user musi wiedzieć.
            emitToast(message, 'error');
        }

        return Promise.reject(error);
    }
);

export default api;
