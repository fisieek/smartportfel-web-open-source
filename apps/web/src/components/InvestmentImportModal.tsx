import { useState, useRef } from 'react';
import { Check, AlertCircle, Sparkles, Database, Loader2, Upload, FileSpreadsheet, Pencil } from 'lucide-react';
import Modal from './ui/Modal';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { parseWorkbookToText } from '../lib/statementParser';
import { detectInvestmentFile, type DetectedItem } from '../lib/investmentFileParsers';
import InstrumentSearchModal from './InstrumentSearchModal';
import './import-modal.css';

interface InvestmentAccount {
    id: string;
    name: string;
    provider: string;
}

interface Investment {
    id: string;
    name: string;
    currentValue: number;
    accountId: string;
    type?: string;
    purchaseDate: string;
    quantity: number;
}

interface InvestmentImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    accounts: InvestmentAccount[];
    investments: Investment[];
}

interface ParsedInvestment {
    date?: string;
    type?: string;
    name: string;
    quantity?: number;
    price: number;
    isValid: boolean;
    error?: string;
    bondDuration?: number;
    bondInterestRate?: number;
    isoDate?: string;
    status?: string;
    // Notowania live (dowiązanie instrumentu)
    currency?: string;
    symbol?: string;
    exchange?: string;
    currentValue?: number; // cena bieżąca z pliku (Market price) — jeśli jest
}

const SAMPLE_CSV = `2024-01-15\tSTOCK\tApple Inc.\t10\t150.00
2024-02-20\tETF\tiShares Core MSCI World\t5\t85.50`;

const SAMPLE_BOND_CSV = `2024-03-10\t4-letnie COI\t6.50\t50\tAktywna
2024-04-12\t10-letnie EDO\t7.25\t20\tAktywna`;

const SAMPLE_GOLD_CSV = `2024-05-01\t0.5241\t320.50
2024-05-15\t1.2000\t325.20`;

const BOND_DURATIONS: Record<string, number> = {
    "roczne ROR": 1,
    "2-letnie DOR": 2,
    "3-letnie TOS": 3,
    "4-letnie COI": 4,
    "10-letnie EDO": 10
};

const PROVIDER_RESTRICTIONS: Record<string, string[]> = {
    'GOLDSAVER': ['GOLD'],
    'PKO': ['BOND'],
    'IKE_PKO': ['BOND'],
    'XTB': ['STOCK', 'ETF', 'ETC'],
    'REVOLUT': ['STOCK', 'ETF', 'CRYPTO']
};

type AssetImportType = 'STOCK_ETF' | 'BOND' | 'GOLD';

export default function InvestmentImportModal({ isOpen, onClose, onSuccess, accounts }: InvestmentImportModalProps) {
    const [assetType, setAssetType] = useState<AssetImportType>('STOCK_ETF');
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedInvestment[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isParsingFile, setIsParsingFile] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [instrumentPickerIdx, setInstrumentPickerIdx] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { success, error: toastError } = useToast();

    const selectedAccount = accounts.find(a => a.id === selectedAccountId);
    const selectedProvider = selectedAccount?.provider || '';
    const allowedTypes = PROVIDER_RESTRICTIONS[selectedProvider] || null;

    // Specyficzna walidacja: sprawdź czy aktualnie wybrana zakładka (assetType) pasuje do brokera
    const isMismatch = allowedTypes && !allowedTypes.some(t =>
        (assetType === 'STOCK_ETF' && (t === 'STOCK' || t === 'ETF' || t === 'ETC')) ||
        (assetType === 'GOLD' && t === 'GOLD') ||
        (assetType === 'BOND' && t === 'BOND')
    );

    if (!isOpen) return null;

    const parseDateInput = (str: string) => {
        if (!str) return new Date();
        const trimmed = str.trim();
        const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (dmy) {
            return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    };

    const parseLine = (line: string): ParsedInvestment | null => {
        if (!line.trim()) return null;
        const parts = line.split(/[\t;]/).map(p => p.trim());

        if (assetType === 'STOCK_ETF') {
            if (parts.length < 5) return null;
            const [dateStr, typeStr, name, qtyStr, priceStr] = parts;
            if (qtyStr.toLowerCase().includes('ilość') || priceStr.toLowerCase().includes('cena')) return null;

            const date = parseDateInput(dateStr);
            if (!date) return { name: name || 'Błąd', price: 0, isValid: false, error: 'Błędna data (użyj DD.MM.RRRR)' };

            const quantity = parseFloat(qtyStr.replace(',', '.').replace(/\s/g, ''));
            const price = parseFloat(priceStr.replace(',', '.').replace('PLN', '').replace(/\s/g, ''));
            const isValid = !isNaN(quantity) && !isNaN(price) && !!name && !!dateStr;

            let type = typeStr.toUpperCase();
            if (type.includes('AKCJ') || type.includes('STOCK')) type = 'STOCK';
            if (type.includes('OBLIG') || type.includes('BOND')) type = 'BOND';
            if (type.includes('KRYPT') || type.includes('CRYPTO')) type = 'CRYPTO';
            if (type.includes('ETF')) type = 'ETF';

            return { date: dateStr, isoDate: date.toISOString(), type, name, quantity, price, isValid, error: isValid ? undefined : 'Błędny format' };
        } else if (assetType === 'BOND') {
            if (parts.length < 4) return null;
            const [dateStr, name, rateStr, qtyStr, statusStr] = parts;
            if (rateStr?.toLowerCase().includes('oprocent') || qtyStr?.toLowerCase().includes('ilość')) return null;

            const date = parseDateInput(dateStr);
            if (!date) return { name: name || 'Błąd', price: 0, isValid: false, error: 'Błędna data' };

            const quantity = parseFloat(qtyStr.replace(',', '.').replace(/\s/g, ''));
            const price = 100.00; // Cena obligacji zawsze 100 zł
            const duration = BOND_DURATIONS[name] || 1;
            const rate = parseFloat(rateStr.replace(',', '.').replace('%', '').replace(/\s/g, ''));

            const isValid = !isNaN(quantity) && !isNaN(rate) && !!name;
            return {
                date: dateStr,
                isoDate: date.toISOString(),
                type: 'BOND',
                name,
                quantity,
                price,
                bondDuration: duration,
                bondInterestRate: rate,
                status: statusStr,
                isValid,
                error: isValid ? undefined : 'Błędny format'
            };
        } else { // GOLD (Goldsaver style)
            if (parts.length < 3) return null;
            const [dateStr, qtyStr, priceStr] = parts;
            if (qtyStr.toLowerCase().includes('ilość') || qtyStr.toLowerCase().includes('waga')) return null;

            const date = parseDateInput(dateStr);
            if (!date) return { name: 'Złoto', price: 0, isValid: false, error: 'Błędna data' };

            const quantity = parseFloat(qtyStr.replace(',', '.').replace(/\s/g, ''));
            const price = parseFloat(priceStr.replace(',', '.').replace(/\s/g, ''));

            const isValid = !isNaN(quantity) && !isNaN(price);
            return {
                date: dateStr,
                isoDate: date.toISOString(),
                type: 'GOLD',
                name: 'Złoto',
                quantity,
                price,
                isValid,
                error: isValid ? undefined : 'Błędny format'
            };
        }
    };

    // Mapowanie pozycji zwróconej przez AI na wiersz podglądu.
    const aiToParsed = (t: any): ParsedInvestment => {
        const dateObj = t.date ? parseDateInput(t.date) : new Date();
        const type = (t.type || (assetType === 'GOLD' ? 'GOLD' : assetType === 'BOND' ? 'BOND' : 'STOCK')).toString().toUpperCase();
        const name = t.name || t.symbol || '';
        return {
            date: dateObj ? dateObj.toLocaleDateString('pl-PL') : t.date,
            isoDate: dateObj ? dateObj.toISOString() : undefined,
            name,
            type,
            quantity: t.quantity ?? 0,
            price: t.price ?? 0,
            currency: t.currency,
            symbol: t.symbol,
            currentValue: typeof t.currentPrice === 'number' ? t.currentPrice : undefined,
            bondDuration: t.bondDuration,
            bondInterestRate: t.bondInterestRate,
            isValid: !!name && t.price != null,
            error: (!name || t.price == null) ? 'Niekompletne dane z AI' : undefined,
        };
    };

    // Auto-dopasowanie symbolu do wyceny live: STOCK/ETF/CRYPTO → dostawca notowań; GOLD → GOLD_NBP;
    // BOND → bez. Bez dostawcy wyszukiwanie zwraca pustą listę i pozycja zostaje bez symbolu.
    const enrichWithSymbols = async (items: ParsedInvestment[]): Promise<ParsedInvestment[]> => {
        return Promise.all(items.map(async (it) => {
            if (it.type === 'GOLD') return { ...it, symbol: it.symbol || 'GOLD_NBP', currency: it.currency || 'PLN' };
            if (it.type === 'BOND' || !it.name) return it;
            // Plik podał cenę rynkową (np. XTB) → nie szukamy u dostawcy (unikamy złych dopasowań);
            // ręczny link przez chip „Dopasuj instrument" zostaje.
            if (it.currentValue != null) return it;
            try {
                const r = await api.get(`/instruments/search?q=${encodeURIComponent(it.name)}`);
                const top = r.data?.[0];
                if (top) return { ...it, symbol: top.symbol, currency: it.currency || top.currency, exchange: top.region };
            } catch { /* best-effort — pozycja zostaje bez symbolu */ }
            return it;
        }));
    };

    // Ręczna korekta dopasowania instrumentu (z InstrumentSearchModal).
    const applyInstrument = (idx: number, inst: { symbol: string; currency: string; region: string }) => {
        setParsedData(prev => prev.map((row, i) => i === idx ? {
            ...row, symbol: inst.symbol, currency: inst.currency, exchange: inst.region,
        } : row));
    };

    // Czy konto danego brokera obsługuje wybrany typ aktywa (wspólna reguła: dropdown + auto-wybór).
    const accountMatchesAssetType = (provider: string, at: AssetImportType) => {
        const allowed = PROVIDER_RESTRICTIONS[provider] || [];
        return allowed.some(t =>
            (at === 'STOCK_ETF' && (t === 'STOCK' || t === 'ETF' || t === 'ETC')) ||
            (at === 'GOLD' && t === 'GOLD') ||
            (at === 'BOND' && t === 'BOND')
        );
    };

    // Auto-wybór pierwszego pasującego konta docelowego dla danego typu aktywa.
    const autoSelectAccount = (at: AssetImportType) => {
        const filtered = accounts.filter(acc => accountMatchesAssetType(acc.provider, at));
        setSelectedAccountId(filtered.length > 0 ? filtered[0].id : '');
    };

    // Pozycja z lokalnego parsera (Goldsaver/obligacje) → wiersz podglądu.
    const detectedToParsed = (t: DetectedItem): ParsedInvestment => {
        const isValid = t.quantity > 0 && t.price > 0;
        return {
            date: t.date,
            isoDate: t.isoDate,
            type: t.type,
            name: t.name,
            quantity: t.quantity,
            price: t.price,
            currency: t.currency,
            bondDuration: t.bondDuration,
            status: t.status,
            isValid,
            error: isValid ? undefined : 'Niekompletne dane',
        };
    };

    const handleFile = async (file: File) => {
        const name = file.name.toLowerCase();
        if (!/\.(csv|xlsx|xls|txt|pdf)$/.test(name)) {
            toastError('Obsługiwane formaty: CSV, XLSX, XLS, PDF');
            return;
        }
        setIsParsingFile(true);
        try {
            // Znane, ustrukturyzowane eksporty (Goldsaver, obligacje skarbowe) czytamy lokalnie —
            // dokładnie i bez AI. Ustawia właściwy typ aktywa i konto docelowe.
            if (!name.endsWith('.pdf')) {
                const detected = await detectInvestmentFile(file);
                if (detected) {
                    setAssetType(detected.assetType);
                    const parsed = await enrichWithSymbols(detected.items.map(detectedToParsed));
                    setParsedData(parsed);
                    autoSelectAccount(detected.assetType);
                    setStep('preview');
                    return;
                }
            }
            if (name.endsWith('.pdf')) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('importType', 'INVESTMENT');
                formData.append('assetType', assetType);

                const res = await api.post('/ai/parse-pdf', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                const fetchedInvestments = res.data?.data?.investments || [];
                if (fetchedInvestments.length === 0) {
                    toastError('AI nie wykryło żadnych inwestycji w tym pliku PDF.');
                    return;
                }

                const parsed = await enrichWithSymbols(fetchedInvestments.map(aiToParsed));
                setParsedData(parsed);
                setStep('preview');
                return;
            }

            // CSV/Excel → AI (realne układy XTB/Revolut zmienne + wiele arkuszy → czyta je AI;
            // parseWorkbookToText składa wszystkie arkusze, OPEN POSITIONS na początku)
            const text = await parseWorkbookToText(file);
            if (!text.trim()) {
                toastError('Plik wygląda na pusty.');
                return;
            }
            const res = await api.post('/ai/map-investments', { text, assetType });
            const found = res.data?.investments || [];
            if (found.length === 0) {
                toastError('AI nie rozpoznało pozycji inwestycyjnych w tym pliku.');
                return;
            }
            const parsed = await enrichWithSymbols(found.map(aiToParsed));
            setParsedData(parsed);
            setStep('preview');
        } catch (err: any) {
            console.error('Błąd parsowania:', err);
            const msg = err.response?.data?.message || err.response?.data?.details;
            toastError(msg ? `Błąd AI: ${msg}` : 'Wystąpił błąd podczas odczytu pliku.');
        } finally {
            setIsParsingFile(false);
        }
    };

    const handlePreview = () => {
        const lines = rawText.trim().split('\n');
        const data = lines
            .map(parseLine)
            .filter((item): item is ParsedInvestment => item !== null);

        if (data.length === 0) {
            toastError('Nie znaleziono danych. Sprawdź format.');
            return;
        }

        setParsedData(data);
        setStep('preview');

        // Auto-wybór konta docelowego pasującego do typu aktywa.
        autoSelectAccount(assetType);
    };

    const handleAction = async () => {
        setIsSubmitting(true);
        const validItems = parsedData.filter(i => i.isValid);

        try {
            if (!selectedAccountId) {
                toastError('Wybierz konto docelowe');
                setIsSubmitting(false);
                return;
            }
            const payload = {
                investments: validItems.map(item => ({
                    name: item.name,
                    type: item.type,
                    purchaseDate: item.isoDate,
                    purchasePrice: item.price,
                    quantity: item.quantity,
                    currentValue: item.currentValue ?? item.price,
                    country: 'PL',
                    currency: item.currency,
                    symbol: item.symbol,       // dowiązanie instrumentu + notowanie live (backend)
                    exchange: item.exchange,
                    bondDuration: item.bondDuration,
                    bondInterestRate: item.bondInterestRate
                })),
                accountId: selectedAccountId,
                isHistorical: true
            };

            await api.post('/investments/bulk', payload);
            success(`Zaimportowano ${validItems.length} inwestycji`);

            onSuccess();
            onClose();
            setRawText('');
            setStep('input');
        } catch (error) {
            console.error('Błąd operacji:', error);
            toastError('Wystąpił błąd. Spróbuj ponownie.');
        } finally {
            setIsSubmitting(false);
        }
    };
    const handleClearAccount = async (onlyCurrentAssetType: boolean = false) => {
        if (!selectedAccountId) {
            toastError('Wybierz konto do wyczyszczenia.');
            return;
        }

        const account = accounts.find(a => a.id === selectedAccountId);
        const accountName = account ? `${account.name} (${account.provider})` : 'wybrane konto';
        const typeFilter = onlyCurrentAssetType ? (assetType === 'STOCK_ETF' ? 'STOCK' : assetType) : null;

        const confirmMsg = onlyCurrentAssetType
            ? `Czy na pewno chcesz usunąć TYLKO ${assetType} z konta ${accountName}? Tej operacji nie można cofnąć.`
            : `Czy na pewno chcesz usunąć WSZYSTKIE inwestycje z konta ${accountName}? Tej operacji nie można cofnąć.`;

        if (!confirm(confirmMsg)) return;

        try {
            const url = `/investments/account/${selectedAccountId}${typeFilter ? `?type=${typeFilter}` : ''}`;
            const res = await api.delete(url);
            success(res.data.message || 'Wyczyszczono konto.');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Błąd czyszczenia konta:', error);
            toastError('Błąd podczas czyszczenia konta.');
        }
    };

    // Podpowiedź formatu dla ręcznego wklejania (TSV) — zależna od typu aktywa.
    const manualHint: [string, string] = assetType === 'STOCK_ETF'
        ? ['Data, Typ, Nazwa, Ilość, Cena', '2024-01-15  STOCK  Apple Inc  10  150.00']
        : assetType === 'BOND' ? ['Data, Nazwa, Oprocentowanie %, Ilość, Status', '2024-03-10  4-letnie COI  6.50  50  Aktywna']
            : ['Data, Waga (g), Cena za gram', '2024-05-01  0.5241  320.50'];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Import inwestycji"
            subtitle={step === 'input' ? undefined : `${parsedData.filter(i => i.isValid).length} z ${parsedData.length} gotowych do importu`}
            maxWidth={step === 'input' ? 'max-w-3xl' : 'max-w-4xl'}
            variant="clean"
            showHeader
            footer={step === 'input' ? (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-3">
                    {selectedAccountId && (
                        <div className="flex gap-2 sm:mr-auto">
                            <button onClick={() => handleClearAccount(false)} className="px-4 py-2.5 text-rose-500 hover:text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-500/20 rounded-xl hover:bg-rose-500/10 transition-all">Wyczyść wszystko</button>
                            <button onClick={() => handleClearAccount(true)} className="px-4 py-2.5 text-orange-400 hover:text-orange-300 text-[10px] font-black uppercase tracking-widest border border-orange-500/20 rounded-xl hover:bg-orange-500/10 transition-all">Usuń tylko {assetType}</button>
                        </div>
                    )}
                    <button onClick={onClose} className="px-6 py-3 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] transition-all sm:ml-auto">Anuluj</button>
                    <button onClick={handlePreview} disabled={!rawText || isMismatch} className="im-btn-primary px-10 py-3.5 text-[10px] uppercase tracking-widest">Podgląd danych</button>
                </div>
            ) : (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button onClick={() => setStep('input')} className="px-6 py-3 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] transition-all">← Wróć do edycji</button>
                    <button onClick={handleAction} disabled={isSubmitting} className="im-btn-primary px-10 py-3.5 text-[10px] uppercase tracking-widest">
                        {isSubmitting ? 'Przetwarzanie...' : `Importuj (${parsedData.filter(i => i.isValid).length})`}
                    </button>
                </div>
            )}
        >
            <div className="im-scope relative">
                <div className="im-aurora" aria-hidden="true">
                    <div className="im-aurora__blob im-aurora__blob--1" />
                    <div className="im-aurora__blob im-aurora__blob--2" />
                    <div className="im-aurora__blob im-aurora__blob--3" />
                </div>
                <div className="relative z-10 px-5">
                <div className="relative z-10 py-5">
                    {isMismatch && (
                        <div className="mb-6 bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-4">
                            <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={20} />
                            <div>
                                <p className="text-sm text-rose-500 font-black uppercase tracking-widest mb-1">Niezgodność konta</p>
                                <p className="text-xs text-rose-500/60 leading-relaxed">
                                    Wybrany broker ({selectedProvider}) nie obsługuje typu aktywów: {assetType}.
                                    Wybierz poprawne konto docelowe.
                                </p>
                            </div>
                        </div>
                    )}
                    {step === 'input' ? (
                        <div className="space-y-6">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.xlsx,.xls,.txt,.pdf"
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
                            />
                            <div
                                onClick={() => !isParsingFile && fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                                className={`im-dropzone cursor-pointer p-10 text-center ${isDragging ? 'im-dropzone--drag' : ''}`}
                            >
                                {isParsingFile ? (
                                    <div className="flex flex-col items-center gap-3 text-white/60">
                                        <Loader2 size={28} className="animate-spin text-emerald-400" />
                                        <span className="text-sm font-bold">Czytam plik...</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-3">
                                        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                                            <Upload size={24} className="text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-white font-black text-sm">Wgraj z pliku PDF / Excel</p>
                                            <p className="text-white/40 text-xs mt-1">Przeciągnij plik tutaj, aby odczytać zawartość automatycznie</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">
                                            <FileSpreadsheet size={12} /> CSV · XLSX · PDF
                                        </div>
                                    </div>
                                )}
                            </div>

                            <details className="group mt-6">
                                <summary className="cursor-pointer text-white/40 hover:text-white/70 text-[11px] font-black uppercase tracking-widest transition-colors list-none flex items-center gap-2">
                                    <span className="text-emerald-400 group-open:rotate-90 transition-transform">›</span> Lub wklej dane ręcznie (TSV)
                                </summary>
                                <div className="mt-4 flex flex-wrap items-center gap-5">
                                    {(['STOCK_ETF', 'BOND', 'GOLD'] as AssetImportType[]).map(t => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setAssetType(t)}
                                            className={`text-[10px] font-black uppercase tracking-widest transition-all ${assetType === t ? 'text-emerald-400' : 'text-white/20 hover:text-white/40'}`}
                                        >
                                            {t === 'STOCK_ETF' ? 'Akcje / ETF' : t === 'BOND' ? 'Obligacje' : 'Złoto'}
                                        </button>
                                    ))}
                                </div>
                                <div className="im-glow-card p-4 mt-3 text-xs text-white/50 space-y-1.5">
                                    <p className="text-emerald-300 font-black uppercase tracking-widest text-[10px] flex items-center gap-2">
                                        <Sparkles size={12} /> Format ({assetType === 'STOCK_ETF' ? 'Akcje/ETF' : assetType === 'BOND' ? 'Obligacje' : 'Złoto'})
                                    </p>
                                    <p>Kolejność: <strong className="text-white/70">{manualHint[0]}</strong></p>
                                    <p>Przykład: <code className="text-emerald-300 bg-emerald-400/10 px-1.5 rounded">{manualHint[1]}</code></p>
                                    <p className="text-white/30">Separator: Tabulator (Excel/Sheets) lub średnik.</p>
                                </div>
                                <textarea
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                    placeholder={
                                        assetType === 'STOCK_ETF' ? `Data\tTyp\tNazwa\tIlość\tCena\n${SAMPLE_CSV}`
                                            : assetType === 'BOND' ? `Data\tNazwa\tIlość\tCena\tLata\t%\n${SAMPLE_BOND_CSV}`
                                                : `Data\tWaga(g)\tCena/g\n${SAMPLE_GOLD_CSV}`
                                    }
                                    className="w-full h-80 mt-4 bg-[#0a0a0a] border border-white/10 rounded-2xl p-6 text-sm text-white font-mono focus:outline-none focus:border-emerald-400/50 placeholder:text-white/5 custom-scrollbar transition-all shadow-inner"
                                />
                            </details>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col gap-2 bg-white/5 p-5 rounded-2xl border border-white/5">
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-widest ml-1">Konto docelowe</label>
                                <div className="relative group/select">
                                    <select
                                        value={selectedAccountId}
                                        onChange={(e) => setSelectedAccountId(e.target.value)}
                                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-emerald-400/50 transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled className="bg-[#0a0a0a]">Wybierz konto...</option>
                                        {accounts
                                            .filter(acc => accountMatchesAssetType(acc.provider, assetType))
                                            .map(acc => (
                                                <option key={acc.id} value={acc.id} className="bg-[#0a0a0a]">{acc.name} ({acc.provider})</option>
                                            ))
                                        }
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover/select:text-white/40 transition-colors">
                                        <Database size={16} />
                                    </div>
                                </div>
                            </div>

                            <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/5">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-[10px] text-white/20 font-black uppercase bg-white/5 tracking-widest border-b border-white/5">
                                        <tr>
                                            <th className="px-4 py-3">Data</th>
                                            {assetType === 'STOCK_ETF' && <th className="px-4 py-3">Typ</th>}
                                            {assetType !== 'GOLD' && <th className="px-4 py-3">Nazwa</th>}

                                            {/* Specialized Columns for Bonds */}
                                            {assetType === 'BOND' && (
                                                <th className="px-4 py-3 text-right">Oprocentowanie (%)</th>
                                            )}

                                            <th className="px-4 py-3 text-right">
                                                {assetType === 'GOLD' ? 'Waga (g)' : 'Ilość'}
                                            </th>

                                            <th className="px-4 py-3 text-right">
                                                {assetType === 'GOLD' ? 'Cena za g' : (assetType === 'BOND' ? 'Cena' : 'Cena zakupu')}
                                            </th>

                                            <th className="px-4 py-3 text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {parsedData.map((item, idx) => (
                                            <tr key={idx} className={item.isValid ? 'hover:bg-white/[0.08] transition-all' : 'bg-rose-500/5'}>
                                                <td className="px-6 py-4 text-white/40 font-bold tabular-nums text-xs">{item.date}</td>
                                                {assetType === 'STOCK_ETF' && <td className="px-6 py-4 text-white/60 font-black uppercase text-[10px] tracking-widest">{item.type}</td>}
                                                {assetType !== 'GOLD' && (
                                                    <td className="px-6 py-4 text-white font-bold">
                                                        {item.name}
                                                        {item.type !== 'BOND' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setInstrumentPickerIdx(idx)}
                                                                className="mt-1.5 inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest rounded-md px-2 py-1 border border-white/10 text-white/50 hover:text-emerald-300 hover:border-emerald-400/40 transition-colors"
                                                                title="Dopasuj instrument do notowań live"
                                                            >
                                                                {item.symbol
                                                                    ? <span className="text-emerald-300">{item.symbol}{item.currency ? ` · ${item.currency}` : ''}</span>
                                                                    : <span className="text-white/30">Dopasuj instrument</span>}
                                                                <Pencil size={10} />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}

                                                {/* Bond specific Rate cell */}
                                                {assetType === 'BOND' && (
                                                    <td className="px-6 py-4 text-right text-white/40 font-black tabular-nums">
                                                        {item.bondInterestRate}%
                                                    </td>
                                                )}

                                                <td className="px-6 py-4 text-right text-white/40 font-black tabular-nums">{item.quantity}</td>

                                                <td className="px-6 py-4 text-right text-white font-black tabular-nums">
                                                    {item.price.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-[10px] text-white/20 font-bold">PLN</span> {assetType === 'GOLD' ? '/g' : ''}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {item.isValid ? (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <div className="w-6 h-6 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                                                <Check size={12} className="text-emerald-500" strokeWidth={5} />
                                                            </div>
                                                            {item.status && <span className="text-[8px] text-emerald-500/60 font-black uppercase tracking-widest">{item.status}</span>}
                                                        </div>
                                                    ) : (
                                                        <div title={item.error} className="flex flex-col items-center gap-1 cursor-help">
                                                            <div className="w-6 h-6 bg-rose-500/10 rounded-full flex items-center justify-center">
                                                                <AlertCircle size={12} className="text-rose-500" strokeWidth={5} />
                                                            </div>
                                                            {item.status && <span className="text-[8px] text-rose-500/60 font-black uppercase tracking-widest">{item.status}</span>}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                </div>
            </div>
            <InstrumentSearchModal
                isOpen={instrumentPickerIdx !== null}
                onClose={() => setInstrumentPickerIdx(null)}
                onSelectInstrument={(inst) => {
                    if (instrumentPickerIdx !== null) applyInstrument(instrumentPickerIdx, { symbol: inst.symbol, currency: inst.currency, region: inst.region });
                    setInstrumentPickerIdx(null);
                }}
            />
        </Modal>
    );
}
