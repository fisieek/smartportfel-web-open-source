/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        // Pełna lista breakpointów (domyślne + xs) — kolejność rosnąca, by xs:
        // poprawnie kaskadował przed sm:. Odblokowuje istniejące klasy xs: w kodzie.
        screens: {
            xs: '480px',
            sm: '640px',
            md: '768px',
            lg: '1024px',
            xl: '1280px',
            '2xl': '1536px',
        },
        extend: {
            fontFamily: {
                sans: ['Outfit', 'Inter', 'sans-serif'],
            },
            colors: {
                // Backgrounds
                site: '#0B0B0F', // Main deep background
                surface: '#12121A', // Card background
                'surface-hover': '#1A1A24',

                // Accents
                primary: '#FFFFFF', // White
                'primary-glow': '#F3F4F6', // Gray-100
                secondary: '#9CA3AF', // Gray-400
                accent: '#6B7280', // Gray-500

                // Functional
                success: '#34D399', // Emerald-400
                warning: '#F59E0B',
                danger: '#EF4444',

                // Text
                'text-main': '#FFFFFF',
                'text-muted': '#9CA3AF',

                // Rainbow Button Colors
                "color-1": "hsl(var(--color-1))",
                "color-2": "hsl(var(--color-2))",
                "color-3": "hsl(var(--color-3))",
                "color-4": "hsl(var(--color-4))",
                "color-5": "hsl(var(--color-5))",
            },
            backgroundImage: {
                'auth-gradient': 'radial-gradient(circle at top left, #111827 0%, #0B0B0F 50%)', // Neutral dark tint
                'primary-gradient': 'linear-gradient(135deg, #FFFFFF 0%, #D1D5DB 100%)', // White to Light Gray
                'surface-gradient': 'linear-gradient(180deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.0) 100%)',
                'glow-gradient': 'radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, rgba(0, 0, 0, 0) 70%)',
            },
            boxShadow: {
                'card': '0 8px 32px -4px rgba(0, 0, 0, 0.5)',
                'glow-primary': '0 0 20px -5px rgba(255, 255, 255, 0.2)',
                'glow-secondary': '0 0 20px -5px rgba(156, 163, 175, 0.2)',
                'inner-light': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
            },
            borderRadius: {
                '3xl': '5px',
                '4xl': '5px',
            },
            animation: {
                rainbow: "rainbow var(--speed, 2s) infinite linear",
                "accordion-down": "accordion-down 0.2s ease-out",
                "accordion-up": "accordion-up 0.2s ease-out",
            },
            keyframes: {
                rainbow: {
                    "0%": { "background-position": "0%" },
                    "100%": { "background-position": "200%" },
                },
                "accordion-down": {
                    from: { height: "0" },
                    to: { height: "var(--radix-accordion-content-height)" },
                },
                "accordion-up": {
                    from: { height: "var(--radix-accordion-content-height)" },
                    to: { height: "0" },
                },
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
