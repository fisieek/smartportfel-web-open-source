import { Check } from "lucide-react";
import { Badge } from "./badge";

interface ImportFeatureProps {
    value: string;
    onChange: (val: string) => void;
    sampleCsv: string;
}

export function ImportFeature({ value, onChange, sampleCsv }: ImportFeatureProps) {
    return (
        <div className="w-full">
            <div className="container mx-auto">
                <div className="grid border border-white/5 rounded-[5px] container p-10 grid-cols-1 gap-12 items-start lg:grid-cols-2 bg-[#0a0a0a] shadow-2xl relative overflow-hidden group">
                    {/* Subtle gradient overlay */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />

                    <div className="flex gap-10 flex-col relative z-10 font-sans">
                        <div className="flex gap-6 flex-col">
                            <div>
                                <Badge variant="outline" className="text-emerald-500/80 border-emerald-500/20 bg-emerald-500/5 px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-black">
                                    Smart Import
                                </Badge>
                            </div>
                            <div className="flex gap-4 flex-col">
                                <p className="text-lg leading-relaxed tracking-tight text-white/40 max-w-lg text-left font-medium">
                                    Wklej dane ze swojego banku. Nasz algorytm zajmie się resztą, kategoryzując wydatki za Ciebie.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-8">
                            <div className="flex flex-row gap-6 items-start group/item">
                                <div className="mt-1 w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover/item:bg-emerald-500/20 transition-colors">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-white text-base font-bold tracking-tight">Elastyczny format</p>
                                    <p className="text-white/30 text-sm leading-relaxed">
                                        Użyj średnika lub tabulatora. Kolejność: <span className="text-white/50 font-mono italic">Kwota; Data; Sklep</span>.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-row gap-6 items-start group/item">
                                <div className="mt-1 w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover/item:bg-emerald-500/20 transition-colors">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-white text-base font-bold tracking-tight">Kategoryzacja</p>
                                    <p className="text-white/30 text-sm leading-relaxed">
                                        Kategorie zostaną dopasowane do Twoich wpływów i wydatków.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-row gap-6 items-start group/item">
                                <div className="mt-1 w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 group-hover/item:bg-emerald-500/20 transition-colors">
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <p className="text-white text-base font-bold tracking-tight">Bezpieczne dla salda</p>
                                    <p className="text-white/30 text-sm leading-relaxed">
                                        Możesz zaimportować dane jako "historyczne" bez zmiany obecnego stanu konta.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-[#0a0a0a] rounded-[5px] h-[500px] border border-white/10 flex flex-col p-1.5 shadow-2xl relative group/editor">
                        <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/editor:opacity-100 transition-opacity rounded-[5px] pointer-events-none" />
                        <textarea
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder={`Kwota; Data; Sklep\n${sampleCsv}`}
                            className="w-full h-full bg-transparent border-none rounded-[5px] p-4 sm:p-8 text-xs sm:text-sm text-white font-mono focus:outline-none placeholder:text-white/20 resize-none custom-scrollbar relative z-10 selection:bg-primary/30 line-clamp-none whitespace-pre-wrap break-words"
                            spellCheck={false}
                        />

                        {/* Decorative dots in corners */}
                        <div className="absolute top-6 right-6 flex gap-1.5 z-20">
                            <div className="w-2 h-2 rounded-full bg-white/5" />
                            <div className="w-2 h-2 rounded-full bg-white/5" />
                            <div className="w-2 h-2 rounded-full bg-white/5" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
