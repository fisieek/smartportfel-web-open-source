import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Pencil, RefreshCw, Trash2, LineChart, Banknote } from 'lucide-react';
import type { InvestmentPosition } from '@smartportfel/shared';
import { formatMoney } from '../../lib/formatters';
import Sparkline from '../ui/Sparkline';

interface RawInvestment {
    id: string;
    name: string;
    type?: string;
    currency?: string;
    purchaseDate: string;
    purchasePrice: number;
    currentValue: number;
    quantity: number;
    isHistorical?: boolean;
    account?: { name: string; provider: string };
}

interface Props {
    positions: InvestmentPosition[];
    investments: RawInvestment[];
    onEdit: (inv: RawInvestment) => void;
    onUpdatePrice: (inv: RawInvestment) => void;
    onSell: (inv: RawInvestment) => void;
    onDelete: (invId: string) => void;
}

export default function PositionsTable({ positions, investments, onEdit, onUpdatePrice, onSell, onDelete }: Props) {
    const [expanded, setExpanded] = useState<string | null>(null);

    if (positions.length === 0) {
        return (
            <div className="bg-surface/50 border border-white/5 rounded-[5px] p-12 text-center">
                <div className="bg-white/5 p-4 rounded-full w-fit mx-auto mb-4">
                    <LineChart size={32} className="text-gray-500" />
                </div>
                <p className="text-gray-500 mb-2">Brak pozycji</p>
                <p className="text-gray-600 text-sm">Dodaj inwestycje, aby zobaczyć zagregowane pozycje per aktywo</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {positions.map(p => {
                const isOpen = expanded === p.key;
                const positive = p.plPLN >= 0;
                const txns = investments.filter(i => i.name === p.name && (i.type || 'OTHER') === p.type);

                return (
                    <div key={p.key} className="bg-surface/50 border border-white/5 rounded-[5px] overflow-hidden">
                        <button
                            onClick={() => setExpanded(isOpen ? null : p.key)}
                            className="w-full flex items-center gap-3 p-3 lg:p-4 hover:bg-white/5 transition-colors text-left"
                        >
                            {/* Aktywo */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <ChevronDown size={16} className={`text-white/30 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-bold text-sm truncate">{p.name}</span>
                                        <span className="text-[9px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded uppercase font-bold shrink-0">{p.type}</span>
                                        {p.staleRate && (
                                            <span
                                                className="text-[9px] text-amber-500/90 bg-amber-500/10 px-1 rounded uppercase font-bold shrink-0"
                                                title="Kurs NBP niedostępny — wartość PLN po ostatnim znanym kursie z cache."
                                            >
                                                ≈ kurs
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-white/40">
                                        <span>{trimQty(p.totalQuantity)} szt.</span>
                                        <span className="text-white/20">·</span>
                                        <span>śr. {formatMoney(p.avgPricePLN)} PLN</span>
                                        {p.accounts.length > 0 && <span className="text-white/20 hidden sm:inline">·</span>}
                                        {p.accounts.length > 0 && <span className="hidden sm:inline truncate">{p.accounts.join(', ')}</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Sparkline */}
                            <div className="hidden lg:block w-28 shrink-0">
                                <Sparkline data={p.sparkline} />
                            </div>

                            {/* Wartość */}
                            <div className="text-right shrink-0 w-28 hidden sm:block">
                                <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">Wartość</p>
                                <p className="text-white font-black text-sm">{formatMoney(p.currentValuePLN)}</p>
                                <p className="text-[9px] text-white/30">PLN</p>
                            </div>

                            {/* P/L */}
                            <div className="text-right shrink-0 w-28">
                                <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold">Zysk / Strata</p>
                                <p className={`font-black text-sm ${positive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {positive ? '+' : ''}{formatMoney(p.plPLN)}
                                </p>
                                <p className={`text-[10px] font-bold ${positive ? 'text-emerald-400/70' : 'text-rose-400/70'}`}>
                                    {positive ? '+' : ''}{p.plPct.toFixed(2)}%
                                </p>
                            </div>

                            {/* Udział */}
                            <div className="hidden md:block shrink-0 w-24">
                                <p className="text-[9px] text-white/30 uppercase tracking-wider font-bold text-right mb-1">Udział</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(p.allocationPct, 100)}%` }} />
                                    </div>
                                    <span className="text-white/60 text-[10px] font-bold w-9 text-right">{p.allocationPct.toFixed(0)}%</span>
                                </div>
                            </div>
                        </button>

                        {/* Rozwinięcie — transakcje danego aktywa */}
                        <AnimatePresence initial={false}>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t border-white/5"
                                >
                                    <div className="divide-y divide-white/5">
                                        {txns.map(inv => {
                                            const qty = Number(inv.quantity);
                                            const pp = Number(inv.purchasePrice);
                                            const cv = Number(inv.currentValue);
                                            const cur = inv.currency || 'PLN';
                                            const ch = pp > 0 ? ((cv - pp) / pp) * 100 : 0;
                                            return (
                                                <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5 bg-black/10 group">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2 text-xs">
                                                            <span className="text-white/70 whitespace-nowrap">{new Date(inv.purchaseDate).toLocaleDateString('pl-PL')}</span>
                                                            {inv.isHistorical && <span className="text-[9px] text-amber-500/80 bg-amber-500/10 px-1 rounded uppercase font-bold">Hist.</span>}
                                                            {inv.account && <span className="text-[10px] text-white/40 truncate">{inv.account.name}</span>}
                                                        </div>
                                                        <p className="text-[10px] text-white/40 mt-0.5">
                                                            {trimQty(qty)} szt. × {formatMoney(pp)} {cur}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-white font-bold text-xs">{formatMoney(cv * qty)} {cur}</p>
                                                        <p className={`text-[10px] font-bold ${ch >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{ch >= 0 ? '+' : ''}{ch.toFixed(2)}%</p>
                                                    </div>
                                                    <div className="flex gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => onEdit(inv)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Edytuj">
                                                            <Pencil size={13} />
                                                        </button>
                                                        <button onClick={() => onUpdatePrice(inv)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Aktualizuj wartość">
                                                            <RefreshCw size={13} />
                                                        </button>
                                                        <button onClick={() => onSell(inv)} className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Sprzedaj">
                                                            <Banknote size={13} />
                                                        </button>
                                                        <button onClick={() => onDelete(inv.id)} className="p-1.5 text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors" title="Usuń">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}
        </div>
    );
}

// Przytnij zbędne zera w ilości (np. 10.00 -> 10, 1.50 -> 1.5).
function trimQty(n: number): string {
    return Number(n).toLocaleString('pl-PL', { maximumFractionDigits: 4 });
}
