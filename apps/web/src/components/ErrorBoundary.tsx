import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Granica błędu Reacta: łapie wyjątek z renderu poddrzewa i pokazuje `fallback`
 * zamiast białej strony.
 *
 * Błąd trafia wyłącznie do konsoli przeglądarki — ta aplikacja nie wysyła
 * zgłoszeń błędów nigdzie na zewnątrz. Jeśli chcesz podpiąć własny monitoring,
 * `componentDidCatch` niżej jest jedynym miejscem do zmiany.
 */

interface Props {
    children: ReactNode;
    fallback: ReactNode;
}

interface State {
    hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false };

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // `componentStack` logujemy osobno — bez tego nie wiadomo, który komponent
        // wywalił render.
        console.error('Błąd renderowania:', error, errorInfo.componentStack);
    }

    render(): ReactNode {
        return this.state.hasError ? this.props.fallback : this.props.children;
    }
}

export default ErrorBoundary;
