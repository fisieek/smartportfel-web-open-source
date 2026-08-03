import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

interface HistoryData {
    date: string;
    amount: number;
    accumulated: number;
}

interface Props {
    data: HistoryData[];
}

export default function PPKChart({ data }: Props) {
    if (!data || data.length === 0) {
        return (
            <div className="bg-[#1c2a33]/50 border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-gray-500 h-[300px]">
                <p>Brak danych o wpłatach PPK</p>
            </div>
        );
    }

    return (
        <div className="bg-[#1c2a33]/50 border border-white/5 rounded-2xl p-6 h-[400px]">
            <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                Wzrost oszczędności PPK
            </h3>
            <ResponsiveContainer width="100%" height="90%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
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
                            return d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' });
                        }}
                    />
                    <YAxis
                        stroke="#64748b"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value.toLocaleString()} zł`}
                    />
                    <Tooltip
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                const acc = payload.find(p => p.dataKey === 'accumulated')?.value as number || 0;

                                const dateLabel = label ? new Date(label).toLocaleDateString('pl-PL', {
                                    month: 'long',
                                    year: 'numeric'
                                }) : '';

                                return (
                                    <div className="bg-[#1c2a33] border border-white/10 rounded-xl p-4 shadow-xl">
                                        <p className="text-gray-400 text-xs mb-2 font-medium">{dateLabel}</p>
                                        <div className="flex justify-between gap-8 items-center">
                                            <span className="text-gray-400 text-xs">Suma skumulowana:</span>
                                            <span className="text-white font-bold text-xs">{acc.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} PLN</span>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Area
                        name="Suma skumulowana"
                        type="monotone"
                        dataKey="accumulated"
                        stroke="#2DD4BF"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorAcc)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
