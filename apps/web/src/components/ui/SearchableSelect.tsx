import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

interface SearchableSelectProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export default function SearchableSelect({ options, value, onChange, placeholder = "Wybierz...", className = "" }: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options based on search
    // Always include "Inne" if it's in the original options, even if it doesn't match? 
    // No, standard filtering. "Inne" is short so it's easy to type/find.
    const filteredOptions = options.filter(opt =>
        opt.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (option: string) => {
        onChange(option);
        setIsOpen(false);
        setSearch(''); // Reset search on select
    };

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div
                className="w-full bg-[#162129] border border-white/10 rounded-xl px-4 py-3 text-white flex justify-between items-center cursor-pointer hover:border-white/20 transition-colors"
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) {
                        setTimeout(() => inputRef.current?.focus(), 100);
                    }
                }}
            >
                <span className={`truncate ${!value ? 'text-gray-500' : ''}`}>
                    {value || placeholder}
                </span>
                <ChevronDown size={18} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {isOpen && (
                <div className="absolute z-[100] left-0 right-0 top-[110%] bg-[#1c2a33] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-60">
                    <div className="p-2 border-b border-white/5 sticky top-0 bg-[#1c2a33]">
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Szukaj..."
                                className="w-full bg-[#162129] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-white/40"
                                onClick={(e) => e.stopPropagation()}
                            />
                            {search && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSearch('');
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <button
                                    key={opt}
                                    className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${value === opt ? 'bg-white/10 text-white font-bold' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                                    onClick={() => handleSelect(opt)}
                                >
                                    {opt}
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center text-gray-500 text-sm">
                                Brak wyników
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
