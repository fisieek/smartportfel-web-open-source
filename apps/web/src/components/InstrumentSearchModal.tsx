import { useState, useEffect, useCallback } from 'react';
import Modal from './ui/Modal';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Search, Plus, TrendingUp, Globe, DollarSign, Loader2 } from 'lucide-react';
import { debounce } from '../lib/utils';

interface InstrumentSearchResult {
    symbol: string;
    name: string;
    type: string;
    region: string;
    currency: string;
    matchScore: number;
}

interface InstrumentSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectInstrument: (instrument: InstrumentSearchResult) => void;
}

export default function InstrumentSearchModal({
    isOpen,
    onClose,
    onSelectInstrument
}: InstrumentSearchModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<InstrumentSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const { error: toastError } = useToast();

    // Debounced search function
    const searchInstruments = useCallback(
        debounce(async (searchQuery: string) => {
            if (searchQuery.length < 2) {
                setResults([]);
                setSearched(false);
                return;
            }

            setLoading(true);
            setSearched(true);
            try {
                const response = await api.get<InstrumentSearchResult[]>(
                    `/instruments/search?q=${encodeURIComponent(searchQuery)}`
                );
                setResults(response.data);
            } catch (error) {
                console.error('Błąd wyszukiwania:', error);
                toastError('Nie udało się wyszukać instrumentów');
            } finally {
                setLoading(false);
            }
        }, 500),
        []
    );

    useEffect(() => {
        searchInstruments(query);
    }, [query, searchInstruments]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setResults([]);
            setSearched(false);
        }
    }, [isOpen]);

    const handleSelect = async (instrument: InstrumentSearchResult) => {
        try {
            // Add instrument to database
            await api.post('/instruments', {
                symbol: instrument.symbol,
                name: instrument.name,
                type: instrument.type,
                currency: instrument.currency,
                exchange: instrument.region
            });
            onSelectInstrument(instrument);
            onClose();
        } catch (error) {
            console.error('Błąd dodawania instrumentu:', error);
            toastError('Nie udało się dodać instrumentu');
        }
    };

    const getTypeLabel = (type: string) => {
        const types: Record<string, string> = {
            'Equity': 'Akcje',
            'ETF': 'ETF',
            'Currency': 'Waluta',
            'Crypto': 'Krypto'
        };
        return types[type] || type;
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            'Equity': 'bg-blue-500/20 text-blue-400',
            'ETF': 'bg-green-500/20 text-green-400',
            'Currency': 'bg-yellow-500/20 text-yellow-400',
            'Crypto': 'bg-orange-500/20 text-orange-400'
        };
        return colors[type] || 'bg-white/10 text-white/60';
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Wyszukaj instrument">
            <div className="space-y-6">
                {/* Search Input */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={20} />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Symbol (AAPL, VWCE) lub nazwa z emitentem (iShares Ageing)"
                        className="w-full bg-white/5 border border-white/5 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-primary/50 focus:bg-white/[0.08] transition-all font-medium placeholder:text-white/20"
                        autoFocus
                    />
                    {loading && (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 animate-spin" size={20} />
                    )}
                </div>

                {/* Results */}
                <div className="max-h-80 overflow-y-auto space-y-2">
                    {results.map((instrument) => (
                        <button
                            key={instrument.symbol}
                            onClick={() => handleSelect(instrument)}
                            className="w-full flex items-center justify-between p-4 rounded-xl bg-white/5 hover:bg-white/[0.08] border border-white/5 hover:border-white/10 transition-all group"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                    <TrendingUp className="text-primary" size={20} />
                                </div>
                                <div className="text-left">
                                    <div className="flex items-center gap-2">
                                        <span className="font-black text-white">{instrument.symbol}</span>
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${getTypeColor(instrument.type)}`}>
                                            {getTypeLabel(instrument.type)}
                                        </span>
                                    </div>
                                    <p className="text-white/40 text-sm font-medium truncate max-w-[250px]">
                                        {instrument.name}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <div className="flex items-center gap-1 text-white/40 text-xs">
                                        <Globe size={12} />
                                        {instrument.region}
                                    </div>
                                    <div className="flex items-center gap-1 text-white/60 text-sm font-bold">
                                        <DollarSign size={12} />
                                        {instrument.currency}
                                    </div>
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                                    <Plus className="text-white/40 group-hover:text-primary transition-colors" size={16} />
                                </div>
                            </div>
                        </button>
                    ))}

                    {/* Empty state */}
                    {searched && !loading && results.length === 0 && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <Search className="text-white/20" size={24} />
                            </div>
                            <p className="text-white/40 font-medium">
                                Nie znaleziono instrumentów
                            </p>
                            <p className="text-white/20 text-sm mt-1">
                                Spróbuj wpisać symbol (np. AAPL) lub nazwę firmy
                            </p>
                        </div>
                    )}

                    {/* Initial state */}
                    {!searched && !loading && (
                        <div className="text-center py-8">
                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                                <TrendingUp className="text-white/20" size={24} />
                            </div>
                            <p className="text-white/40 font-medium">
                                Wyszukaj akcje lub ETF
                            </p>
                            <p className="text-white/20 text-sm mt-1">
                                Szukaj po symbolu (AAPL, VWCE) lub nazwie z emitentem
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-3">
                                <span className="px-2 py-1 bg-white/5 rounded text-xs text-white/30">ishares core</span>
                                <span className="px-2 py-1 bg-white/5 rounded text-xs text-white/30">vanguard sp500</span>
                                <span className="px-2 py-1 bg-white/5 rounded text-xs text-white/30">AAPL</span>
                                <span className="px-2 py-1 bg-white/5 rounded text-xs text-white/30">2B77</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
