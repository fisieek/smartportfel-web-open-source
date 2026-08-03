import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, MoreHorizontal, CreditCard, Landmark, AlertTriangle } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import api from '../lib/api';
import Modal from '../components/ui/Modal';
import AddExpenseModal from '../components/AddExpenseModal';
import AddIncomeModal from '../components/AddIncomeModal';
import MonthlyPlanningWidget from '../components/MonthlyPlanningWidget';
import CategoryBadge from '../components/ui/CategoryBadge';
import OnboardingWidget from '../components/OnboardingWidget';
import { useCurrency } from '../context/CurrencyContext';
import { CurrencySwitcher } from '../components/ui/CurrencySwitcher';

export default function Dashboard() {
    const { refreshTrigger } = useOutletContext<{ refreshTrigger: number }>();
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [showOnboarding, setShowOnboarding] = useState(true);

    const fetchSummary = async () => {
        try {
            const response = await api.get('/expenses/summary');
            setSummary(response.data);
        } catch (error) {
            console.error('Failed to fetch summary', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
    }, [refreshTrigger]);

    const { displayCurrency, convertFromPLN } = useCurrency();

    // Backend liczy w PLN — przeliczamy na walutę wyświetlania kursem NBP
    const totalIncomes = convertFromPLN(Number(summary?.totalIncomes || 0));
    const totalExpenses = convertFromPLN(Number(summary?.totalExpenses || 0));
    const totalPersonalAccounts = convertFromPLN(Number(summary?.totalPersonalAccounts || 0));
    const totalSavings = convertFromPLN(Number(summary?.totalSavings || 0));
    const totalNonMonetary = convertFromPLN(Number(summary?.totalNonMonetaryFunds || 0));
    const totalInvestments = convertFromPLN(Number(summary?.totalInvestments || 0));

    if (loading) return <div className="text-white p-8">Loading...</div>;

    const totalPortfolio = totalPersonalAccounts + totalSavings + totalInvestments;

    return (
        <div className="space-y-6">
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Dodaj nowy wydatek"
            >
                <div className="text-gray-900">
                    <AddExpenseModal
                        onClose={() => setIsAddModalOpen(false)}
                        onSuccess={() => {
                            fetchSummary();
                            setIsAddModalOpen(false);
                        }}
                    />
                </div>
            </Modal>
            <Modal
                isOpen={isIncomeModalOpen}
                onClose={() => setIsIncomeModalOpen(false)}
                title="Dodaj wpływ"
            >
                <div className="text-gray-900">
                    <AddIncomeModal
                        onClose={() => setIsIncomeModalOpen(false)}
                        onSuccess={() => {
                            fetchSummary();
                            setIsIncomeModalOpen(false);
                        }}
                    />
                </div>
            </Modal>

            {showOnboarding && (
                <OnboardingWidget onComplete={() => setShowOnboarding(false)} />
            )}

            {/* Header with Currency Switcher */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Przegląd</h2>
                <CurrencySwitcher variant="compact" />
            </div>

            {/* Ostrzeżenie o nieaktualnym kursie NBP (salda walutowe liczone z cache) */}
            {summary?.staleRate && (
                <div
                    className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-[5px] px-3 py-2"
                    title="API NBP było niedostępne — salda w walutach obcych przeliczono po ostatnim znanym kursie z cache."
                >
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>
                        Kurs NBP niedostępny — salda w walutach obcych wg kursu z {summary.rateAsOf ?? 'ostatniego dostępnego dnia'}.
                    </span>
                </div>
            )}

            {/* Summary Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                {/* Income Card - NEW */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 relative overflow-hidden group shadow-card hover:border-primary/20 transition-all duration-300">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-primary">
                        <TrendingUp size={48} />
                    </div>
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/20 rounded-full blur-2xl group-hover:bg-primary/30 transition-all"></div>

                    <p className="text-gray-400 text-sm mb-1 font-medium">Wpływ <span className="text-xs opacity-60">(Ten miesiąc)</span></p>
                    <h3 className="text-2xl font-bold text-white mb-2">
                        {totalIncomes.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                    </h3>
                    <button
                        onClick={() => setIsIncomeModalOpen(true)}
                        className="text-xs text-primary font-bold flex items-center gap-1 hover:text-white transition-colors mt-2"
                    >
                        Dodaj wpływ <TrendingUp size={12} />
                    </button>
                </div>

                {/* Expenses Card */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 relative overflow-hidden group shadow-card hover:border-accent/20 transition-all duration-300">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-accent/20 rounded-full blur-2xl group-hover:bg-accent/30 transition-all"></div>
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-accent">
                        <TrendingDown size={48} />
                    </div>
                    <p className="text-gray-400 text-sm mb-1 font-medium">Wydatki <span className="text-xs opacity-60">(Ten miesiąc)</span></p>
                    <h3 className="text-2xl font-bold text-white mb-2">
                        {totalExpenses.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                    </h3>
                    <button
                        onClick={() => setIsAddModalOpen(true)}
                        className="text-xs text-accent font-bold flex items-center gap-1 hover:text-white transition-colors mt-2"
                    >
                        Dodaj wydatek <TrendingDown size={12} />
                    </button>
                </div>

                {/* Account Balances Summary Card */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 relative overflow-hidden shadow-card">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
                    <p className="text-gray-400 text-sm mb-1 font-medium">Dostępne środki</p>
                    <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                        {totalPersonalAccounts.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                    </h3>
                    <p className="text-xs text-gray-500">Konta osobiste + Gotówka</p>
                </div>

                {/* Savings summary */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 relative overflow-hidden shadow-card">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl"></div>
                    <p className="text-gray-400 text-sm mb-1 font-medium">Suma Oszczędności</p>
                    <h3 className="text-2xl font-bold text-white mb-2">
                        {totalSavings.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-gray-500">
                            Wszystkie cele i konta
                        </span>
                    </div>
                </div>

                {/* Non-Monetary Funds Card - NEW */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 relative overflow-hidden shadow-card">
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl"></div>
                    <p className="text-gray-400 text-sm mb-1 font-medium">Dodatkowe środki</p>
                    <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">
                        {totalNonMonetary.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                    </h3>
                    <p className="text-xs text-gray-500">Karty podarunkowe + Punkty</p>
                </div>
            </div>

            {/* Monthly Planning Section */}
            <div>
                <MonthlyPlanningWidget onSuccess={fetchSummary} />
            </div>


            {/* Bottom Row - Transactions & Portfolio */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Recent Transactions */}
                <div className="lg:col-span-2 bg-surface border border-white/5 rounded-[5px] p-0 overflow-hidden shadow-card flex flex-col">
                    <div className="p-6 flex justify-between items-center border-b border-white/5">
                        <h3 className="text-lg font-bold text-white">Ostatnie Transakcje</h3>
                        <button className="text-xs text-primary hover:text-white transition-colors">Zobacz wszystkie</button>
                    </div>

                    <div className="p-0">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                            <div className="col-span-2">Data</div>
                            <div className="col-span-4">Nazwa</div>
                            <div className="col-span-3">Kategoria</div>
                            <div className="col-span-3 text-right">Kwota</div>
                        </div>

                        <div className="divide-y divide-white/5">
                            {(summary?.recentTransactions || []).slice(0, 3).map((tx: any, i: number) => (
                                <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group">
                                    <div className="col-span-2 text-sm text-gray-400">
                                        {new Date(tx.transactionDate || tx.date).toLocaleDateString('pl-PL')}
                                    </div>
                                    <div className="col-span-4 flex items-center gap-3">

                                        <span className="text-sm font-medium text-white">{tx.description}</span>
                                    </div>
                                    <div className="col-span-3">
                                        <CategoryBadge
                                            name={tx.type === 'income' ? 'Wpływ' : tx.category?.name || 'Inne'}
                                            color={tx.category?.color}
                                            icon={tx.category?.icon}
                                        />
                                    </div>
                                    <div className={`col-span-3 text-right text-sm font-bold ${tx.type === 'income' ? 'text-primary' : 'text-white'}`}>
                                        <div className="flex flex-col items-end leading-tight">
                                            <span>
                                                {tx.type === 'income' ? '+' : '-'}
                                                {(displayCurrency === (tx.currency || 'PLN')
                                                    ? Number(tx.amount)
                                                    : convertFromPLN(Number(tx.plnAmount || tx.amount))
                                                ).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {displayCurrency}
                                            </span>
                                            {(tx.currency || 'PLN') !== displayCurrency && (
                                                <span className="text-[10px] text-gray-500 font-normal italic">
                                                    ({tx.type === 'income' ? '+' : '-'}
                                                    {Number(tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} {tx.currency || 'PLN'})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {/* If empty, allow user to add */}
                            {(!summary?.recentTransactions || summary.recentTransactions.length === 0) && (
                                <div className="p-8 text-center">
                                    <p className="text-gray-500 text-sm mb-4">Brak ostatnich transakcji</p>
                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="px-4 py-2 bg-primary/10 text-primary rounded-[5px] text-sm hover:bg-primary/20"
                                    >
                                        Dodaj pierwszy wydatek
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Portfolio */}
                <div className="bg-surface border border-white/5 rounded-[5px] p-6 shadow-card relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
                    <div className="flex justify-between items-start mb-6">
                        <h3 className="text-lg font-bold text-white">Portfel</h3>
                        <MoreHorizontal size={20} className="text-gray-500 cursor-pointer" />
                    </div>

                    <div className="mb-6">
                        <p className="text-sm text-gray-400 mb-1">Wartość całkowita</p>
                        <div className="flex items-baseline gap-2">
                            <h2 className="text-3xl font-bold text-white">
                                {totalPortfolio.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-lg text-gray-500 font-normal">{displayCurrency}</span>
                            </h2>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Podział</p>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <CreditCard size={16} className="text-blue-400" />
                                    Konta osobiste
                                </div>
                                <span className="text-sm font-medium text-white">
                                    {totalPersonalAccounts.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <Landmark size={16} className="text-primary" />
                                    Oszczędności
                                </div>
                                <span className="text-sm font-medium text-white">
                                    {totalSavings.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2 text-sm text-gray-400">
                                    <TrendingUp size={16} className="text-green-400" />
                                    Inwestycje
                                </div>
                                <span className="text-sm font-medium text-white">
                                    {totalInvestments.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                </span>
                            </div>
                        </div>
                    </div>

                    <Link
                        to="/dashboard/investments"
                        className="block w-full mt-8 py-3 rounded-[5px] border border-white/10 text-primary font-medium hover:bg-primary/5 transition-colors text-center"
                    >
                        Zarządzaj portfelem
                    </Link>
                </div>

            </div>
        </div>
    );
}
