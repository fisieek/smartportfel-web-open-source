import { useState } from 'react';
import { Plus, Wallet, ArrowRightLeft, Landmark, Pencil, Archive, RotateCcw, ChevronDown } from 'lucide-react';
import IkeIkzeLimitBar from '../IkeIkzeLimitBar';

export interface AccountLike {
    id: string;
    name: string;
    provider: string;
    balance: number;
    accountType?: 'STANDARD' | 'IKE' | 'IKZE';
    closedAt?: string | null;
}

interface InvestmentLike {
    accountId: string;
}

export interface EditBalancePayload {
    id: string;
    name: string;
    balance: number;
    investmentCount: number;
    closedAt?: string | null;
}

interface Props {
    activeAccounts: AccountLike[];
    archivedAccounts: AccountLike[];
    investments: InvestmentLike[];
    onTransfer: () => void;
    onAddAccount: () => void;
    onArchive: (account: { id: string; name: string }) => void;
    onEditBalance: (payload: EditBalancePayload) => void;
    onUnarchive: (id: string) => void;
}

/**
 * Sekcja kont inwestycyjnych: karty aktywnych kont (z akcjami edycji/archiwizacji)
 * oraz rozwijana lista zamkniętych kont. Stan rozwinięcia archiwum trzymany lokalnie.
 */
export default function AccountsSection({
    activeAccounts,
    archivedAccounts,
    investments,
    onTransfer,
    onAddAccount,
    onArchive,
    onEditBalance,
    onUnarchive,
}: Props) {
    const [showArchived, setShowArchived] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-1 gap-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wallet className="text-white/60" size={20} /> Konta Inwestycyjne
                </h3>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={onTransfer}
                        className="h-10 flex-1 sm:flex-none justify-center font-bold text-white flex items-center gap-1.5 px-4 rounded-[5px] bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs whitespace-nowrap active:scale-95"
                    >
                        <ArrowRightLeft size={14} /> Zasil konto
                    </button>
                    <button
                        onClick={onAddAccount}
                        className="h-10 flex-1 sm:flex-none justify-center font-bold text-white flex items-center gap-1.5 px-4 rounded-[5px] bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-xs whitespace-nowrap active:scale-95"
                    >
                        <Plus size={14} /> Dodaj konto
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {activeAccounts.map(acc => (
                    <div key={acc.id} className="bg-white/5 border border-white/5 rounded-[5px] p-4 flex flex-col hover:bg-white/[0.08] transition-all group relative overflow-hidden">
                        <div className="flex items-start justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="h-8 w-8 rounded-[5px] flex items-center justify-center flex-shrink-0 bg-white/10 text-white">
                                    <Landmark size={16} strokeWidth={2.5} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-white font-bold text-xs leading-tight whitespace-normal break-words" title={acc.name}>{acc.name}</h3>
                                    <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{acc.provider}</p>
                                </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-all">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onArchive({ id: acc.id, name: acc.name });
                                    }}
                                    className="p-1 text-white/30 hover:text-amber-500 transition-all"
                                    title="Zamknij konto"
                                >
                                    <Archive size={12} />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // Policz inwestycje przypisane do tego konta
                                        const investmentCount = investments.filter(inv => inv.accountId === acc.id).length;
                                        onEditBalance({ id: acc.id, name: acc.name, balance: Number(acc.balance), investmentCount, closedAt: acc.closedAt });
                                    }}
                                    className="p-1 text-white/30 hover:text-white transition-all"
                                    title="Edytuj konto"
                                >
                                    <Pencil size={12} />
                                </button>
                            </div>
                        </div>
                        <div className="mt-3">
                            <p className="text-white/20 text-[8px] font-black uppercase tracking-widest leading-none mb-1">Saldo</p>
                            <div className="flex items-baseline gap-1.5">
                                <span className={`text-lg font-black tracking-tight ${Number(acc.balance) >= 0 ? 'text-white' : 'text-rose-500'}`}>
                                    {Number(acc.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] font-black text-white/30 uppercase">PLN</span>
                            </div>
                            {(acc.accountType === 'IKE' || acc.accountType === 'IKZE') && (
                                <IkeIkzeLimitBar accountId={acc.id} />
                            )}
                        </div>
                    </div>
                ))}
                {activeAccounts.length === 0 && (
                    <button
                        onClick={onAddAccount}
                        className="col-span-full py-6 flex flex-col items-center justify-center bg-white/5 rounded-[5px] border border-dashed border-white/10 hover:bg-white/10 transition-colors group"
                    >
                        <Plus size={20} className="text-gray-500 group-hover:text-white transition-colors mb-1" />
                        <p className="text-gray-500 group-hover:text-gray-300 transition-colors text-xs">Dodaj swoje pierwsze konto inwestycyjne</p>
                    </button>
                )}
            </div>

            {archivedAccounts.length > 0 && (
                <div className="space-y-3 pt-2">
                    <button
                        onClick={() => setShowArchived(v => !v)}
                        className="flex items-center gap-3 px-1 w-full group/arch"
                    >
                        <Archive size={12} className="text-white/20 shrink-0" />
                        <h3 className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] whitespace-nowrap group-hover/arch:text-white/40 transition-colors">
                            Zamknięte konta · {archivedAccounts.length}
                        </h3>
                        <div className="h-px w-full bg-white/5"></div>
                        <ChevronDown size={14} className={`text-white/20 shrink-0 transition-transform ${showArchived ? 'rotate-180' : ''}`} />
                    </button>
                    {showArchived && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                            {archivedAccounts.map(acc => {
                                const closedLabel = acc.closedAt
                                    ? new Date(acc.closedAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                    : '—';
                                return (
                                    <div key={acc.id} className="bg-white/[0.02] border border-white/5 rounded-[5px] p-4 flex flex-col opacity-60 hover:opacity-100 transition-opacity">
                                        <div className="flex items-start justify-between gap-2 min-w-0 mb-3">
                                            <div className="min-w-0">
                                                <h3 className="text-white/70 font-bold text-xs leading-tight whitespace-normal break-words line-through decoration-white/30" title={acc.name}>{acc.name}</h3>
                                                <p className="text-white/30 text-[9px] font-black uppercase tracking-tighter truncate">{acc.provider}</p>
                                            </div>
                                            <button
                                                onClick={() => onUnarchive(acc.id)}
                                                className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-emerald-400 transition-colors shrink-0"
                                                title="Przywróć konto"
                                            >
                                                <RotateCcw size={11} />
                                                Przywróć
                                            </button>
                                        </div>
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="text-lg font-black tracking-tight text-white/50">
                                                {Number(acc.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                            <span className="text-[10px] font-black text-white/20 uppercase">PLN</span>
                                        </div>
                                        <p className="text-[8px] font-black uppercase tracking-widest text-amber-500/50 mt-1">Zamknięte · {closedLabel}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
