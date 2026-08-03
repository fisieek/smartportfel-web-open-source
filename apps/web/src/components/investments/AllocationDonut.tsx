import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { formatMoney } from '../../lib/formatters';

interface AllocationItem {
    type: string;
    valuePLN: number;
    pct: number;
}

interface Props {
    data: AllocationItem[];
    equityPLN: number;
    cashPLN: number;
}

// Etykiety typów (obsługa wariantów PL/EN); fallback do surowego klucza.
const TYPE_LABELS: Record<string, string> = {
    STOCK: 'Akcje', AKCJE: 'Akcje',
    ETF: 'ETF',
    ETC: 'Surowce', SUROWCE: 'Surowce',
    BOND: 'Obligacje', OBLIGACJE: 'Obligacje',
    GOLD: 'Złoto', ZLOTO: 'Złoto',
    CRYPTO: 'Krypto', KRYPTO: 'Krypto',
    OTHER: 'Inne',
    CASH: 'Gotówka',
};

const COLORS = ['#2DD4BF', '#FBBF24', '#8B5CF6', '#38BDF8', '#FB7185', '#34D399', '#94A3B8'];
const CASH_COLOR = '#64748B';

const labelFor = (type: string) => TYPE_LABELS[type?.toUpperCase?.()] || TYPE_LABELS[type] || type;

export default function AllocationDonut({ data, equityPLN, cashPLN }: Props) {
    // Donut reprezentuje PEŁNE equity (= instrumenty + gotówka), spójnie z etykietą w środku.
    // Procenty liczymy względem equity, a gotówkę dokładamy jako osobny wycinek.
    const base = equityPLN > 0 ? equityPLN : 1;
    const instrumentSlices = data
        .filter(d => d.valuePLN > 0)
        .map(d => ({ type: d.type, valuePLN: d.valuePLN, pct: (d.valuePLN / base) * 100 }));
    const cashSlice = cashPLN > 0 ? [{ type: 'CASH', valuePLN: cashPLN, pct: (cashPLN / base) * 100 }] : [];
    const chartData = [...instrumentSlices, ...cashSlice];

    const colorFor = (type: string, i: number) => (type === 'CASH' ? CASH_COLOR : COLORS[i % COLORS.length]);

    if (chartData.length === 0) {
        return (
            <div className="bg-surface/50 border border-white/5 rounded-[5px] p-6 h-full flex items-center justify-center text-gray-500 text-sm">
                Brak instrumentów do pokazania alokacji
            </div>
        );
    }

    return (
        <div className="bg-surface/50 border border-white/5 rounded-[5px] p-6 shadow-card h-full">
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mb-4">Alokacja portfela</p>
            <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="relative w-[180px] h-[180px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                dataKey="valuePLN"
                                nameKey="type"
                                innerRadius={62}
                                outerRadius={86}
                                paddingAngle={2}
                                stroke="none"
                            >
                                {chartData.map((item, i) => (
                                    <Cell key={i} fill={colorFor(item.type, i)} />
                                ))}
                            </Pie>
                            <Tooltip
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const item = payload[0].payload as AllocationItem;
                                        return (
                                            <div className="bg-[#1c2a33] border border-white/10 rounded-xl p-3 shadow-xl text-xs">
                                                <p className="text-white font-bold mb-0.5">{labelFor(item.type)}</p>
                                                <p className="text-gray-300">{formatMoney(item.valuePLN)} PLN</p>
                                                <p className="text-gray-500">{item.pct.toFixed(1)}%</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    {/* Centralna etykieta — equity */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-white/30 text-[8px] uppercase tracking-widest font-bold">Portfel</span>
                        <span className="text-white font-black text-sm tracking-tight">{formatMoney(equityPLN)}</span>
                        <span className="text-white/30 text-[8px] font-bold">PLN</span>
                    </div>
                </div>

                {/* Legenda */}
                <div className="flex-1 w-full space-y-2">
                    {chartData.map((item, i) => (
                        <div key={item.type} className="flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: colorFor(item.type, i) }} />
                                <span className="text-white/80 font-medium truncate">{labelFor(item.type)}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-white/50">{formatMoney(item.valuePLN)} PLN</span>
                                <span className="text-white font-bold w-12 text-right">{item.pct.toFixed(1)}%</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
