import { useEffect, useRef, useState } from 'react';
import { useMotionValue, animate } from 'framer-motion';

interface Props {
    value: number;
    /** Liczba miejsc po przecinku (domyślnie 2). */
    decimals?: number;
    /** Pokaż znak + dla wartości dodatnich. */
    showSign?: boolean;
    className?: string;
    durationMs?: number;
}

/**
 * Animowany licznik (count-up) z formatowaniem pl-PL.
 * Reaguje na zmianę `value` płynnym przejściem od poprzedniej wartości.
 */
export default function AnimatedNumber({ value, decimals = 2, showSign = false, className, durationMs = 800 }: Props) {
    const motion = useMotionValue(0);
    const prev = useRef(0);
    const [display, setDisplay] = useState(() => format(value, decimals, showSign));

    useEffect(() => {
        const controls = animate(motion, value, {
            duration: durationMs / 1000,
            ease: 'easeOut',
            onUpdate: (latest) => setDisplay(format(latest, decimals, showSign)),
        });
        prev.current = value;
        return controls.stop;
    }, [value, decimals, showSign, durationMs, motion]);

    return <span className={className}>{display}</span>;
}

function format(n: number, decimals: number, showSign: boolean): string {
    const sign = showSign && n > 0 ? '+' : '';
    return sign + Number(n).toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
