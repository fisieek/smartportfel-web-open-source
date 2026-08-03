import { useState, useEffect } from 'react';
import { Search, Globe } from 'lucide-react';
import api from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useMarketDataCapabilities } from '../../hooks/useQueries';
import Modal from '../ui/Modal';
import SearchableSelect from '../ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { hasCryptoAccess } from '../../lib/utils';

interface AddAccount {
    id: string;
    name: string;
    provider: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Aktywne konta inwestycyjne (bez zamkniętych). */
    accounts: AddAccount[];
    /** Wywoływane po udanym dodaniu inwestycji (inwalidacja cache). */
    onSuccess: () => void;
}

// Lista dostępnych aktywów do wyboru
const INVESTMENT_OPTIONS: Record<string, string[]> = {
    STOCK: [
        "Alphabet Inc. (GOOGL.US)", "AMD (Advanced Micro Devices) (AMD.DE)", "Citigroup Inc. (C.US)",
        "Intuitive Surgical Inc. (ISRG.US)", "Microsoft Corp. (MSFT)", "NVIDIA Corp. (NVDA)",
        "Palantir Technologies Inc. (PLTR.US)", "Quantum Computing Inc. (QUBT.US)",
        "Rheinmetall AG (RHM.DE)", "Siemens AG (SIE.DE)", "Starbucks Corp. (SBUX)", "Inne"
    ],
    ETF: [
        "Amundi Index MSCI Europe UCITS ETF (Dist)", "Amundi Nasdaq 100 UCITS ETF (Acc)",
        "First Trust Nasdaq Cybersecurity UCITS ETF (CBRS.DE)", "HANetf Future of Defense UCITS ETF (ASWC.DE)",
        "HANetf Future of Defense UCITS ETF (ETFNATO.PL)", "iShares Ageing Population UCITS ETF (2B77.DE)",
        "iShares Automation & Robotics UCITS ETF (2B76.DE)", "iShares Core MSCI Europe UCITS ETF (IMAE.NL)",
        "iShares Global Clean Energy UCITS ETF (IQQH.DE)", "iShares S&P 500 Energy Sector UCITS ETF (QDVF.DE)",
        "VanEck Space Innovators UCITS ETF (JEDI.DE)", "Vanguard FTSE All-World Dist ETF (VGWL)",
        "Xtrackers Artificial Intelligence and Big Data UCITS ETF (XAIX.DE)",
        "Xtrackers MSCI Emerging Markets UCITS ETF (XMME.DE)", "Inne"
    ],
    ETC: [
        "iShares Physical Silver ETC (ISLN.UK)", "Inne"
    ],
    BOND: [
        "roczne ROR", "2-letnie DOR", "3-letnie TOS", "4-letnie COI", "10-letnie EDO", "Inne"
    ],
    GOLD: ["Złoto (NBP)"],
    CRYPTO: ["BTC", "ETH", "Inne"]
};

// Mapa długości obligacji (w latach)
const BOND_DURATIONS: Record<string, number> = {
    "roczne ROR": 1,
    "2-letnie DOR": 2,
    "3-letnie TOS": 3,
    "4-letnie COI": 4,
    "10-letnie EDO": 10
};

// Mapowanie nazw na kraje/regiony
const ASSET_COUNTRIES: Record<string, string> = {
    // Akcje USA
    "Alphabet Inc. (GOOGL.US)": "US",
    "AMD (Advanced Micro Devices) (AMD.DE)": "US", // Firma USA, notowana różnie, ale kraj pochodzenia USA
    "Citigroup Inc. (C.US)": "US",
    "Intuitive Surgical Inc. (ISRG.US)": "US",
    "Microsoft Corp. (MSFT)": "US",
    "NVIDIA Corp. (NVDA)": "US",
    "Palantir Technologies Inc. (PLTR.US)": "US",
    "Quantum Computing Inc. (QUBT.US)": "US",
    "Starbucks Corp. (SBUX)": "US",

    // Akcje Niemcy
    "Rheinmetall AG (RHM.DE)": "DE",
    "Siemens AG (SIE.DE)": "DE",

    // ETFy
    "Amundi Index MSCI Europe UCITS ETF (Dist)": "EU",
    "Amundi Nasdaq 100 UCITS ETF (Acc)": "US",
    "First Trust Nasdaq Cybersecurity UCITS ETF (CBRS.DE)": "GLOBAL",
    "HANetf Future of Defense UCITS ETF (ASWC.DE)": "NATO",
    "HANetf Future of Defense UCITS ETF (ETFNATO.PL)": "Globalne",
    "iShares Ageing Population UCITS ETF (2B77.DE)": "GLOBAL",
    "iShares Automation & Robotics UCITS ETF (2B76.DE)": "GLOBAL",
    "iShares Core MSCI Europe UCITS ETF (IMAE.NL)": "EU",
    "iShares Global Clean Energy UCITS ETF (IQQH.DE)": "GLOBAL",
    "iShares S&P 500 Energy Sector UCITS ETF (QDVF.DE)": "US",
    "VanEck Space Innovators UCITS ETF (JEDI.DE)": "GLOBAL",
    "Vanguard FTSE All-World Dist ETF (VGWL)": "GLOBAL", // Cały świat
    "Xtrackers Artificial Intelligence and Big Data UCITS ETF (XAIX.DE)": "GLOBAL",
    "Xtrackers MSCI Emerging Markets UCITS ETF (XMME.DE)": "EM", // Rynki Wschodzące

    // ETC
    "iShares Physical Silver ETC (ISLN.UK)": "GLOBAL"
};

const PROVIDER_RESTRICTIONS: Record<string, string[]> = {
    'XTB': ['STOCK', 'ETF', 'ETC'],
    'REVOLUT': ['STOCK', 'ETF', 'ETC', 'CRYPTO'],
    'GOLDSAVER': ['GOLD'],
    'IKE_PKO': ['BOND'],
    'PKO': ['BOND']
};

const createInitialForm = () => ({
    name: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchasePrice: '0',
    currentValue: '0',
    quantity: '1',
    accountId: '',
    type: 'STOCK',
    country: 'PL',
    bondDuration: 10,
    bondInterestRate: '6.0',
    isHistorical: false,
    currency: 'PLN'
});

export default function AddInvestmentModal({ isOpen, onClose, accounts, onSuccess }: Props) {
    const { success, error: toastError } = useToast();

    const [form, setForm] = useState(createInitialForm());

    // Stan wyszukiwarki instrumentów (wewnątrz formularza dodawania)
    const [instrumentSearch, setInstrumentSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedInstrument, setSelectedInstrument] = useState<any>(null);
    // 'search' = wyszukiwarka instrumentów (GPW/USA/świat), 'manual' = wpis ręczny.
    const [entryMode, setEntryMode] = useState<'search' | 'manual'>('search');
    const [isFetchingPrice, setIsFetchingPrice] = useState(false);

    // Instancja bez dostawcy notowań nie ma czego szukać — wtedy jedynym trybem jest wpis ręczny
    // i przełącznik w ogóle się nie renderuje (patrz `useMarketDataCapabilities`).
    const hasLiveQuotes = useMarketDataCapabilities().data?.liveQuotes === true;
    const effectiveEntryMode = hasLiveQuotes ? entryMode : 'manual';

    // Helpers for form validation state
    const selectedAccount = accounts.find(a => a.id === form.accountId);

    // Check if selected account is a broker that supports stocks/ETFs
    const BROKER_PROVIDERS = ['XTB', 'REVOLUT'];
    const isBrokerAccount = selectedAccount && BROKER_PROVIDERS.includes(selectedAccount.provider);
    const showInstrumentSearch = isBrokerAccount; // Typ auto-ustawia się z API

    const isDetailsDisabled = !form.accountId;

    const performSearch = async (query: string) => {
        if (!query || query.length < 1) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const response = await api.get(`/instruments/search?q=${encodeURIComponent(query)}`);
            setSearchResults(response.data || []);
        } catch (err) {
            console.error('Search error:', err);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Debounced search effect (zakładka wyszukiwarki; tryb ręczny nie szuka)
    useEffect(() => {
        if (!showInstrumentSearch) return;
        if (effectiveEntryMode !== 'search') return;

        const timer = setTimeout(() => {
            if (instrumentSearch.length >= 2) {
                performSearch(instrumentSearch);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [instrumentSearch, showInstrumentSearch, effectiveEntryMode]);

    // Fetch historical price when date changes and instrument is selected
    const fetchHistoricalPrice = async (symbol: string, date: string) => {
        try {
            const response = await api.get(`/instruments/price/${encodeURIComponent(symbol)}?date=${date}`);
            if (response.data?.close) {
                setForm(prev => ({ ...prev, purchasePrice: response.data.close }));
            }
        } catch (err) {
            console.error('Error fetching historical price:', err);
        }
    };

    useEffect(() => {
        const fetchPrice = async () => {
            const isGoldNBP = form.name === 'Złoto (NBP)' || (selectedInstrument?.symbol === 'GOLD_NBP');

            if (isGoldNBP) {
                setIsFetchingPrice(true);
                try {
                    const response = await api.get(`/instruments/price/GOLD_NBP`, {
                        params: { date: form.purchaseDate }
                    });
                    if (response.data?.close) {
                        setForm(prev => ({
                            ...prev,
                            purchasePrice: response.data.close.toString(),
                            currentValue: response.data.close.toString(),
                            currency: 'PLN'
                        }));
                    }
                } catch (err) {
                    console.error('Error fetching gold price:', err);
                } finally {
                    setIsFetchingPrice(false);
                }
            } else if (selectedInstrument && form.purchaseDate) {
                fetchHistoricalPrice(selectedInstrument.symbol, form.purchaseDate);
            }
        };

        fetchPrice();
    }, [form.purchaseDate, selectedInstrument, form.name]);

    // Reset stanu wyszukiwarki (jak przy zamknięciu przez X/backdrop).
    const resetSearch = () => {
        setInstrumentSearch('');
        setSearchResults([]);
        setSelectedInstrument(null);
    };

    const handleClose = () => {
        resetSearch();
        onClose();
    };

    const handleAdd = async () => {
        try {
            if (!form.name || !form.purchasePrice || !form.accountId) {
                toastError('Uzupełnij wymagane pola');
                return;
            }
            const payload = {
                ...form,
                purchasePrice: parseFloat(form.purchasePrice.toString().replace(',', '.')),
                currentValue: parseFloat(form.currentValue.toString().replace(',', '.')),
                quantity: parseFloat(form.quantity.toString().replace(',', '.')),
                bondInterestRate: parseFloat(form.bondInterestRate.toString().replace(',', '.'))
            };
            await api.post('/investments', payload);
            success('Dodano inwestycję');
            onClose();
            // Reset search state
            setInstrumentSearch('');
            setSearchResults([]);
            setSelectedInstrument(null);
            setEntryMode('search');
            // Reset form
            setForm(createInitialForm());
            onSuccess();
        } catch (error: any) {
            console.error('Błąd dodawania inwestycji:', error);
            const msg = error.response?.data?.error || 'Wystąpił błąd';
            if (msg.includes('brakuje środków')) {
                toastError(msg);
            } else {
                toastError(msg);
            }
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Nowa inwestycja"
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Konto Brokerskie */}
                    <div>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Konto inwestycyjne (Broker)</label>
                        <select
                            value={form.accountId}
                            onChange={e => {
                                const acc = accounts.find(a => a.id === e.target.value);
                                const provider = acc?.provider || '';
                                const allowed = PROVIDER_RESTRICTIONS[provider] || ['STOCK', 'ETF', 'ETC', 'BOND', 'GOLD', 'CRYPTO'];

                                let newType = form.type;
                                if (!allowed.includes(newType)) {
                                    newType = allowed[0];
                                }

                                const updates: any = {
                                    accountId: e.target.value,
                                    type: newType,
                                    name: ''
                                };

                                if (provider === 'GOLDSAVER' || newType === 'GOLD') {
                                    updates.name = 'Złoto (NBP)';
                                } else if (provider === 'IKE_PKO') {
                                    updates.name = '10-letnie EDO';
                                    updates.bondDuration = 10;
                                }

                                if (updates.type === 'BOND') {
                                    updates.purchasePrice = 100;
                                }

                                setForm({ ...form, ...updates });
                            }}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                        >
                            <option value="" disabled>Wybierz konto</option>
                            {accounts
                                .filter(acc => acc.provider !== 'BANK_ACCOUNT')
                                .map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.provider})</option>
                                ))}
                        </select>
                    </div>

                    {/* Data zakupu - przeniesione z dołu formularza */}
                    <div className={isDetailsDisabled ? 'opacity-50' : ''}>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Data zakupu</label>
                        <input
                            disabled={isDetailsDisabled}
                            type="date"
                            value={form.purchaseDate}
                            onChange={e => setForm({ ...form, purchaseDate: e.target.value })}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium disabled:cursor-not-allowed"
                        />
                    </div>
                </div>

                {/* Nazwa - warunkowa wyszukiwarka dla brokerów */}
                <div className={isDetailsDisabled ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">
                        {showInstrumentSearch && effectiveEntryMode === 'search' ? 'Wyszukaj instrument' : 'Nazwa'}
                    </label>

                    {showInstrumentSearch ? (
                        // Wyszukiwarka instrumentów dla kont brokerskich (XTB/Revolut)
                        <div className="space-y-2">
                            {selectedInstrument ? (
                                // Show selected instrument
                                <div className="bg-white/10 border border-white/10 rounded-[5px] p-3 flex items-center justify-between">
                                    <div>
                                        <div className="font-bold text-white">{selectedInstrument.symbol}</div>
                                        <div className="text-sm text-white/60">{selectedInstrument.name}</div>
                                        <div className="text-xs text-white/40 mt-1">
                                            {selectedInstrument.region} • {selectedInstrument.currency}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedInstrument(null);
                                            setForm({ ...form, name: '', country: 'PL', currency: 'PLN' });
                                            setInstrumentSearch('');
                                        }}
                                        className="text-white/40 hover:text-white p-1"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ) : (
                                // Pole wyszukiwania
                                <div>
                                    {/* Wybór trybu — tylko gdy instancja ma dostawcę notowań.
                                        Bez niego wyszukiwarka zawsze zwracałaby zero, więc zostaje sam wpis ręczny. */}
                                    {hasLiveQuotes && (
                                        <div className="flex gap-2 mb-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEntryMode('search');
                                                    setInstrumentSearch('');
                                                    setSearchResults([]);
                                                }}
                                                className={`px-3 py-1 text-xs rounded-[4px] border transition-all ${effectiveEntryMode === 'search'
                                                    ? 'bg-white border-white text-black font-bold shadow-lg shadow-black/20'
                                                    : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                                    }`}
                                            >
                                                Wyszukaj (GPW, USA, świat)
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEntryMode('manual');
                                                    setInstrumentSearch('');
                                                    setSearchResults([]);
                                                }}
                                                className={`px-3 py-1 text-xs rounded-[4px] border transition-all ${effectiveEntryMode === 'manual'
                                                    ? 'bg-white border-white text-black font-bold shadow-lg shadow-black/20'
                                                    : 'bg-transparent border-white/10 text-white/40 hover:text-white hover:border-white/30'
                                                    }`}
                                            >
                                                Wprowadź ręcznie
                                            </button>
                                        </div>
                                    )}

                                    {effectiveEntryMode === 'search' ? (
                                        /* Wyszukiwarka instrumentów przez API */
                                        <div className="relative flex gap-2">
                                            <div className="relative flex-1">
                                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                                                    <Search size={18} />
                                                </div>
                                                <input
                                                    type="text"
                                                    value={instrumentSearch}
                                                    onChange={e => setInstrumentSearch(e.target.value)}
                                                    placeholder="Symbol lub nazwa (PKO, AAPL, VWCE)..."
                                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] pl-10 pr-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                                />
                                                {isSearching && (
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Tryb ręczny — bez wyszukiwania */
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                {/* Lewa kolumna: Nazwa instrumentu */}
                                                <input
                                                    type="text"
                                                    value={form.name}
                                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                                    placeholder="Nazwa instrumentu"
                                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                                />

                                                {/* Prawa kolumna: Typ aktywa (zależny od brokera) */}
                                                <select
                                                    value={form.type}
                                                    onChange={e => setForm({ ...form, type: e.target.value })}
                                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium appearance-none"
                                                >
                                                    <option value="STOCK">Akcje</option>
                                                    <option value="ETF">ETF</option>
                                                    {PROVIDER_RESTRICTIONS[accounts.find(a => a.id === form.accountId)?.provider || '']?.includes('ETC') && (
                                                        <option value="ETC">Surowce (ETC)</option>
                                                    )}
                                                    {hasCryptoAccess(accounts.find(a => a.id === form.accountId)?.provider) && (
                                                        <option value="CRYPTO">Kryptowaluty</option>
                                                    )}
                                                </select>
                                            </div>
                                            <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
                                                <Globe size={12} />
                                                W trybie ręcznym sam wprowadzasz dane i aktualizujesz ceny.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Search results */}
                            {!selectedInstrument && searchResults.length > 0 && (
                                <div className="bg-surface border border-white/10 rounded-[5px] max-h-60 overflow-y-auto">
                                    {searchResults.map((result, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                setSelectedInstrument(result);
                                                // Auto-fill form fields
                                                const regionToCountry: Record<string, string> = {
                                                    'United States': 'US',
                                                    'Germany': 'DE',
                                                    'Poland': 'PL',
                                                    'United Kingdom': 'UK',
                                                    'XETRA': 'DE',
                                                    'Frankfurt': 'DE',
                                                    'WSE': 'PL',
                                                    'Warsaw': 'PL',
                                                    'NASDAQ': 'US',
                                                    'NYSE': 'US',
                                                    'NYSE Arca': 'US',
                                                    'London': 'UK',
                                                };
                                                setForm({
                                                    ...form,
                                                    name: `${result.name} (${result.symbol})`,
                                                    country: regionToCountry[result.region] || 'OTHER',
                                                    currency: result.currency || 'USD',
                                                    type: result.type === 'ETF' ? 'ETF' : 'STOCK'
                                                });
                                                setInstrumentSearch('');
                                                setSearchResults([]);
                                            }}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors"
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="font-bold text-white">{result.symbol}</span>
                                                    <span className="text-white/40 text-sm ml-2">{result.region}</span>
                                                </div>
                                                <span className={`text-xs px-2 py-0.5 rounded ${result.type === 'ETF' ? 'bg-white/10 text-white/70' : 'bg-white/10 text-white/70'}`}>
                                                    {result.type === 'ETF' ? 'ETF' : 'Akcje'}
                                                </span>
                                            </div>
                                            <div className="text-sm text-white/60 truncate">{result.name}</div>
                                            <div className="text-xs text-white/40 mt-1">{result.currency}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Search hints */}
                            {!selectedInstrument && instrumentSearch.length === 0 && effectiveEntryMode === 'search' && (
                                <div className="text-center py-4 text-white/30 text-sm">
                                    <p>Szukaj po symbolu lub nazwie z emitentem</p>
                                    <div className="flex flex-wrap justify-center gap-2 mt-2">
                                        <span className="px-2 py-1 bg-white/5 rounded text-xs">PKO</span>
                                        <span className="px-2 py-1 bg-white/5 rounded text-xs">vanguard sp500</span>
                                        <span className="px-2 py-1 bg-white/5 rounded text-xs">AAPL</span>
                                        <span className="px-2 py-1 bg-white/5 rounded text-xs">złoto</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        // Standard select for non-broker accounts (bonds, gold, etc.)
                        form.name !== 'Inne' && INVESTMENT_OPTIONS[form.type] ? (
                            <SearchableSelect
                                options={INVESTMENT_OPTIONS[form.type]}
                                value={INVESTMENT_OPTIONS[form.type].includes(form.name) ? form.name : (form.name ? 'Inne' : '')}
                                onChange={(val) => {
                                    const updates: any = { name: val };
                                    if (val !== 'Inne' && ASSET_COUNTRIES[val]) updates.country = ASSET_COUNTRIES[val];
                                    if (val !== 'Inne' && BOND_DURATIONS[val]) updates.bondDuration = BOND_DURATIONS[val];
                                    if (val === 'Inne') updates.name = 'Inne';
                                    setForm({ ...form, ...updates });
                                }}
                                placeholder="Wybierz lub wyszukaj..."
                            />
                        ) : (
                            <div className="relative">
                                <input
                                    placeholder="Wpisz nazwę..."
                                    value={form.name === 'Inne' ? '' : form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    autoFocus
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                                <button
                                    onClick={() => setForm({ ...form, name: '' })}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                                >
                                    Powrót
                                </button>
                            </div>
                        )
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Pola warunkowe */}
                    {(form.type === 'STOCK' || form.type === 'ETF' || form.type === 'ETC') && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Kraj pochodzenia</label>
                                <select
                                    value={form.country}
                                    onChange={e => setForm({ ...form, country: e.target.value })}
                                    disabled={!!selectedInstrument}
                                    className={`w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium ${selectedInstrument ? 'cursor-not-allowed opacity-60' : ''}`}
                                >
                                    <option value="PL">Polska (GPW)</option>
                                    <option value="US">USA (NYSE/NASDAQ)</option>
                                    <option value="DE">Niemcy (Xetra)</option>
                                    <option value="UK">Wielka Brytania</option>
                                    <option value="EU">Europa</option>
                                    <option value="GLOBAL">Globalne / Świat</option>
                                    <option value="EM">Rynki Wschodzące</option>
                                    <option value="NATO">Kraje NATO</option>
                                    <option value="OTHER">Inny</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] text-gray-500 uppercase font-bold tracking-widest pl-1">Waluta inwestycji</label>
                                <Select
                                    value={form.currency}
                                    onValueChange={(val) => !selectedInstrument && setForm({ ...form, currency: val })}
                                    disabled={!!selectedInstrument}
                                >
                                    <SelectTrigger className="h-10 bg-surface/50 border-white/10 text-white font-medium">
                                        <SelectValue placeholder="Wybierz walutę" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1c2a33] border-white/10">
                                        {['PLN', 'USD', 'EUR', 'GBP', 'CHF'].map(c => (
                                            <SelectItem key={c} value={c} className="text-white hover:bg-white/5">
                                                {c}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </>
                    )}

                    {form.type === 'BOND' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Okres (Lata)</label>
                                <input
                                    type="number"
                                    value={form.bondDuration}
                                    onChange={e => setForm({ ...form, bondDuration: parseInt(e.target.value) })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Oprocentowanie (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={form.bondInterestRate}
                                    onChange={e => setForm({ ...form, bondInterestRate: e.target.value })}
                                    className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium"
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className={isDetailsDisabled ? 'opacity-50' : ''}>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">
                            {form.type === 'GOLD' || form.name.includes('Złoto') ? 'Ilość (g)' : 'Ilość'}
                        </label>
                        <input
                            disabled={isDetailsDisabled}
                            type="number"
                            step="any"
                            value={form.quantity}
                            onChange={e => setForm({ ...form, quantity: e.target.value })}
                            className="w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium disabled:cursor-not-allowed"
                        />
                    </div>

                    <div className={(isDetailsDisabled || form.type === 'BOND') ? 'opacity-50' : ''}>
                        <label className="block text-sm font-medium text-gray-500 mb-2 ml-1">Cena jedn. ({form.currency || 'PLN'})</label>
                        <input
                            disabled={isDetailsDisabled || form.type === 'BOND'}
                            type="number"
                            step="any"
                            placeholder="0.00"
                            value={form.purchasePrice}
                            onChange={e => setForm({ ...form, purchasePrice: e.target.value })}
                            className={`w-full bg-surface/50 border border-white/10 rounded-[5px] px-4 py-3 text-white focus:outline-none focus:border-white/20 focus:bg-surface transition-all font-medium disabled:cursor-not-allowed ${isFetchingPrice ? 'animate-pulse bg-white/5' : ''}`}
                        />
                        {isFetchingPrice && (
                            <div className="absolute right-3 top-10 flex items-center gap-2 pointer-events-none">
                                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                <span className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Szukam ceny...</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Wpis historyczny checkbox - bardziej subtelny */}
                <div className={`mt-2 ${isDetailsDisabled ? 'opacity-50' : ''}`}>
                    <label className="flex items-center gap-2 px-1 cursor-pointer group">
                        <input
                            type="checkbox"
                            disabled={isDetailsDisabled}
                            checked={form.isHistorical}
                            onChange={e => setForm({ ...form, isHistorical: e.target.checked })}
                            className="w-4 h-4 rounded border-white/20 bg-white/5 text-white focus:ring-white/20 focus:ring-offset-0 transition-all"
                        />
                        <span className="text-[11px] text-gray-500 group-hover:text-gray-400 transition-colors uppercase font-bold tracking-wider">Inwestycja historyczna. System nie pobierze środków.</span>
                    </label>
                </div>

                <div className="flex gap-3 pt-6 border-t border-gray-100 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 px-6 rounded-2xl font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all border border-transparent"
                    >
                        Anuluj
                    </button>
                    <button
                        onClick={handleAdd}
                        className="flex-[2] py-4 px-6 bg-white rounded-[5px] font-black text-black hover:bg-gray-200 transition-all active:scale-[0.98] shadow-xl shadow-black/20"
                    >
                        Dodaj inwestycję
                    </button>
                </div>
            </div>
        </Modal>
    );
}
