import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Check, AlertCircle, Loader2, Sparkles, Database, Upload, FileSpreadsheet, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from './ui/Modal';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import { ImportFeature } from './ui/ImportFeature';
import {
    parseFileToGrid,
    detectColumnsHeuristic,
    mapGridToTransactions,
    sampleForAI,
    type ColumnMapping,
    type NormalizedTxn,
} from '../lib/statementParser';
import { SUPPORTED_CURRENCIES } from '../lib/currencies';
import { usePersonalAccounts, useCategories, type PersonalAccount, type Category, type Store } from '../hooks/useQueries';
import { useCategorization } from '../hooks/useCategorization';
import ImportStoreCell from './inline/ImportStoreCell';
import './import-modal.css';

interface TransactionImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    accounts?: PersonalAccount[];
    categories?: Category[];
}

interface ParsedTransaction {
    amount: number;
    date: string;
    isoDate?: string;
    store: string;
    type: 'expense' | 'income';
    categoryId?: number;
    categoryName?: string;
    currency?: string;
    isValid: boolean;
    error?: string;
}

/** Normalizuje kod waluty (uppercase/trim); pusty → undefined (serwer domyśla PLN). */
const normalizeCurrency = (c?: string): string | undefined => {
    const up = (c ?? '').trim().toUpperCase();
    return up || undefined;
};

const SAMPLE_CSV = `150.50; 2024-01-15; Biedronka
89.99; 2024-01-16; Lidl
250.00; 2024-01-17; Kaufland`;

export default function TransactionImportModal({ isOpen, onClose, onSuccess, accounts: initialAccounts, categories: initialCategories }: TransactionImportModalProps) {
    const [step, setStep] = useState<'input' | 'preview'>('input');
    const [rawText, setRawText] = useState('');
    const [parsedData, setParsedData] = useState<ParsedTransaction[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState({ current: 0, total: 0 });
    const [isParsingFile, setIsParsingFile] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // BYOK: jedyne, co nas interesuje, to czy użytkownik ma zapisany klucz AI.
    const [hasAiKey, setHasAiKey] = useState<boolean | null>(null);
    const { success: toastSuccess, error: toastError } = useToast();
    const { findCategoryByStore } = useCategorization();

    // TanStack Query hooks - dane z cache (użyj jeśli nie przekazano props)
    const { data: cachedAccounts = [] } = usePersonalAccounts();
    const { data: cachedCategories = [] } = useCategories();

    // Użyj props jeśli przekazane, inaczej użyj cache
    const accounts = useMemo(() =>
        (initialAccounts && initialAccounts.length > 0) ? initialAccounts : cachedAccounts,
        [initialAccounts, cachedAccounts]
    );
    const categories = useMemo(() =>
        (initialCategories && initialCategories.length > 0) ? initialCategories : cachedCategories,
        [initialCategories, cachedCategories]
    );

    // Fetch AI stats on open
    useEffect(() => {
        if (isOpen) {
            fetchAiKeyStatus();
        }
    }, [isOpen]);

    const fetchAiKeyStatus = async () => {
        try {
            const res = await api.get('/ai/key');
            setHasAiKey(Boolean(res.data?.configured));
        } catch {
            setHasAiKey(false);
        }
    };

    if (!isOpen) return null;

    const parseDateInput = (str: string) => {
        if (!str) return null;
        const trimmed = str.trim();
        const dmy = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
        if (dmy) {
            return new Date(parseInt(dmy[3]), parseInt(dmy[2]) - 1, parseInt(dmy[1]));
        }
        const d = new Date(trimmed);
        return isNaN(d.getTime()) ? null : d;
    };


    const parseLine = (line: string): ParsedTransaction | null => {
        if (!line.trim()) return null;
        const parts = line.split(/[\t;]/).map(p => p.trim());

        if (parts.length < 3) return null;
        const [amountStr, dateStr, store] = parts;

        // Skip header rows
        if (amountStr.toLowerCase().includes('kwota') || dateStr.toLowerCase().includes('data')) {
            return null;
        }

        const amount = parseFloat(amountStr.replace(',', '.').replace(/\s/g, ''));
        const date = parseDateInput(dateStr);

        if (!date || isNaN(amount)) {
            return {
                amount: amount || 0,
                date: dateStr,
                store: store || '',
                type: 'expense',
                isValid: false,
                error: isNaN(amount) ? 'Błędna kwota' : 'Błędna data'
            };
        }

        const categorization = findCategoryByStore(store);
        const categoryId = categorization?.id;
        const finalStore = categorization?.normalizedStore || store;
        const isIncome = categorization?.isIncome || false;
        const categoryName = isIncome ? 'Wpływ' : categories.find(c => c.id === categoryId)?.name;

        return {
            amount: Math.abs(amount), // Always treat value as positive in UI preview, backend handles sign
            date: dateStr,
            isoDate: date.toISOString(),
            store: finalStore,
            type: isIncome ? 'income' : 'expense',
            categoryId,
            categoryName,
            isValid: true
        };
    };

    const handlePreview = () => {
        const lines = rawText.trim().split('\n');
        const data = lines
            .map(parseLine)
            .filter((item): item is ParsedTransaction => item !== null);

        if (data.length === 0) {
            toastError('Nie znaleziono danych. Sprawdź format.');
            return;
        }

        setParsedData(data);
        setStep('preview');
        // Don't auto-select account - let user choose or leave empty for historical data
    };

    // Konwersja znormalizowanej transakcji z pliku na wiersz podglądu (z lokalną kategoryzacją).
    const normalizedToParsed = (t: NormalizedTxn): ParsedTransaction => {
        const categorization = findCategoryByStore(t.rawDescription);
        const categoryId = categorization?.id;
        const finalStore = categorization?.normalizedStore || t.rawDescription;
        const isIncome = t.type === 'income' || categorization?.isIncome || false;
        const categoryName = isIncome ? 'Wpływ' : categories.find(c => c.id === categoryId)?.name;
        const currency = normalizeCurrency(t.currency);
        const currencyValid = !currency || SUPPORTED_CURRENCIES.includes(currency);
        return {
            amount: t.amount,
            date: t.isoDate ? new Date(t.isoDate).toLocaleDateString('pl-PL') : t.date,
            isoDate: t.isoDate,
            store: finalStore,
            type: isIncome ? 'income' : 'expense',
            categoryId,
            categoryName,
            currency,
            isValid: t.valid && currencyValid,
            error: !currencyValid ? `Nieobsługiwana waluta: ${currency}` : t.error,
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
            if (name.endsWith('.pdf')) {
                // PDF handling via backend AI endpoint
                const formData = new FormData();
                formData.append('file', file);
                formData.append('importType', 'EXPENSE');

                const res = await api.post('/ai/parse-pdf', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                const fetchedTransactions = res.data?.data?.transactions || [];
                if (fetchedTransactions.length === 0) {
                    toastError('AI nie wykryło żadnych transakcji w tym pliku PDF.');
                    return;
                }

                const parsed = fetchedTransactions.map((t: any): ParsedTransaction => {
                    const dateObj = parseDateInput(t.date);
                    
                    // Automatyczna pre-kategoryzacja po nazwie ze sklepu
                    const categorization = findCategoryByStore(t.store);
                    const categoryId = categorization?.id;
                    const finalStore = categorization?.normalizedStore || t.store;
                    const isIncome = t.type === 'income' || categorization?.isIncome || false;
                    const categoryName = isIncome ? 'Wpływ' : categories.find(c => c.id === categoryId)?.name;
                    const currency = normalizeCurrency(t.currency);
                    const currencyValid = !currency || SUPPORTED_CURRENCIES.includes(currency);

                    return {
                        amount: Math.abs(t.amount),
                        date: dateObj ? dateObj.toLocaleDateString('pl-PL') : t.date,
                        isoDate: dateObj ? dateObj.toISOString() : undefined,
                        store: finalStore,
                        type: isIncome ? 'income' : 'expense',
                        categoryId,
                        categoryName,
                        currency,
                        isValid: !!dateObj && currencyValid,
                        error: !dateObj ? 'Błędna data z AI' : (!currencyValid ? `Nieobsługiwana waluta: ${currency}` : undefined)
                    };
                });

                setParsedData(parsed);
                setStep('preview');
                return;
            }

            // Standard CSV / Excel handling
            const grid = await parseFileToGrid(file);
            if (grid.rows.length === 0) {
                toastError('Plik wygląda na pusty lub nie udało się go odczytać.');
                return;
            }

            let mapping: ColumnMapping | null = detectColumnsHeuristic(grid).mapping;

            // Fallback AI, gdy heurystyka nie rozpozna układu kolumn.
            if (!mapping) {
                try {
                    const { data } = await api.post('/ai/detect-columns', sampleForAI(grid));
                    const m = data.mapping;
                    mapping = {
                        date: m.dateColumn,
                        description: m.descriptionColumn,
                        ...(m.amountColumn != null ? { amount: m.amountColumn } : {}),
                        ...(m.debitColumn != null ? { debit: m.debitColumn } : {}),
                        ...(m.creditColumn != null ? { credit: m.creditColumn } : {}),
                        ...(m.currencyColumn != null ? { currency: m.currencyColumn } : {}),
                    };
                    fetchAiKeyStatus();
                } catch (err: any) {
                    toastError(err.response?.data?.message || 'Nie udało się rozpoznać kolumn pliku.');
                    return;
                }
            }

            const normalized = mapGridToTransactions(grid, mapping);
            const parsed = normalized.map(normalizedToParsed);
            if (parsed.length === 0) {
                toastError('Nie znaleziono transakcji w pliku.');
                return;
            }
            setParsedData(parsed);
            setStep('preview');
        } catch (err) {
            console.error('Błąd parsowania pliku:', err);
            toastError('Nie udało się odczytać pliku. Sprawdź format (CSV/Excel).');
        } finally {
            setIsParsingFile(false);
        }
    };

    const handleAIAnalysis = async () => {
        setIsAnalyzing(true);

        // Filter only transactions that don't have a category assigned yet
        const uncategorizedIndices: number[] = [];
        const uncategorizedStores: string[] = [];

        parsedData.forEach((item, index) => {
            if (!item.categoryId) {
                uncategorizedIndices.push(index);
                uncategorizedStores.push(item.store);
            }
        });

        const total = uncategorizedStores.length;

        // If all transactions already have categories, skip AI
        if (total === 0) {
            toastSuccess('Wszystkie transakcje mają już przypisane kategorie');
            setIsAnalyzing(false);
            return;
        }

        setAnalysisProgress({ current: 0, total });

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        try {
            const BATCH_SIZE = 25; // mniej zapytań = mniejsze ryzyko rate-limitu (RPM) darmowego AI
            const currentData = [...parsedData];

            for (let i = 0; i < uncategorizedStores.length; i += BATCH_SIZE) {
                const chunk = uncategorizedStores.slice(i, i + BATCH_SIZE);
                const chunkIndices = uncategorizedIndices.slice(i, i + BATCH_SIZE);
                setAnalysisProgress({ current: i, total });

                let batchSuccess = false;
                let attempts = 0;
                const maxAttempts = 3;

                while (!batchSuccess && attempts < maxAttempts) {
                    try {
                        const response = await api.post('/ai/map-transactions', { transactions: chunk });

                        // Handle new response format with mappings and metadata
                        const responseData = response.data;
                        const mappingsArray = responseData.mappings || responseData; // Backward compat

                        const mapping: Record<string, { store: string; category: string }> = {};
                        mappingsArray.forEach((item: any) => {
                            // Store with lowercase key for case-insensitive matching
                            mapping[item.original?.toLowerCase?.() || ''] = { store: item.store, category: item.category };
                        });

                        // Update currentData with results from this batch
                        const fallbackCategory = categories.find(c => c.name === 'Inne');

                        // Use chunkIndices to map back to original parsedData indices
                        // Only process up to the number of items the backend actually processed
                        const processedInBatch = responseData.processedCount ?? chunk.length;
                        for (let k = 0; k < processedInBatch; k++) {
                            const originalIndex = chunkIndices[k];
                            const originalStore = chunk[k];
                            // Try case-insensitive match
                            const aiMatch = mapping[originalStore.toLowerCase()];

                            if (aiMatch) {
                                // Try exact category match first, then case-insensitive
                                let category = categories.find(c => c.name === aiMatch.category);
                                if (!category) {
                                    category = categories.find(c => c.name.toLowerCase() === aiMatch.category?.toLowerCase());
                                }
                                // Fallback to 'Inne' if no category found
                                if (!category) {
                                    category = fallbackCategory;
                                }

                                currentData[originalIndex] = {
                                    ...currentData[originalIndex],
                                    store: aiMatch.store || originalStore,
                                    categoryId: category ? category.id : currentData[originalIndex].categoryId,
                                    categoryName: category ? category.name : currentData[originalIndex].categoryName
                                };
                            } else {
                                // No AI match found - use fallback category 'Inne'
                                if (fallbackCategory && !currentData[originalIndex].categoryId) {
                                    currentData[originalIndex] = {
                                        ...currentData[originalIndex],
                                        categoryId: fallbackCategory.id,
                                        categoryName: fallbackCategory.name
                                    };
                                }
                            }
                        }

                        // SAVE PROGRESS IMMEDIATELY after each batch
                        setParsedData([...currentData]);
                        batchSuccess = true;

                    } catch (err: any) {
                        // 402 = brak/nieczytelny klucz AI. Ponawianie nic nie da — zachowaj
                        // dotychczasowy postęp i powiedz wprost, czego brakuje.
                        if (err.response?.status === 402) {
                            setAnalysisProgress({ current: total, total });
                            toastError(err.response?.data?.message || 'Funkcje AI wymagają Twojego klucza API. Dodaj go w Ustawieniach.');
                            return;
                        }
                        // Rate-limit po stronie DOSTAWCY (klucz użytkownika): nie ma sensu ponawiać
                        // ani lecieć dalej — zachowaj postęp i wyjdź czysto.
                        if (err.response?.status === 429) {
                            setAnalysisProgress({ current: total, total });
                            toastError(`Dostawca AI zwrócił limit zapytań. Skategoryzowano ${i} z ${total} — pozostałe ustaw ręcznie lub dokończ później.`);
                            return;
                        }
                        attempts++;
                        console.warn(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed (Attempt ${attempts}/${maxAttempts}):`, err.message);
                        if (attempts >= maxAttempts) throw err;
                        await sleep(1000 * attempts); // Exponential backoff
                    }
                }

                if (i + BATCH_SIZE < uncategorizedStores.length) {
                    await sleep(300); // Small cooldown between batches
                }
            }

            setAnalysisProgress({ current: total, total });
            toastSuccess('Analiza AI zakończona pomyślnie');
        } catch (err: any) {
            console.error('AI Analysis failed:', err);
            let errorMsg = err.response?.data?.details || err.response?.data?.message || err.message || 'Błąd sieci lub konfiguracji';

            if (err.response?.status === 400 && errorMsg.includes('Missing')) {
                errorMsg = 'Brak konfiguracji AI w pliku .env serwera (wymagany klucz OpenAI lub Gateway)';
            }

            // Sync stats on error to reflect current usage if limit was reached

            toastError(`Błąd AI: ${errorMsg}. Postęp został zachowany.`);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleImport = async () => {
        setIsSubmitting(true);
        const validItems = parsedData.filter(i => i.isValid);

        try {
            const payload = {
                transactions: validItems.map(item => ({
                    type: item.type,
                    amount: Math.abs(item.amount),
                    description: item.store,
                    date: item.isoDate,
                    personalAccountId: selectedAccountId || null,
                    store: item.store,
                    categoryId: item.categoryId || undefined,
                    ...(item.currency ? { currency: item.currency } : {})
                }))
            };

            await api.post('/expenses/bulk', payload);
            toastSuccess(`Zaimportowano ${validItems.length} transakcji`);
            onSuccess();
            onClose();
            setRawText('');
            setStep('input');
        } catch (error: any) {
            console.error('Błąd importu:', error);
            toastError(error.response?.data?.error || 'Wystąpił błąd podczas importu');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Ręczny wybór sklepu w podglądzie — kategoria idzie za sklepem (store.category),
    // bez wywołań API (wiersze nie są jeszcze zapisane).
    const updateRowStore = (idx: number, store: Store) => {
        setParsedData(prev => prev.map((row, i) => i === idx ? {
            ...row,
            store: store.name,
            categoryId: store.category?.id ?? row.categoryId,
            categoryName: store.category?.name ?? row.categoryName,
        } : row));
    };

    // Kolor kategorii (chipy w podglądzie) — z listy kategorii po id.
    const categoryColor = (id?: number): string | undefined =>
        id != null ? categories.find(c => c.id === id)?.color : undefined;

    // Styl chipa kategorii w kolorze kategorii (z półprzezroczystym tłem/obwódką).
    const catChipStyle = (id?: number): CSSProperties | undefined => {
        const c = categoryColor(id);
        return c ? { backgroundColor: `${c}22`, color: c, borderColor: `${c}55` } : undefined;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Import wyciągu"
            subtitle={step === 'input' ? 'CSV · XLSX · PDF — wrzuć wyciąg z banku' : `${parsedData.filter(i => i.isValid).length} z ${parsedData.length} gotowych do importu`}
            maxWidth={step === 'input' ? 'max-w-2xl' : 'max-w-4xl'}
            variant="clean"
            showHeader
            footer={step === 'input' ? (
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] transition-all">Anuluj</button>
                    <button onClick={handlePreview} disabled={!rawText} className="im-btn-primary px-8 sm:px-12 py-3.5 text-[10px] uppercase tracking-widest w-full sm:w-auto">Podgląd danych</button>
                </div>
            ) : (
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button onClick={() => setStep('input')} className="px-6 py-3 text-white/40 hover:text-white font-black uppercase tracking-widest text-[10px] transition-all">← Wróć do edycji</button>
                    <button onClick={handleImport} disabled={isSubmitting} className="im-btn-primary px-8 sm:px-12 py-3.5 text-[10px] uppercase tracking-widest w-full sm:w-auto">
                        {isSubmitting ? 'Importowanie...' : `Potwierdź import (${parsedData.filter(i => i.isValid).length})`}
                    </button>
                </div>
            )}
        >
            <div className="im-scope relative">
                {/* Aurora — pas u góry modala (premium, LandingV2) */}
                <div className="im-aurora" aria-hidden="true">
                    <div className="im-aurora__blob im-aurora__blob--1" />
                    <div className="im-aurora__blob im-aurora__blob--2" />
                    <div className="im-aurora__blob im-aurora__blob--3" />
                </div>
                {step === 'input' ? (
                    <div className="relative z-10 px-4 sm:px-6 py-2 space-y-6">
                            {/* Upload pliku z banku (główny sposób) */}
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
                                className={`im-dropzone cursor-pointer p-12 text-center ${isDragging ? 'im-dropzone--drag' : ''}`}
                            >
                                {isParsingFile ? (
                                    <div className="flex flex-col items-center gap-3 text-white/60">
                                        <Loader2 size={30} className="animate-spin text-emerald-400" />
                                        <span className="text-sm font-bold">Czytam plik...</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400/20 to-cyan-400/10 border border-white/10 flex items-center justify-center shadow-[0_8px_30px_rgba(52,211,153,0.15)]">
                                            <Upload size={26} className="text-emerald-300" />
                                        </div>
                                        <div>
                                            <p className="im-gradient-text font-black text-xl tracking-tight">Wrzuć wyciąg z banku</p>
                                            <p className="text-white/45 text-sm mt-1.5">Przeciągnij plik lub kliknij — system sam rozpozna kolumny i kategorie</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-white/30 font-bold uppercase tracking-widest mt-1">
                                            <FileSpreadsheet size={12} /> CSV · XLSX · PDF
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Alternatywa: wklejanie tekstu */}
                            <details className="group">
                                <summary className="cursor-pointer text-white/40 hover:text-white/70 text-[11px] font-black uppercase tracking-widest transition-colors list-none flex items-center gap-2">
                                    <span className="text-emerald-400 group-open:rotate-90 transition-transform">›</span> Lub wklej dane ręcznie
                                </summary>
                                <div className="mt-4">
                                    <ImportFeature value={rawText} onChange={setRawText} sampleCsv={SAMPLE_CSV} />
                                </div>
                            </details>
                        </div>
                ) : (
                    <>
                        {/* Toolbar — przypięty (sticky), zostaje widoczny przy przewijaniu tabeli */}
                        <div className="sticky top-0 z-20 px-4 sm:px-5 pt-3 pb-3 bg-[#0a0a0a]/85 backdrop-blur-xl">
                            <div className="im-glow-card flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-5 p-4 sm:p-5">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                                    <div className="flex flex-col gap-2 w-full sm:min-w-[240px]">
                                        <span className="text-[10px] text-white/30 font-black uppercase tracking-widest ml-1">Konto docelowe</span>
                                        <div className="relative group w-full">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover:text-emerald-300 transition-colors">
                                                <Database size={16} />
                                            </div>
                                            <select
                                                value={selectedAccountId}
                                                onChange={(e) => setSelectedAccountId(e.target.value)}
                                                className="w-full pl-11 pr-10 py-3.5 bg-[#0a0a0a]/80 border border-white/10 rounded-2xl text-white font-bold text-sm focus:outline-none focus:border-emerald-400 transition-all appearance-none cursor-pointer text-ellipsis"
                                            >
                                                <option value="" className="bg-[#0a0a0a]">Brak konta (historyczne)</option>
                                                {accounts.map(acc => (
                                                    <option key={acc.id} value={acc.id} className="bg-[#0a0a0a]">{acc.name} ({acc.bank})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-stretch sm:items-end gap-3 w-full lg:w-auto">
                                    <div className="flex flex-col items-stretch sm:items-end gap-1.5 w-full sm:max-w-[280px]">
                                        {hasAiKey === false ? (
                                            /* Brak jakiejkolwiek ścieżki do AI — mówimy o tym OD RAZU,
                                               zamiast pozwolić kliknąć i dopiero wtedy pokazać błąd. */
                                            <>
                                                <span className="text-[10px] text-white/40 font-medium text-center sm:text-right leading-tight pr-1">
                                                    Automatyczna kategoryzacja wymaga Twojego klucza API.
                                                    Import bez niej działa normalnie.
                                                </span>
                                                <Link
                                                    to="/dashboard/settings"
                                                    onClick={onClose}
                                                    className="flex items-center justify-center gap-2.5 px-6 sm:px-10 py-3 rounded-full text-xs font-black uppercase tracking-widest w-full bg-white/5 text-white/80 border border-white/15 hover:bg-white/10 active:scale-95 transition-all"
                                                >
                                                    <KeyRound size={16} />
                                                    <span className="whitespace-nowrap">Dodaj klucz AI</span>
                                                </Link>
                                            </>
                                        ) : (
                                            <button
                                                onClick={handleAIAnalysis}
                                                disabled={isAnalyzing || isSubmitting}
                                                className="flex items-center justify-center gap-2.5 px-6 sm:px-10 py-3 rounded-full text-xs font-black uppercase tracking-widest w-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-400/25 active:scale-95 transition-all disabled:opacity-40"
                                            >
                                                {isAnalyzing ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin" />
                                                        <span className="whitespace-nowrap">Smart-analiza ({analysisProgress.current}/{analysisProgress.total})...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={18} />
                                                        <span className="whitespace-nowrap">Smart-analiza</span>
                                                    </>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Tabela — JEDYNY przewijany obszar (scroll modala) */}
                        <div className="relative z-10 px-4 sm:px-5 pb-2">
                            <div className="im-glow-card overflow-hidden">
                                    {/* Mobile Card View */}
                                    <div className="sm:hidden divide-y divide-white/5">
                                        {parsedData.map((item, idx) => (
                                            <div key={idx} className={`p-4 ${item.isValid ? 'bg-transparent' : 'bg-rose-500/5'} flex flex-col gap-3 relative`}>
                                                <div className="flex justify-between items-start">
                                                    <div className="flex flex-col gap-1 min-w-0 flex-1 pr-4">
                                                        <span className="text-[10px] text-white/30 font-bold">{item.date}</span>
                                                        <ImportStoreCell
                                                            store={item.store}
                                                            editable={item.isValid && item.type === 'expense'}
                                                            onPick={(s) => updateRowStore(idx, s)}
                                                            className="text-white font-bold text-sm leading-tight"
                                                        />
                                                        {item.type === 'income' && (
                                                            <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mt-0.5">Przychód</span>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`text-sm font-black tabular-nums ${item.type === 'income' ? 'text-emerald-400' : 'text-white'}`}>
                                                            {item.type === 'income' ? '+' : ''}{item.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} <span className="text-[10px] text-white/30 font-normal">{item.currency || 'PLN'}</span>
                                                        </span>
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            {item.categoryName ? (
                                                                <span
                                                                    className="inline-flex px-2 py-0.5 text-[9px] font-black rounded-md uppercase tracking-tight border border-white/10 bg-white/5 text-white"
                                                                    style={catChipStyle(item.categoryId)}
                                                                >
                                                                    {item.categoryName}
                                                                </span>
                                                            ) : (
                                                                <span className="text-white/10 italic text-[9px]">Brak</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Status Overlay Icon */}
                                                {!item.isValid && (
                                                    <div className="absolute top-2 right-2 text-rose-500">
                                                        <AlertCircle size={14} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Desktop Table View */}
                                    <table className="hidden sm:table w-full text-sm text-left border-collapse table-fixed">
                                        <thead className="text-[9px] text-white/20 font-black uppercase bg-white/5 backdrop-blur-xl tracking-widest border-b border-white/5">
                                            <tr>
                                                <th className="px-8 py-4 w-[110px]">Data</th>
                                                <th className="px-8 py-4">Opis / Sklep</th>
                                                <th className="px-8 py-4 w-[140px]">Kategoria</th>
                                                <th className="px-8 py-4 text-right w-[130px]">Kwota</th>
                                                <th className="px-8 py-4 text-center w-[100px]">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {parsedData.map((item, idx) => (
                                                <tr key={idx} className={`${item.isValid ? 'hover:bg-white/[0.08]' : 'bg-rose-500/5'} transition-all group`}>
                                                    <td className="px-8 py-5 text-white/20 font-bold tabular-nums text-[10px] tracking-tight">{item.date}</td>
                                                    <td className="px-8 py-5">
                                                        <ImportStoreCell
                                                            store={item.store}
                                                            editable={item.isValid && item.type === 'expense'}
                                                            onPick={(s) => updateRowStore(idx, s)}
                                                            className="text-white font-bold text-xs leading-tight"
                                                        />
                                                        {item.type === 'income' && (
                                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                                                                <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Przychód</span>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        {item.categoryName ? (
                                                            <span
                                                                className="inline-flex px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-tight border border-white/10 bg-white/5 text-white"
                                                                style={catChipStyle(item.categoryId)}
                                                            >
                                                                {item.categoryName}
                                                            </span>
                                                        ) : (
                                                            <span className="text-white/10 italic text-[10px] font-bold">Autodetekcja...</span>
                                                        )}
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <span className={`text-white font-black tabular-nums text-xs ${item.type === 'income' ? 'text-emerald-400' : ''}`}>
                                                            {item.type === 'income' ? '+' : ''}{item.amount.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                                                        </span>
                                                        <span className="text-[10px] text-white/20 ml-1.5 font-bold">{item.currency || 'PLN'}</span>
                                                    </td>
                                                    <td className="px-8 py-5 text-center">
                                                        {item.isValid ? (
                                                            <div className="w-7 h-7 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto transition-all group-hover:scale-110">
                                                                <Check size={14} className="text-emerald-500" strokeWidth={5} />
                                                            </div>
                                                        ) : (
                                                            <div title={item.error} className="w-7 h-7 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto cursor-help group-hover:animate-bounce">
                                                                <AlertCircle size={14} className="text-rose-500" strokeWidth={5} />
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
            </div>
        </Modal>
    );
}
