import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

interface HistoryData {
    date: string;
    totalCost: number;
    totalValue: number;
}

interface Props {
    data: HistoryData[];
}

export default function InvestmentChart({ data }: Props) {
    if (!data || data.length === 0) {
        return (
            <div className="bg-[#1c2a33]/50 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-gray-500 h-[300px]">
                <p>Brak danych historycznych do wyświetlenia wykresu</p>
                <p className="text-xs mt-1">Zaktualizuj wartości swoich inwestycji, aby zacząć śledzić historię</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1c2a33]/50 border border-white/5 rounded-2xl p-6 h-[400px]">
            <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                Wartość instrumentów w czasie
            </h3>
            <ResponsiveContainer width="100%" height="90%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={30}
                        tickFormatter={(str) => {
                            const d = new Date(str);
                            return d.toLocaleDateString('pl-PL', { month: 'short', day: 'numeric' });
                        }}
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value.toLocaleString()} PLN`}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                const value = payload.find(p => p.dataKey === 'totalValue')?.value as number || 0;
                                const cost = payload.find(p => p.dataKey === 'totalCost')?.value as number || 0;
                                const profit = value - cost;
                                const profitPercent = cost > 0 ? (profit / cost) * 100 : 0;

                                // Format date for tooltip with year to avoid ambiguity
                                const dateLabel = label ? new Date(label).toLocaleDateString('pl-PL', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric'
                                }) : '';

                                return (
                                    <div className="bg-[#1c2a33] border border-white/10 rounded-xl p-4 shadow-xl">
                                        <p className="text-gray-400 text-xs mb-2 font-medium">{dateLabel}</p>
                                        <div className="space-y-2">
                                            <div className="flex justify-between gap-8 items-center">
                                                <span className="text-gray-400 text-xs">Aktualna wartość:</span>
                                                <span className="text-white font-bold text-xs">{value.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</span>
                                            </div>
                                            <div className="flex justify-between gap-8 items-center text-xs">
                                                <span className="text-gray-400">Zainwestowane:</span>
                                                <span className="text-gray-300 font-bold">{cost.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</span>
                                            </div>
                                            <div className={`flex justify-between gap-8 items-center text-xs pt-2 border-t border-white/5 
                                                ${profit >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
                                                <span>Zysk/Strata:</span>
                                                <span className="font-bold">
                                                    {profit >= 0 ? '+' : ''}{profit.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN
                                                    ({profitPercent >= 0 ? '+' : ''}{profitPercent.toFixed(2)}%)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    {/* "Zainwestowane" pod spodem, przerywana i bez wypełnienia — rozróżnialna nawet gdy pokrywa się z wartością */}
                    <Area
                        name="Zainwestowane"
                        type="monotone"
                        dataKey="totalCost"
                        stroke="#FBBF24"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        fillOpacity={0}
                        fill="none"
                        dot={false}
                    />
                    <Area
                        name="Aktualna wartość"
                        type="monotone"
                        dataKey="totalValue"
                        stroke="#2DD4BF"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
