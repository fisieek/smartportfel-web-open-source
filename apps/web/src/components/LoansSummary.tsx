import { useMemo } from 'react';
import { Landmark, CalendarClock, TrendingDown, Layers } from 'lucide-react';
import { suggestInstallment } from '../lib/loanMath';

type LoanType = 'MORTGAGE' | 'CASH' | 'CAR' | 'OTHER';

const LOAN_TYPE_LABELS: Record<LoanType, string> = {
    MORTGAGE: 'Hipoteczne',
    CASH: 'Gotówkowe',
    CAR: 'Samochodowe',
    OTHER: 'Inne',
};

interface LoanLike {
    loanType?: LoanType;
    totalAmount: number;
    currentBalance: number;
    termMonths?: number | null;
    marginRate?: number | null;
    referenceRate?: number | null;
    installmentType?: 'EQUAL' | 'DECREASING' | null;
    payments: { id: string }[];
}

const fmt = (v: number) => v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Zbiorczy widok wszystkich zobowiązań: łączne zadłużenie, suma rat miesięcznie,
 * spłacono łącznie i rozbicie po typach. Renderuje się tylko przy ≥2 kredytach.
 */
export default function LoansSummary({ mortgages }: { mortgages: LoanLike[] }) {
    const stats = useMemo(() => {
        let totalDebt = 0;
        let totalOriginal = 0;
        let monthlyInstallment = 0;
        let loansWithoutInstallment = 0;
        const byType: Record<string, number> = {};

        for (const m of mortgages) {
            totalDebt += Number(m.currentBalance);
            totalOriginal += Number(m.totalAmount);

            const type = m.loanType || 'MORTGAGE';
            byType[type] = (byType[type] || 0) + 1;

            const suggestion = suggestInstallment({
                currentBalance: Number(m.currentBalance),
                termMonths: m.termMonths,
                marginRate: m.marginRate,
                referenceRate: m.referenceRate,
                installmentType: m.installmentType ?? null,
                paymentsMade: m.payments.length,
            });
            if (suggestion) {
                monthlyInstallment += suggestion.totalAmount;
            } else if (Number(m.currentBalance) > 0) {
                loansWithoutInstallment++;
            }
        }

        return {
            totalDebt,
            totalRepaid: totalOriginal - totalDebt,
            monthlyInstallment,
            loansWithoutInstallment,
            byType,
            count: mortgages.length,
        };
    }, [mortgages]);

    if (mortgages.length < 2) return null;

    return (
        <div className="bg-surface/50 border border-white/5 rounded-[5px] p-6">
            <div className="flex items-center gap-2 mb-4">
                <Layers size={16} className="text-primary" />
                <h2 className="text-white font-bold">Wszystkie zobowiązania</h2>
                <span className="text-gray-500 text-sm">({stats.count})</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-surface/50 rounded-[5px] p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                        <Landmark size={14} /> <span>Łączne zadłużenie</span>
                    </div>
                    <p className="text-rose-400 font-bold text-xl">{fmt(stats.totalDebt)} <span className="text-sm font-normal text-gray-500">PLN</span></p>
                </div>

                <div className="bg-surface/50 rounded-[5px] p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                        <CalendarClock size={14} /> <span>Suma rat / miesiąc</span>
                    </div>
                    <p className="text-white font-bold text-xl">{fmt(stats.monthlyInstallment)} <span className="text-sm font-normal text-gray-500">PLN</span></p>
                    {stats.loansWithoutInstallment > 0 && (
                        <p className="text-[10px] text-amber-400/70 mt-1 leading-tight">
                            {stats.loansWithoutInstallment} {stats.loansWithoutInstallment === 1 ? 'kredyt bez' : 'kredyty/-ów bez'} danych do wyliczenia raty
                        </p>
                    )}
                </div>

                <div className="bg-surface/50 rounded-[5px] p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                        <TrendingDown size={14} /> <span>Spłacono łącznie (kapitał)</span>
                    </div>
                    <p className="text-emerald-400 font-bold text-xl">{fmt(stats.totalRepaid)} <span className="text-sm font-normal text-gray-500">PLN</span></p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
                {Object.entries(stats.byType).map(([type, count]) => (
                    <span key={type} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-gray-300">
                        {LOAN_TYPE_LABELS[type as LoanType] || type}: <span className="text-white font-bold">{count}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}
