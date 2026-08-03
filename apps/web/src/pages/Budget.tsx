import { useEffect, useState, useCallback } from 'react';
import { TrendingDown, TrendingUp, CreditCard, Landmark, PiggyBank, PieChart, Heart, Wallet } from 'lucide-react';
import api from '../lib/api';
import { useOutletContext, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Progress } from '../components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { cn } from '../lib/utils';
import { GlowCard } from '../components/ui/spotlight-card';
import CategoryBadge from '../components/ui/CategoryBadge';
import OnboardingWidget from '../components/OnboardingWidget';
import GamificationWidget from '../components/gamification/GamificationWidget';
import { useCurrency } from '../context/CurrencyContext';
import { queryKeys } from '../hooks/useQueries';
import InlineStoreEditor from '../components/inline/InlineStoreEditor';
import InlineAccountEditor from '../components/inline/InlineAccountEditor';
import InlineAmountEditor from '../components/inline/InlineAmountEditor';
import { isInlineEditable } from '../components/inline/InlinePopover';


export default function Budget() {
    const { refreshTrigger } = useOutletContext<{ refreshTrigger: number }>();
    const [summary, setSummary] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showOnboarding, setShowOnboarding] = useState(true);

    const queryClient = useQueryClient();

    const fetchSummary = async () => {
        try {
            const response = await api.get('/expenses/summary');
            setSummary(response.data);
        } catch (error) {
            console.error('Błąd podczas pobierania podsumowania', error);
        } finally {
            setLoading(false);
        }
    };

    // Odświeżenie po edycji inline z listy (kwota/sklep/konto)
    const handleInlineUpdated = useCallback(() => {
        fetchSummary();
        queryClient.invalidateQueries({ queryKey: queryKeys.personalAccounts });
    }, [queryClient]);

    useEffect(() => {
        fetchSummary();
    }, [refreshTrigger]);

    const { displayCurrency, convertFromPLN } = useCurrency();

    // Backend liczy w PLN — przeliczamy na walutę wyświetlania kursem NBP
    const totalPersonalAccounts = convertFromPLN(Number(summary?.totalPersonalAccounts || 0));
    const totalExpenses = convertFromPLN(Number(summary?.totalExpenses || 0));
    const totalInvestments = convertFromPLN(Number(summary?.totalInvestments || 0));
    const favoriteStoreTotal = convertFromPLN(Number(summary?.favoriteStore?.total || 0));

    if (loading) return <div className="text-white p-8">Ładowanie...</div>;

    return (
        <div className="space-y-6">
            {showOnboarding && (
                <OnboardingWidget onComplete={() => setShowOnboarding(false)} />
            )}

            {/* Karty podsumowania */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {/* Konta Osobiste */}
                <GlowCard>
                    <Link to="/dashboard/personal-accounts" className="block h-full group">
                        <Card className="h-[100px] flex flex-col bg-surface/50 border-white/5 md:hover:border-white/20 transition-all duration-300 shadow-card overflow-hidden relative">
                            <CreditCard size={72} className="md:hidden absolute -right-2 -bottom-3 text-white opacity-[0.06] pointer-events-none" />
                            <div className="hidden md:block absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                                <div className="h-10 w-10 bg-white rounded-full blur-xl"></div>
                            </div>
                            <CardHeader className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-0">
                                <div className="flex items-center gap-1.5">
                                    <CreditCard size={12} className="text-white sm:w-[14px] sm:h-[14px]" />
                                    <CardTitle className="text-gray-400 text-[10px] sm:text-xs font-medium truncate uppercase tracking-wider">Konta</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="px-3 sm:px-4 pt-1 pb-2.5 mt-auto relative z-10">
                                <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 tracking-tight truncate tabular-nums">
                                    {totalPersonalAccounts.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] sm:text-sm font-normal text-gray-400">{displayCurrency}</span>
                                </h3>
                                <p className="text-[9px] sm:text-[10px] text-gray-500 truncate font-medium">Dostępne środki</p>
                            </CardContent>
                        </Card>
                    </Link>
                </GlowCard>

                {/* Wydatki */}
                <GlowCard>
                    <Link to="/dashboard/transactions" className="block h-full group">
                        <Card className="h-[100px] flex flex-col bg-surface/50 border-white/5 md:hover:border-white/20 transition-all duration-300 shadow-card overflow-hidden relative">
                            <TrendingDown size={72} className="md:hidden absolute -right-2 -bottom-3 text-danger opacity-[0.07] pointer-events-none" />
                            <div className="hidden md:block absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                                <TrendingDown size={32} />
                            </div>
                            <div className="hidden md:block absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>
                            <CardHeader className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-0">
                                <div className="flex items-center gap-1.5">
                                    <TrendingDown size={12} className="text-white sm:w-[14px] sm:h-[14px]" />
                                    <CardTitle className="text-gray-400 text-[10px] sm:text-xs font-medium truncate uppercase tracking-wider">Wydatki <span className="opacity-60 text-[9px] sm:text-[10px] lowercase">(mc)</span></CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent className="px-3 sm:px-4 pt-1 pb-2.5 mt-auto relative z-10">
                                <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 tracking-tight truncate tabular-nums">
                                    {totalExpenses.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] sm:text-sm font-normal text-gray-400">{displayCurrency}</span>
                                </h3>
                                <p className="text-[9px] sm:text-[10px] text-gray-500 truncate font-medium">Bieżący miesiąc</p>
                            </CardContent>
                        </Card>
                    </Link>
                </GlowCard>

                {/* Inwestycje */}
                <GlowCard>
                    <div className="relative group h-full">
                        <Link to="/dashboard/investments" className="block h-full transition-all duration-300">
                            <Card className="h-[100px] flex flex-col bg-surface/50 border-white/5 transition-all duration-300 shadow-card overflow-hidden relative md:hover:border-success/20">
                                <TrendingUp size={72} className="md:hidden absolute -right-2 -bottom-3 text-success opacity-[0.08] pointer-events-none" />
                                <div className="hidden md:block absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity text-success">
                                    <TrendingUp size={32} />
                                </div>
                                <div className="hidden md:block absolute -right-4 -top-4 w-16 h-16 bg-success/20 rounded-full blur-2xl group-hover:bg-success/30 transition-all"></div>
                                <CardHeader className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-0">
                                    <div className="flex items-center gap-1.5">
                                        <TrendingUp size={12} className="text-success sm:w-[14px] sm:h-[14px]" />
                                        <CardTitle className="text-gray-400 text-[10px] sm:text-xs font-medium truncate uppercase tracking-wider">Inwestycje</CardTitle>
                                    </div>
                                </CardHeader>
                                <CardContent className="px-3 sm:px-4 pt-1 pb-2.5 mt-auto relative z-10">
                                    <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 tracking-tight truncate tabular-nums">
                                        {totalInvestments.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] sm:text-sm font-normal text-gray-400">{displayCurrency}</span>
                                    </h3>
                                    <p className="text-[9px] sm:text-[10px] text-gray-500 truncate font-medium">Wartość portfela</p>
                                </CardContent>
                            </Card>
                        </Link>
                    </div>
                </GlowCard>

                {/* Ulubione */}
                <GlowCard>
                    <Card className="h-[100px] flex flex-col bg-surface/50 border-white/5 shadow-card overflow-hidden relative group">
                        <Heart size={72} className="md:hidden absolute -right-2 -bottom-3 text-pink-400 opacity-[0.08] pointer-events-none" />
                        <div className="hidden md:block absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                            <Heart size={32} />
                        </div>
                        <div className="hidden md:block absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>
                        <CardHeader className="px-3 sm:px-4 pt-2.5 sm:pt-3 pb-0">
                            <div className="flex items-center gap-1.5">
                                <Heart size={12} className="text-white sm:w-[14px] sm:h-[14px]" />
                                <CardTitle className="text-gray-400 text-[10px] sm:text-xs font-medium truncate uppercase tracking-wider max-w-full overflow-hidden">
                                    <span className="hidden sm:inline">Ulubione: </span><span className="text-white">{summary?.favoriteStore?.name || 'Brak'}</span>
                                </CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent className="px-3 sm:px-4 pt-1 pb-2.5 mt-auto relative z-10">
                            <h3 className="text-lg sm:text-xl font-bold text-white mb-0.5 tracking-tight truncate tabular-nums leading-none">
                                {favoriteStoreTotal.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[10px] sm:text-sm font-normal text-gray-400 font-mono">{displayCurrency}</span>
                            </h3>
                            <p className="text-[9px] sm:text-[10px] text-gray-500 truncate font-medium mt-1">
                                {summary?.favoriteStore?.count || 0} {Number(summary?.favoriteStore?.count) === 1 ? 'zakup' : ([2, 3, 4].includes(Number(summary?.favoriteStore?.count) % 10) && ![12, 13, 14].includes(Number(summary?.favoriteStore?.count) % 100) ? 'zakupy' : 'zakupów')} w tym miesiącu
                            </p>
                        </CardContent>
                    </Card>
                </GlowCard>
            </div>

            {/* Gamifikacja — seria + postęp odznak */}
            <GamificationWidget />

            {/* Ostatnie transakcje & Portfel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Ostatnie transakcje */}
                <Card className="lg:col-span-2 bg-surface/50 border-white/5 shadow-card overflow-hidden flex flex-col">
                    <CardHeader className="p-6 flex flex-row justify-between items-center border-b border-white/5 space-y-0">
                        <CardTitle className="text-lg font-bold text-white">Ostatnie transakcje</CardTitle>
                        <Link to="/dashboard/transactions">
                            <Button variant="link" size="sm" className="text-xs text-white/60 hover:text-white transition-colors p-0 h-auto font-bold uppercase tracking-widest text-[10px]">
                                Zobacz wszystkie
                            </Button>
                        </Link>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="hidden md:block">
                            <Table className="table-fixed w-full">
                                <TableHeader>
                                    <TableRow className="bg-transparent hover:bg-transparent border-white/5">
                                        <TableHead className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[100px]">Data</TableHead>
                                        <TableHead className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sklep / Opis</TableHead>
                                        <TableHead className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[120px]">Konto</TableHead>
                                        <TableHead className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider w-[140px]">Kategoria</TableHead>
                                        <TableHead className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-[112px]">Kwota</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(summary?.recentTransactions || []).slice(0, 5).map((tx: any, i: number) => {
                                        const isPositive = tx.type === 'income' || tx._side === 'exchange_target' || tx._side === 'target';
                                        const editable = isInlineEditable(tx);
                                        return (
                                            <TableRow key={tx.id || i} className="hover:bg-white/[0.02] border-white/5 transition-colors group">
                                                <TableCell className="py-4 px-4 text-sm text-gray-400 whitespace-nowrap">
                                                    {new Date(tx.transactionDate).toLocaleDateString('pl-PL')}
                                                </TableCell>
                                                <TableCell className="py-4 px-4">
                                                    <InlineStoreEditor
                                                        expenseId={tx.id}
                                                        currentName={tx.description}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                        className="block text-sm font-medium text-white"
                                                    />
                                                    {tx.note && (
                                                        <div className="text-[10px] text-gray-500 italic truncate mt-0.5 font-medium">
                                                            {tx.note}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="py-4 px-4 text-sm text-gray-400">
                                                    <InlineAccountEditor
                                                        expenseId={tx.id}
                                                        currentAccountId={tx.personalAccount?.id}
                                                        currentAccountName={tx.personalAccount?.name || '—'}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                    />
                                                </TableCell>
                                                <TableCell className="py-4 px-4">
                                                    {(tx.category || tx.type === 'income') && (
                                                        <CategoryBadge
                                                            name={tx.category?.name || 'Wpływ'}
                                                            color={tx.category?.color || '#2ecc71'}
                                                            icon={tx.category?.icon}
                                                        />
                                                    )}
                                                </TableCell>
                                                <TableCell className={cn(
                                                    "py-4 px-4 text-sm font-bold text-right",
                                                    isPositive ? "text-emerald-400" : "text-white"
                                                )}>
                                                    <InlineAmountEditor
                                                        expenseId={tx.id}
                                                        amount={Number(tx.amount)}
                                                        editable={editable}
                                                        onUpdated={handleInlineUpdated}
                                                        currencyLabel={tx.currency || 'PLN'}
                                                    >
                                                        <div className="flex flex-col items-end leading-tight">
                                                            <span>
                                                                {isPositive ? '+' : '-'}{(tx.currency === 'PKT' || (tx.currency || 'PLN') === displayCurrency
                                                                    ? Number(tx.amount)
                                                                    : convertFromPLN(Number(tx.plnAmount || tx.amount))
                                                                ).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency === 'PKT' ? 'PKT' : displayCurrency}
                                                            </span>
                                                            {(tx.currency || 'PLN') !== displayCurrency && tx.currency !== 'PKT' && (
                                                                <span className="text-[10px] text-gray-500 font-normal italic">
                                                                    ({isPositive ? '+' : '-'}{Number(tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency || 'PLN'})
                                                                </span>
                                                            )}
                                                        </div>
                                                    </InlineAmountEditor>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Mobile List View */}
                        <div className="md:hidden divide-y divide-white/5">
                            {(summary?.recentTransactions || []).slice(0, 5).map((tx: any, i: number) => {
                                const isPositive = tx.type === 'income' || tx._side === 'exchange_target' || tx._side === 'target';
                                const editable = isInlineEditable(tx);
                                return (
                                    <div key={tx.id || i} className="px-4 py-4 hover:bg-white/[0.02] transition-colors">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <InlineStoreEditor
                                                    expenseId={tx.id}
                                                    currentName={tx.description}
                                                    editable={editable}
                                                    onUpdated={handleInlineUpdated}
                                                    className="font-bold text-white text-sm"
                                                />
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-[10px] text-gray-500 shrink-0 whitespace-nowrap">{new Date(tx.transactionDate).toLocaleDateString('pl-PL')}</span>
                                                    {(tx.category || tx.type === 'income') && (
                                                        <CategoryBadge
                                                            name={tx.category?.name || 'Wpływ'}
                                                            color={tx.category?.color || '#2ecc71'}
                                                            icon={tx.category?.icon}
                                                            small
                                                        />
                                                    )}
                                                    {tx.personalAccount?.name && (
                                                        <span className="flex items-center gap-1 text-[10px] text-gray-500 shrink-0">
                                                            <Wallet size={10} className="text-gray-600" />
                                                            <InlineAccountEditor
                                                                expenseId={tx.id}
                                                                currentAccountId={tx.personalAccount?.id}
                                                                currentAccountName={tx.personalAccount?.name || '—'}
                                                                editable={editable}
                                                                onUpdated={handleInlineUpdated}
                                                            />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "text-right text-sm font-bold whitespace-nowrap shrink-0",
                                                isPositive ? "text-emerald-400" : "text-white"
                                            )}>
                                                <InlineAmountEditor
                                                    expenseId={tx.id}
                                                    amount={Number(tx.amount)}
                                                    editable={editable}
                                                    onUpdated={handleInlineUpdated}
                                                    currencyLabel={tx.currency || 'PLN'}
                                                >
                                                    <div className="flex flex-col items-end leading-tight">
                                                        <span>
                                                            {isPositive ? '+' : '-'}{(tx.currency === 'PKT' || (tx.currency || 'PLN') === displayCurrency
                                                                ? Number(tx.amount)
                                                                : convertFromPLN(Number(tx.plnAmount || tx.amount))
                                                            ).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency === 'PKT' ? 'PKT' : displayCurrency}
                                                        </span>
                                                        {(tx.currency || 'PLN') !== displayCurrency && tx.currency !== 'PKT' && (
                                                            <span className="text-[10px] text-gray-500 font-normal italic">
                                                                ({isPositive ? '+' : '-'}{Number(tx.amount).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency || 'PLN'})
                                                            </span>
                                                        )}
                                                    </div>
                                                </InlineAmountEditor>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {(!summary?.recentTransactions || summary.recentTransactions.length === 0) && (
                            <div className="p-8 text-center">
                                <p className="text-gray-500 text-sm mb-4">Brak ostatnich transakcji</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Portfel */}
                <GlowCard className="h-full">
                    <Card className="bg-surface/50 border-white/5 shadow-card relative overflow-hidden h-full">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>
                        <CardHeader className="flex flex-row justify-between items-start mb-2 space-y-0">
                            <CardTitle className="text-lg font-bold text-white">Budżet</CardTitle>
                            <div className="h-10 w-10 bg-white/10 rounded-[2px] flex items-center justify-center text-white">
                                <PieChart size={20} />
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="space-y-1.5 p-2 hover:bg-white/5 rounded-[2px] transition-colors group/item cursor-default">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <CreditCard size={14} className="text-gray-400 group-hover/item:text-white transition-colors" />
                                        <span className="text-sm font-medium text-gray-400 group-hover/item:text-white transition-colors">Konta osobiste</span>
                                    </div>
                                    <span className="text-sm font-bold text-white tracking-tight">{totalPersonalAccounts.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}</span>
                                </div>
                                <Progress value={100} className="h-1" />
                            </div>

                            <div className="space-y-1.5 p-2 hover:bg-white/5 rounded-[2px] transition-colors group/item cursor-default">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <Landmark size={14} className="text-gray-400 group-hover/item:text-white transition-colors" />
                                        <span className="text-sm font-medium text-gray-400 group-hover/item:text-white transition-colors">Oszczędności</span>
                                    </div>
                                    <span className="text-sm font-bold text-white tracking-tight">{convertFromPLN(Number(summary?.totalSavings || 0)).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}</span>
                                </div>
                                <Progress value={100} className="h-1" />
                            </div>

                            <div className="space-y-1.5 p-2 hover:bg-white/5 rounded-[5px] transition-colors group/item cursor-default">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <TrendingUp size={14} className="text-gray-400 group-hover/item:text-success transition-colors" />
                                        <span className="text-sm font-medium text-gray-400 group-hover/item:text-white transition-colors">Inwestycje</span>
                                    </div>
                                    <span className="text-sm font-bold text-white tracking-tight">{totalInvestments.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}</span>
                                </div>
                                <Progress value={100} className="h-1" />
                            </div>

                            <div className="space-y-1.5 p-2 hover:bg-white/5 rounded-[5px] transition-colors group/item cursor-default">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <PiggyBank size={14} className="text-gray-400 group-hover/item:text-white transition-colors" />
                                        <span className="text-sm font-medium text-gray-400 group-hover/item:text-white transition-colors">PPK</span>
                                    </div>
                                    <span className="text-sm font-bold text-white tracking-tight">{convertFromPLN(Number(summary?.totalPPK || 0)).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}</span>
                                </div>
                                <Progress value={100} className="h-1" />
                            </div>

                            <div className="pt-4 mt-4 border-t border-white/5">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-white uppercase tracking-wider opacity-60">Suma</span>
                                    <div className="flex flex-col items-end leading-none">
                                        <span className="text-2xl font-black text-white tracking-tighter">
                                            {convertFromPLN(
                                                Number((summary?.totalPersonalAccounts || 0) + (summary?.totalSavings || 0) + (summary?.totalInvestments || 0) + (summary?.totalPPK || 0))
                                            ).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </GlowCard>
            </div>
        </div>
    );
}
