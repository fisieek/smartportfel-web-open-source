import { useCallback, useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { PieChart, Wallet, Landmark, TrendingUp, Settings, LogOut, Plus, CreditCard, Home, Upload, X, PiggyBank, Github, Tag, MoreHorizontal, Trophy } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import PPKSuggestionModal from '../components/PPKSuggestionModal';
import { cn } from '../lib/utils';
import { GITHUB_REPO_URL } from '../lib/constants';
import Modal from '../components/ui/Modal';
import AddExpenseModal from '../components/AddExpenseModal';
import AddIncomeModal from '../components/AddIncomeModal';
import TransactionImportModal from '../components/TransactionImportModal';
import PPKSetupWizard from '../components/PPKSetupWizard';
import { HoverButton } from '../components/ui/hover-glow-button';
import FeedbackModal from '../components/FeedbackModal';
import { HelpCircle } from 'lucide-react';
import { CurrencySwitcher } from '../components/ui/CurrencySwitcher';
import GamificationCelebration from '../components/gamification/GamificationCelebration';
import HeaderStreakPill from '../components/gamification/HeaderStreakPill';
import { queryKeys } from '../hooks/useQueries';
import { useTransactionFilters } from '../context/TransactionFiltersContext';

export default function Layout() {
    const location = useLocation();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [user, setUser] = useState<{ username: string; email: string } | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [ppkSuggestion, setPpkSuggestion] = useState<any>(null);
    const [isPpkModalOpen, setIsPpkModalOpen] = useState(false);
    const [isPpkSetupOpen, setIsPpkSetupOpen] = useState(false);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

    // Deklaracja PRZED efektem, który z niej korzysta: `const` nie jest hoistowany,
    // więc wołanie „z góry" zamrażało starą referencję funkcji.
    const checkPpkSuggestion = useCallback(async () => {
        try {
            const res = await api.get('/ppk/pending-suggestion');
            if (res.data.hasSuggestion) {
                setPpkSuggestion(res.data.suggestion);
                setIsPpkModalOpen(true);
            }
        } catch (error) {
            console.error('Błąd sprawdzania sugestii PPK:', error);
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const userStr = localStorage.getItem('user');

        if (!token) {
            navigate('/login');
            return;
        }

        // Ustaw dane z cache natychmiastowo (UI nie miga)
        if (userStr) {
            try {
                // Efekt jest tu właściwym miejscem: to synchronizacja z systemem zewnętrznym
                // (localStorage), która w tej samej gałęzi musi umieć wyczyścić uszkodzony
                // wpis i przekierować na /login. Inicjalizator useState nie ma jak tego zrobić.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setUser(JSON.parse(userStr));
            } catch {
                // uszkodzony JSON w localStorage – wyczyść i przekieruj
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                navigate('/login');
                return;
            }
        }

        // Zweryfikuj token i odśwież dane użytkownika z bazy
        api.get('/auth/me')
            .then((res) => {
                const freshUser = res.data.user;
                setUser(freshUser);
                localStorage.setItem('user', JSON.stringify(freshUser));
                checkPpkSuggestion();
            })
            .catch((err) => {
                // 401/403 = token wygasł lub nieprawidłowy
                if (err.response?.status === 401 || err.response?.status === 403) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    navigate('/login');
                }
                // Inne błędy sieciowe – zostań zalogowany, użyj cache
            });
    }, [navigate, checkPpkSuggestion]);

    // Zamknięcie menu „więcej" przy każdej zmianie trasy. Reset stanu w reakcji na
    // nawigację — efekt jest tu czytelniejszy niż śledzenie poprzedniej ścieżki w renderze.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMoreMenuOpen(false);
    }, [location.pathname]);

    // Otwarcie modala dodawania wydatku z innych miejsc (np. widget gamifikacji "seria zagrożona")
    useEffect(() => {
        const open = () => setIsAddModalOpen(true);
        window.addEventListener('app:open-add-expense', open);
        return () => window.removeEventListener('app:open-add-expense', open);
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login');
    };

    const navItems = [
        { icon: PieChart, label: 'Budżet', path: '/dashboard' },
        { icon: Wallet, label: 'Transakcje', path: '/dashboard/transactions' },
        { icon: CreditCard, label: 'Konta Osobiste', path: '/dashboard/personal-accounts' },
        { icon: Landmark, label: 'Oszczędności', path: '/dashboard/savings' },
        { icon: TrendingUp, label: 'Inwestycje', path: '/dashboard/investments' },
        { icon: PiggyBank, label: 'PPK', path: '/dashboard/ppk' },
        { icon: Home, label: 'Kredyty', path: '/dashboard/mortgage' },
    ];

    const primaryNavItems = navItems.slice(0, 4);
    const secondaryNavItems = [
        ...navItems.slice(4),
        { icon: Trophy, label: 'Osiągnięcia', path: '/dashboard/osiagniecia' },
        { icon: Settings, label: 'Ustawienia', path: '/dashboard/settings' },
    ];

    const getPageTitle = (pathname: string) => {
        switch (pathname) {
            case '/dashboard': return 'Budżet';
            case '/dashboard/transactions': return 'Transakcje';
            case '/dashboard/personal-accounts': return 'Konta Osobiste';
            case '/dashboard/savings': return 'Oszczędności';
            case '/dashboard/osiagniecia': return 'Osiągnięcia';
            case '/dashboard/investments': return 'Inwestycje';
            case '/dashboard/ppk': return 'PPK';
            case '/dashboard/mortgage': return 'Kredyty';
            case '/dashboard/settings': return 'Ustawienia';
            default: return 'SmartPortfel';
        }
    };

    const showCurrencySwitcher = location.pathname === '/dashboard' || location.pathname === '/dashboard/transactions';

    // Gdy na liście transakcji odfiltrowany jest inny miesiąc niż bieżący, nowa transakcja
    // dostaje datę 1. dnia TEGO miesiąca — inaczej wpis wpadałby poza przeglądany okres
    // i wyglądał, jakby się nie zapisał.
    //
    // Świadomie TYLKO na trasie Transakcji: filtr żyje ponad stroną (bo modal dodawania siedzi
    // tutaj, w Layoutcie), więc bez tego warunku data z filtra wyciekałaby na Budżet i pozostałe
    // zakładki, gdzie użytkownik żadnego miesiąca nie wybierał.
    const { defaultTransactionDate } = useTransactionFilters();
    const onTransactionsPage = location.pathname === '/dashboard/transactions';
    const addModalDefaultDate = onTransactionsPage ? defaultTransactionDate : undefined;

    return (
        <div className="flex h-[100dvh] bg-site text-text-main font-sans selection:bg-white/20 dark">
            <GamificationCelebration />
            <Modal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                title="Dodaj nową transakcję"
            >
                <div className="text-gray-900">
                    <AddExpenseModal
                        defaultDate={addModalDefaultDate}
                        onClose={() => setIsAddModalOpen(false)}
                        onSuccess={() => {
                            setRefreshTrigger(prev => prev + 1);
                            queryClient.invalidateQueries({ queryKey: queryKeys.gamification });
                            setIsAddModalOpen(false);
                        }}
                    />
                </div>
            </Modal>

            <Modal
                isOpen={isIncomeModalOpen}
                onClose={() => setIsIncomeModalOpen(false)}
                title="Dodaj nowy wpływ"
            >
                <div className="text-gray-900">
                    <AddIncomeModal
                        defaultDate={addModalDefaultDate}
                        onClose={() => setIsIncomeModalOpen(false)}
                        onSuccess={() => {
                            setRefreshTrigger(prev => prev + 1);
                            queryClient.invalidateQueries({ queryKey: queryKeys.gamification });
                            setIsIncomeModalOpen(false);
                        }}
                    />
                </div>
            </Modal>

            <TransactionImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => {
                    setRefreshTrigger(prev => prev + 1);
                    queryClient.invalidateQueries({ queryKey: queryKeys.gamification });
                    setIsImportModalOpen(false);
                }}
            />

            <PPKSuggestionModal
                isOpen={isPpkModalOpen}
                suggestion={ppkSuggestion}
                onClose={() => setIsPpkModalOpen(false)}
                onConfirm={() => {
                    setRefreshTrigger(prev => prev + 1);
                    setIsPpkModalOpen(false);
                }}
            />

            <PPKSetupWizard
                isOpen={isPpkSetupOpen}
                onClose={() => setIsPpkSetupOpen(false)}
                onSuccess={() => setRefreshTrigger(prev => prev + 1)}
            />

            {/* Mobile Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 bg-[#0B0B0F] border-t border-white/5 z-40 md:hidden px-2 pb-safe">
                <div className="flex justify-around items-center h-16">
                    {primaryNavItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex flex-col items-center justify-center gap-1 min-w-[64px] transition-colors",
                                    isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
                                )}
                            >
                                <Icon size={20} className={cn(isActive && "stroke-2")} />
                                <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
                            </Link>
                        );
                    })}
                    <button
                        onClick={() => setIsMoreMenuOpen(true)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 min-w-[64px] transition-colors",
                            isMoreMenuOpen ? "text-white" : "text-gray-500 hover:text-gray-300"
                        )}
                    >
                        <MoreHorizontal size={20} />
                        <span className="text-[10px] font-medium">Więcej</span>
                    </button>
                </div>
            </nav>

            {/* Mobile "More" Menu Overlay */}
            {isMoreMenuOpen && (
                <div
                    className="fixed inset-0 z-[110] md:hidden"
                    onClick={() => setIsMoreMenuOpen(false)}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <div
                        className="absolute bottom-0 left-0 right-0 bg-[#0B0B0F] border-t border-white/10 rounded-t-2xl p-6 animate-in slide-in-from-bottom"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-white">Więcej</h3>
                            <button onClick={() => setIsMoreMenuOpen(false)} className="p-2 text-gray-400">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                            {secondaryNavItems.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setIsMoreMenuOpen(false)}
                                        className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 active:scale-95 transition-all text-center"
                                    >
                                        <div className="relative">
                                            <Icon size={24} className="text-white" />
                                        </div>
                                        <span className="text-[11px] font-medium text-gray-300">{item.label}</span>
                                    </Link>
                                );
                            })}
                            <button
                                onClick={() => {
                                    setIsFeedbackModalOpen(true);
                                    setIsMoreMenuOpen(false);
                                }}
                                className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/5 active:scale-95 transition-all text-center"
                            >
                                <div className="relative">
                                    <HelpCircle size={24} className="text-white" />
                                </div>
                                <span className="text-[11px] font-medium text-gray-300">Pomoc</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar (Desktop) */}
            <aside className="w-[212px] bg-site flex flex-col hidden md:flex font-sans sticky top-0 h-screen border-r border-white/5 pl-3 py-3">
                <Link to="/dashboard" className="px-4 py-4 mb-2">
                    <h1 className="text-lg font-bold flex flex-col tracking-tight text-white mb-1">
                        <span className="text-base flex items-center gap-2">
                            SmartPortfel
                        </span>
                        <span className="text-[10px] text-gray-500 font-normal">Twój portfel pod kontrolą</span>
                    </h1>
                </Link>

                <nav className="flex-1 px-0 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;

                        return (
                            <div key={item.path} className="relative group/nav">
                                <Link
                                    to={item.path}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-2.5 rounded-[5px] transition-all duration-300 font-medium text-xs group relative overflow-hidden",
                                        isActive
                                            ? "text-white bg-white/10 shadow-lg border border-white/5"
                                            : "text-gray-400 hover:text-white hover:bg-white/5"
                                    )}
                                >
                                    {isActive && (
                                        <div className="absolute inset-0 bg-white/5 opacity-100 -z-10" />
                                    )}
                                    <div className="flex items-center gap-2.5">
                                        <Icon size={18} className={cn(isActive ? "stroke-2" : "stroke-[1.5]")} />
                                        <span>{item.label}</span>
                                    </div>
                                </Link>
                            </div>
                        );
                    })}


                </nav>

                <div className="p-4 border-t border-white/5">
                    <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-2 flex items-center gap-2.5 px-4 py-2.5 rounded-[5px] text-xs font-medium text-gray-400 transition-all duration-300 hover:bg-white/5 hover:text-white"
                    >
                        <Github size={18} className="stroke-[1.5]" />
                        <span>Projekt open source</span>
                    </a>
                    <Link
                        to="/dashboard/osiagniecia"
                        className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 rounded-[5px] w-full transition-all duration-200 mb-2 font-medium text-xs",
                            location.pathname === '/dashboard/osiagniecia'
                                ? "text-white bg-white/10"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <Trophy size={20} />
                        <span>Osiągnięcia</span>
                    </Link>
                    <Link
                        to="/dashboard/settings"
                        className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 rounded-[5px] w-full transition-all duration-200 mb-2 font-medium text-xs",
                            location.pathname === '/dashboard/settings'
                                ? "text-white bg-white/10"
                                : "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <Settings size={20} />
                        <span>Ustawienia</span>
                    </Link>

                    <button
                        onClick={() => setIsFeedbackModalOpen(true)}
                        className={cn(
                            "flex items-center gap-2.5 px-4 py-2.5 rounded-[5px] w-full transition-all duration-200 font-medium text-xs mb-0",
                            "text-gray-400 hover:text-white hover:bg-white/5"
                        )}
                    >
                        <HelpCircle size={20} />
                        <span>Pomoc</span>
                    </button>

                    <div className="px-4 py-2 mt-2 border-t border-white/5 pt-3">
                        <p className="text-xs font-medium text-white">{user?.username || 'Użytkownik'}</p>
                        <p className="text-[10px] text-gray-500 truncate mb-2">{user?.email || 'email@example.com'}</p>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-site font-sans text-text-main relative">


                <div className="p-4 md:p-6 max-w-[1400px] mx-auto pb-24 md:pb-6">
                    {/* Main Header - Sticky Title & Actions */}
                    <div className="sticky top-0 z-50 bg-[#0B0B0F] backdrop-blur-xl -mx-4 md:-mx-6 px-4 md:px-6 py-4 mb-4 md:mb-8 border-b border-white/5 transition-all duration-200">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 md:gap-6 max-w-[1400px] mx-auto">
                            <div className="flex items-center justify-between md:justify-start gap-2 md:gap-3 shrink-0 w-full md:w-auto">
                                <div className="flex items-center gap-2 md:gap-3">
                                    <div className="flex-1 min-w-0">
                                        {location.pathname === '/dashboard/personal-accounts' ? (
                                            <div className="flex flex-col justify-center items-start leading-none gap-0.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider md:hidden">Konta</span>
                                                <span className="text-sm font-black text-white md:hidden">Osobiste</span>
                                                <h2 className="text-lg md:text-2xl font-bold text-white whitespace-nowrap hidden md:block">{getPageTitle(location.pathname)}</h2>
                                            </div>
                                        ) : location.pathname === '/dashboard/mortgage' ? (
                                            <div className="flex flex-col justify-center items-start leading-none gap-0.5">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider md:hidden">Twoje</span>
                                                <span className="text-sm font-black text-white md:hidden">Kredyty</span>
                                                <h2 className="text-lg md:text-2xl font-bold text-white whitespace-nowrap hidden md:block">{getPageTitle(location.pathname)}</h2>
                                            </div>
                                        ) : (
                                            <h2 className="text-sm md:text-2xl font-black md:font-bold text-white truncate">{getPageTitle(location.pathname)}</h2>
                                        )}
                                    </div>
                                </div>

                                {/* Mobile Icons/Buttons visible in header */}
                                <div className="flex md:hidden items-center gap-2 shrink-0">
                                    {showCurrencySwitcher && <CurrencySwitcher variant="compact" />}
                                    <button
                                        onClick={() => setIsAddModalOpen(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-white/10 border border-white/5 rounded-[5px] text-xs font-bold text-gray-200 hover:text-white hover:bg-white/20 transition-all h-9"
                                    >
                                        <Plus size={16} className="text-white" />
                                        <span>Wydatek</span>
                                    </button>

                                    <button
                                        onClick={() => setIsIncomeModalOpen(true)}
                                        className="flex items-center gap-2 px-3 py-2 bg-white/10 border border-white/5 rounded-[5px] text-xs font-bold text-gray-200 hover:text-white hover:bg-white/20 transition-all h-9"
                                    >
                                        <TrendingUp size={16} className="text-white" />
                                        <span>Wpływ</span>
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 md:gap-4 overflow-visible pb-0 shrink-0 w-full md:w-auto justify-start md:justify-end">
                                {location.pathname === '/dashboard/transactions' && (
                                    <>
                                        <button
                                            onClick={() => navigate('/dashboard/settings/categories')}
                                            className="flex-shrink-0 group relative px-5 py-2 rounded-[5px] font-bold bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 active:scale-95 text-xs h-10"
                                        >
                                            <Tag size={16} className="text-white group-hover:text-white" />
                                            <span className="inline">Zarządzaj Kategoriami</span>
                                        </button>
                                        <button
                                            onClick={() => setIsImportModalOpen(true)}
                                            className="flex-shrink-0 group relative px-5 py-2 rounded-[5px] font-bold bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center gap-2 active:scale-95 text-xs h-10"
                                        >
                                            <Upload size={16} className="text-white group-hover:text-white" />
                                            <span className="hidden xs:inline">Dane historyczne</span>
                                            <span className="xs:hidden">Import</span>
                                        </button>
                                    </>
                                )}

                                {/* Desktop Buttons (Original Style with Glow) */}
                                <div className="hidden md:flex items-center gap-4">
                                    <HeaderStreakPill />
                                    {showCurrencySwitcher && <CurrencySwitcher variant="compact" />}
                                    <HoverButton
                                        onClick={() => setIsAddModalOpen(true)}
                                        glowColor="rgba(255,255,255,0.5)"
                                        hoverTextColor="#FFFFFF"
                                        backgroundColor="#111827"
                                        className="px-5 py-2 text-xs h-10 min-w-[110px]"
                                    >
                                        <Plus size={16} />
                                        Wydatek
                                    </HoverButton>

                                    <HoverButton
                                        onClick={() => setIsIncomeModalOpen(true)}
                                        glowColor="rgba(255,255,255,0.5)"
                                        hoverTextColor="#FFFFFF"
                                        backgroundColor="#111827"
                                        className="px-5 py-2 text-xs h-10 min-w-[110px]"
                                    >
                                        <TrendingUp size={16} />
                                        Wpływ
                                    </HoverButton>
                                </div>

                                {/* Mobile Buttons moved to header, Desktop stays here */}
                                {location.pathname === '/dashboard/settings' && (
                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-2 px-5 py-2 bg-white/5 text-gray-400 border border-white/10 rounded-[5px] hover:bg-white/10 hover:text-white transition-all font-bold text-xs h-10 active:scale-95"
                                    >
                                        <LogOut size={16} />
                                        Wyloguj się
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <Outlet context={{ refreshTrigger, setIsPpkSetupOpen, user }} />
                </div>
            </main>
            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
            />
        </div>
    );
}
