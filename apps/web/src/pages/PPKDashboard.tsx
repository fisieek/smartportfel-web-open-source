import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PiggyBank, Building2, Landmark, TrendingUp, History, ChevronLeft, ChevronRight, Pencil, RefreshCw } from 'lucide-react';
import api from '../lib/api';
import PPKChart from '../components/PPKChart';
import PPKSetupWizard, { type PPKConfigValues } from '../components/PPKSetupWizard';

interface PPKSummary {
    totalEmployee: number;
    totalEmployer: number;
    totalState: number;
    totalAccumulated: number;
}

interface PPKTransaction {
    id: string;
    date: string;
    type: 'EMPLOYEE' | 'EMPLOYER' | 'STATE_WELCOME' | 'STATE_ANNUAL';
    amount: number;
    taxAmount: number;
    note?: string;
}

export default function PPKDashboard() {
    const [summary, setSummary] = useState<PPKSummary | null>(null);
    const [transactions, setTransactions] = useState<PPKTransaction[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasConfig, setHasConfig] = useState(false);
    const [config, setConfig] = useState<PPKConfigValues | null>(null);
    const [wizardMode, setWizardMode] = useState<'edit' | 'setup' | null>(null);
    const { refreshTrigger, setIsPpkSetupOpen } = useOutletContext<any>();

    // Pagination
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [summaryRes, transRes] = await Promise.all([
                api.get('/ppk/summary'),
                api.get(`/ppk/transactions?page=${page}&limit=10`)
            ]);

            setSummary(summaryRes.data);
            setTransactions(transRes.data.transactions);
            setTotalPages(transRes.data.pagination.totalPages);

            if (summaryRes.data.isConfigured === false) {
                setHasConfig(false);
                setConfig(null);
            } else {
                setHasConfig(true);
                setConfig(summaryRes.data.config || null);
                // Prepare chart data
                const allTransRes = await api.get('/ppk/transactions?limit=1000');
                const allTrans = allTransRes.data.transactions.sort((a: any, b: any) =>
                    new Date(a.date).getTime() - new Date(b.date).getTime()
                );

                let accumulated = 0;
                const history = allTrans.reduce((acc: any[], t: any) => {
                    accumulated += Number(t.amount);
                    const dateStr = t.date.split('T')[0];
                    const existing = acc.find(item => item.date === dateStr);
                    if (existing) {
                        existing.accumulated = accumulated;
                    } else {
                        acc.push({ date: dateStr, accumulated });
                    }
                    return acc;
                }, []);
                setChartData(history);
            }

        } catch (error: any) {
            if (error.response?.status === 404 || (error.response?.status === 200 && !error.data)) {
                setHasConfig(false);
            }
            console.error('Błąd pobierania danych PPK:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [page, refreshTrigger]);

    if (loading) return <div className="p-8 text-gray-400">Ładowanie...</div>;

    if (!hasConfig) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
                <div className="w-20 h-20 bg-primary/10 rounded-[5px] flex items-center justify-center text-primary mb-6 border border-primary/20">
                    <PiggyBank size={40} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Witaj w module PPK</h2>
                <p className="text-gray-400 max-w-md mb-8">
                    Zacznij śledzić swoje oszczędności w Pracowniczych Planach Kapitałowych.
                    System automatycznie wyliczy Twoją historię i dopłaty od Państwa.
                </p>
                <button
                    onClick={() => setIsPpkSetupOpen(true)}
                    className="mt-2 bg-surface hover:bg-white/5 border border-white/10 text-white font-bold py-3 px-8 rounded-[5px] transition-all shadow-lg shadow-black/10 active:scale-95"
                >
                    Skonfiguruj PPK
                </button>
            </div>
        );
    }

    const typeLabels = {
        EMPLOYEE: 'Wpłata własna',
        EMPLOYER: 'Wpłata pracodawcy',
        STATE_WELCOME: 'Wpłata powitalna',
        STATE_ANNUAL: 'Dopłata roczna'
    };

    const typeColors = {
        EMPLOYEE: 'text-primary',
        EMPLOYER: 'text-blue-400',
        STATE_WELCOME: 'text-amber-400',
        STATE_ANNUAL: 'text-amber-400'
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">

            {/* Pasek akcji konfiguracji — widoczny na każdej szerokości ekranu */}
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                    onClick={() => setWizardMode('edit')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-[5px] text-xs font-bold text-gray-300 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                >
                    <Pencil size={14} />
                    Edytuj konfigurację
                </button>
                <button
                    onClick={() => setWizardMode('setup')}
                    className="flex items-center gap-2 px-4 py-2.5 border border-white/5 rounded-[5px] text-xs font-bold text-gray-500 hover:text-rose-400 hover:border-rose-500/30 transition-all active:scale-95"
                    title="Usuwa historię i przelicza ją od nowa"
                >
                    <RefreshCw size={14} />
                    Skonfiguruj od nowa
                </button>
            </div>

            <PPKSetupWizard
                isOpen={wizardMode !== null}
                mode={wizardMode || 'setup'}
                initialConfig={config}
                onClose={() => setWizardMode(null)}
                onSuccess={() => fetchData()}
            />

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-5 relative overflow-hidden group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <TrendingUp size={48} className="text-primary" />
                    </div>
                    <p className="text-gray-400 text-xs font-medium mb-1">Suma razem</p>
                    <h3 className="text-2xl font-bold text-white">
                        {summary?.totalAccumulated.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-500">PLN</span>
                    </h3>
                </div>

                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <PiggyBank size={14} className="text-primary" />
                        <p className="text-gray-400 text-xs font-medium">Wkład własny</p>
                    </div>
                    <h3 className="text-xl font-bold text-white">
                        {summary?.totalEmployee.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-500">PLN</span>
                    </h3>
                </div>

                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Building2 size={14} className="text-blue-400" />
                        <p className="text-gray-400 text-xs font-medium">Od pracodawcy</p>
                    </div>
                    <h3 className="text-xl font-bold text-white">
                        {summary?.totalEmployer.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-500">PLN</span>
                    </h3>
                </div>

                <div className="bg-surface/50 border border-white/5 rounded-[5px] p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <Landmark size={14} className="text-amber-400" />
                        <p className="text-gray-400 text-xs font-medium">Od państwa (bonusy)</p>
                    </div>
                    <h3 className="text-xl font-bold text-white">
                        {summary?.totalState.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-sm font-normal text-gray-500">PLN</span>
                    </h3>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Section */}
                <div className="lg:col-span-2">
                    <PPKChart data={chartData} />
                </div>

                {/* Transactions Table Section */}
                <div className="bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden flex flex-col">
                    <div className="p-5 border-b border-white/5 flex justify-between items-center">
                        <h3 className="text-white font-bold flex items-center gap-2">
                            <History size={18} className="text-gray-400" />
                            Ostatnie operacje
                        </h3>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left">
                            <tbody className="divide-y divide-white/5 bg-surface/50">
                                {transactions.map(t => (
                                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-4">
                                            <div className="text-xs text-gray-500 mb-0.5">
                                                {new Date(t.date).toLocaleDateString('pl-PL', { month: 'short', year: 'numeric' })}
                                            </div>
                                            <div className={`text-sm font-medium ${typeColors[t.type]}`}>
                                                {typeLabels[t.type]}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4 text-right">
                                            <div className="text-sm font-bold text-white">
                                                +{Number(t.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                                            </div>
                                            {t.taxAmount > 0 && (
                                                <div className="text-[10px] text-rose-400/70">
                                                    Podatek: -{Number(t.taxAmount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination */}
                    <div className="p-4 border-t border-white/5 flex justify-between items-center">
                        <button
                            disabled={page === 1}
                            onClick={() => setPage(prev => prev - 1)}
                            className="p-2 text-gray-500 hover:text-white disabled:opacity-30"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-xs text-gray-500 font-medium whitespace-nowrap">
                            Strona {page} z {totalPages}
                        </span>
                        <button
                            disabled={page === totalPages}
                            onClick={() => setPage(prev => prev + 1)}
                            className="p-2 text-gray-500 hover:text-white disabled:opacity-30"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>

        </div>
    );
}
