import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { TrendingUp, AlertTriangle } from 'lucide-react';

interface ForecastData {
    totalGross: string;
    totalTax: string;
    totalNet: string;
    projectedEndBalance: string;
    accountType?: 'savings' | 'deposit';
    daysDetails: Array<{
        date: string;
        gross: number;
        tax: number;
        net: number;
        balance: number;
    }>;
    totalAccrued?: {
        gross: string;
        tax: string;
        net: string;
        days: number;
    } | null;
    totalExpected?: {
        gross: string;
        tax: string;
        net: string;
        days: number;
    } | null;
}

interface RealGainsWidgetProps {
    accountId: string;
    promoEndsAt?: string | null;
}

export default function RealGainsWidget({ accountId, promoEndsAt }: RealGainsWidgetProps) {
    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchForecast = async () => {
            try {
                setLoading(true);
                // Default to current month/year
                const res = await api.get(`/savings/${accountId}/forecast`);
                setForecast(res.data);
            } catch (err) {
                console.error('Error fetching forecast:', err);
                setError('Nie udało się pobrać prognozy.');
            } finally {
                setLoading(false);
            }
        };

        if (accountId) {
            fetchForecast();
        }
    }, [accountId]);

    if (loading) return <div className="p-4 text-white/40 text-sm text-center">Ładowanie prognozy...</div>;
    if (error) return <div className="p-4 text-rose-400 text-sm text-center">{error}</div>;
    if (!forecast) return null;

    const daysToPromoEnd = promoEndsAt
        ? Math.ceil((new Date(promoEndsAt).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
        : null;

    const showPromoWarning = daysToPromoEnd !== null && daysToPromoEnd <= 7 && daysToPromoEnd >= 0;

    const isDeposit = forecast.accountType === 'deposit';

    if (isDeposit) {
        return (
            <div className="space-y-6">
                {/* Promo Warning */}
                {showPromoWarning && (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <div>
                            <h4 className="text-amber-500 font-bold text-sm mb-1">Kończy się promocja!</h4>
                            <p className="text-amber-200/60 text-xs">
                                Twoje promocyjne oprocentowanie wygasa za <span className="text-amber-200 font-bold">{daysToPromoEnd} dni</span> ({new Date(promoEndsAt!).toLocaleDateString()}).
                            </p>
                        </div>
                    </div>
                )}

                {/* Zysk od początku lokaty */}
                {forecast.totalAccrued && (
                    <div className="bg-white/5 border border-white/5 rounded-xl p-6 shadow-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                            <TrendingUp size={80} />
                        </div>
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <p className="text-primary text-[10px] uppercase tracking-[0.2em] font-black">Zysk od początku lokaty</p>
                                <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">{forecast.totalAccrued.days} dni</span>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest font-bold mb-1">Realny Zysk "Na Rękę"</p>
                                    <p className="text-4xl font-black text-white tracking-tighter">
                                        +{Number(forecast.totalAccrued.net).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-lg text-white/20 font-normal">PLN</span>
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div>
                                        <p className="text-white/40 text-[9px] uppercase tracking-wider font-bold mb-1">Brutto</p>
                                        <p className="text-sm font-black text-white/80">+{Number(forecast.totalAccrued.gross).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</p>
                                    </div>
                                    <div>
                                        <p className="text-white/40 text-[9px] uppercase tracking-wider font-bold mb-1">Podatek (19%)</p>
                                        <p className="text-sm font-black text-rose-500/80">-{Number(forecast.totalAccrued.tax).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Zysk całkowity lokaty */}
                {forecast.totalExpected && (
                    <div className="bg-white/5 border border-white/10 border-dashed rounded-xl p-6 relative group bg-gradient-to-br from-white/[0.02] to-transparent">
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-4">
                                <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-black">Zysk całkowity (przewidywany)</p>
                                <span className="text-[8px] border border-white/10 text-white/30 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">{forecast.totalExpected.days} dni</span>
                            </div>

                            <div className="grid grid-cols-1 gap-6">
                                <div>
                                    <p className="text-white/20 text-[9px] uppercase tracking-widest font-bold mb-1">Prognozowane "Na Rękę"</p>
                                    <p className="text-4xl font-black text-white/60 tracking-tighter">
                                        +{Number(forecast.totalExpected.net).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-lg text-white/10 font-normal">PLN</span>
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                    <div>
                                        <p className="text-white/40 text-[9px] uppercase tracking-wider font-bold mb-1">Brutto</p>
                                        <p className="text-sm font-black text-white/40">+{Number(forecast.totalExpected.gross).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</p>
                                    </div>
                                    <div>
                                        <p className="text-white/40 text-[9px] uppercase tracking-wider font-bold mb-1">Podatek (19%)</p>
                                        <p className="text-sm font-black text-rose-500/40">-{Number(forecast.totalExpected.tax).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Promo Warning */}
            {showPromoWarning && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                        <h4 className="text-amber-500 font-bold text-sm mb-1">Kończy się promocja!</h4>
                        <p className="text-amber-200/60 text-xs">
                            Twoje promocyjne oprocentowanie wygasa za <span className="text-amber-200 font-bold">{daysToPromoEnd} dni</span> ({new Date(promoEndsAt!).toLocaleDateString()}).
                        </p>
                    </div>
                </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mb-1">Zysk Brutto</p>
                    <p className="text-xl font-black text-white">
                        +{Number(forecast.totalGross).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-sm text-white/20 font-normal">PLN</span>
                    </p>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                    <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mb-1">Podatek Belki (19%)</p>
                    <p className="text-xl font-black text-rose-400">
                        -{Number(forecast.totalTax).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-sm text-rose-400/50 font-normal">PLN</span>
                    </p>
                </div>
                <div className="col-span-2 bg-gradient-to-r from-primary/20 to-primary/5 border border-primary/20 rounded-xl p-5 flex items-center justify-between">
                    <div>
                        <p className="text-primary text-[10px] uppercase tracking-widest font-bold mb-1">Realny Zysk "Na Rękę"</p>
                        <p className="text-3xl font-black text-white">
                            +{Number(forecast.totalNet).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-lg text-white/20 font-normal">PLN</span>
                        </p>
                    </div>
                    <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center text-primary">
                        <TrendingUp size={24} />
                    </div>
                </div>
            </div>

            {/* Projection Chart / Details */}
            <div className="bg-surface/50 border border-white/5 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <span className="text-xs font-bold text-white/60">Symulacja na ten miesiąc</span>
                    <span className="text-[10px] text-white/20 uppercase tracking-widest">Dzień po dniu</span>
                </div>
                <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-white/5 sticky top-0 z-10 text-[10px] text-white/40 uppercase tracking-widest font-bold">
                            <tr>
                                <th className="px-4 py-2">Data</th>
                                <th className="px-4 py-2 text-right">Zysk</th>
                                <th className="px-4 py-2 text-right">Podatek</th>
                                <th className="px-4 py-2 text-right">Netto</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {forecast.daysDetails.map((day) => (
                                <tr key={day.date} className="hover:bg-white/5 transition-colors text-xs font-medium text-white/80">
                                    <td className="px-4 py-2.5 font-mono text-white/40">{day.date.slice(5)}</td>
                                    <td className="px-4 py-2.5 text-right text-emerald-400">+{day.gross.toFixed(2)}</td>
                                    <td className="px-4 py-2.5 text-right text-rose-400">-{day.tax.toFixed(2)}</td>
                                    <td className="px-4 py-2.5 text-right text-white font-bold">+{day.net.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="px-4 py-3 bg-white/5 border-t border-white/5 text-center">
                    <p className="text-[10px] text-white/30">
                        Symulacja zakłada brak wpłat/wypłat w trakcie miesiąca.
                    </p>
                </div>
            </div>
        </div>
    );
}
