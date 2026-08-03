import { useId } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';

interface Props {
    data: { date: string; valuePLN: number }[];
    /** Kolor linii — domyślnie wynika z trendu (zielony/czerwony). */
    color?: string;
    height?: number;
    className?: string;
}

/**
 * Mini-wykres trendu (bez osi, gridu i tooltipów) do wiersza pozycji.
 * Kolor domyślnie zależy od trendu: zielony gdy rośnie, czerwony gdy spada.
 */
export default function Sparkline({ data, color, height = 36, className }: Props) {
    // Unikalny id gradientu z `useId`, nie z `Math.random()`: losowanie w renderze
    // dawało inną wartość przy każdym przerysowaniu (i inną na serwerze niż w kliencie).
    // Dwukropki, które React wstawia do id, wycinamy — w `url(#…)` wymagałyby escapowania.
    const gradientId = `spark-${useId().replace(/:/g, '')}`;

    if (!data || data.length < 2) {
        return <div style={{ height }} className={className} />;
    }

    const first = data[0].valuePLN;
    const last = data[data.length - 1].valuePLN;
    const trendColor = color ?? (last >= first ? '#2DD4BF' : '#FB7185');

    return (
        <div style={{ height }} className={className}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={trendColor} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="valuePLN"
                        stroke={trendColor}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        isAnimationActive={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
