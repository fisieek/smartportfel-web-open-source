import { useCurrency } from '../../context/CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

interface CurrencySwitcherProps {
    variant?: 'default' | 'compact';
    className?: string;
}

const CURRENCY_ICONS: Record<string, string> = {
    PLN: '🇵🇱',
    EUR: '💶',
    USD: '💵',
    GBP: '💷',
    CHF: '🇨🇭',
    JPY: '💴',
};

export function CurrencySwitcher({ className = '' }: CurrencySwitcherProps) {
    const { displayCurrency, setDisplayCurrency, availableCurrencies } = useCurrency();

    return (
        <Select value={displayCurrency} onValueChange={setDisplayCurrency}>
            <SelectTrigger className={`w-auto sm:w-[140px] shrink-0 bg-white/5 border-white/10 ${className}`}>
                <SelectValue>
                    <span className="flex items-center gap-2">
                        <span>{CURRENCY_ICONS[displayCurrency] || '💰'}</span>
                        <span className="font-bold">{displayCurrency}</span>
                    </span>
                </SelectValue>
            </SelectTrigger>
            <SelectContent>
                {availableCurrencies.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                        <span className="flex items-center gap-2">
                            <span>{CURRENCY_ICONS[currency] || '💰'}</span>
                            <span>{currency}</span>
                        </span>
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
