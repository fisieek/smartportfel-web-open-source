import React from 'react';
import { CategoryIcon } from './CategoryIcon';
import {
    Briefcase, Home, Zap, Wifi, CreditCard, ShoppingCart, Utensils, Heart,
    GraduationCap, Gift, HelpCircle, Fuel, Hammer, Monitor, Shirt, Pill, Bus,
    Clapperboard, Sparkles, Stethoscope, ShoppingBag, Globe, ShoppingBasket, Smartphone,
    Dumbbell, Receipt, Beer, ShieldCheck, ArrowRightLeft
} from 'lucide-react';

interface CategoryBadgeProps {
    name: string;
    color?: string;
    icon?: string | null;
    iconSize?: number;
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
}

export const getCategoryDefaultColor = (categoryName: string) => {
    const name = categoryName?.toLowerCase() || '';
    if (name.includes('wypłata') || name.includes('wpływ')) return '#2ecc71'; // Zielony dla wpływów
    if (name.includes('opłata stała') || name.includes('wydatek')) return '#10b981'; // Szmaragdowy dla wydatków
    return '#2DD4BF'; // Domyślny turkus
};

export const getCategoryIcon = (categoryName: string) => {
    const name = categoryName?.toLowerCase() || '';
    if (name.includes('wypłata') || name.includes('praca') || name.includes('działalność') || name.includes('wpływ')) return Briefcase;
    if (name.includes('mieszkanie') || name.includes('dom') || name.includes('czynsz')) return Home;
    if (name.includes('prąd') || name.includes('gaz') || name.includes('energia')) return Zap;
    if (name.includes('internet') || name.includes('telefon') || name.includes('tv') || name.includes('komórka')) return Wifi;
    if (name.includes('kredyt') || name.includes('bank') || name.includes('rata')) return CreditCard;
    if (name.includes('spożywcze') || name.includes('biedronka') || name.includes('lidl')) return ShoppingCart;
    if (name.includes('restauracja') || name.includes('jedzenie') || name.includes('pyszne')) return Utensils;
    if (name.includes('paliwo') || name.includes('stacja')) return Fuel;
    if (name.includes('budowlane') || name.includes('remont') || name.includes('castorama')) return Hammer;
    if (name.includes('elektronika') || name.includes('sprzęt')) return Monitor;
    if (name.includes('ubrania') || name.includes('buty') || name.includes('odzież')) return Shirt;
    if (name.includes('apteka') || name.includes('lek')) return Pill;
    if (name.includes('transport') || name.includes('bus') || name.includes('mpk')) return Bus;
    if (name.includes('rozrywka') || name.includes('kino') || name.includes('netflix')) return Clapperboard;
    if (name.includes('beauty') || name.includes('fryzjer') || name.includes('kosmetyczka')) return Sparkles;
    if (name.includes('zdrowie') || name.includes('lekarz') || name.includes('stomatolog')) return Stethoscope;
    if (name.includes('drogeria') || name.includes('kosmetyki') || name.includes('rossmann')) return ShoppingBag;
    if (name.includes('podróż') || name.includes('wakacje')) return Globe;
    if (name.includes('internetowe') || name.includes('allegro') || name.includes('amazon')) return ShoppingBasket;
    if (name.includes('abonament') || name.includes('smartphone')) return Smartphone;
    if (name.includes('sport') || name.includes('siłownia') || name.includes('fitness')) return Dumbbell;
    if (name.includes('opłaty') || name.includes('rachunek')) return Receipt;
    if (name.includes('napoje') || name.includes('bar') || name.includes('beer')) return Beer;
    if (name.includes('edukacja') || name.includes('szkoła') || name.includes('kurs')) return GraduationCap;
    if (name.includes('ubezpieczenia') || name.includes('polisa')) return ShieldCheck;
    if (name.includes('transfer') || name.includes('przelew')) return ArrowRightLeft;
    if (name.includes('prezent')) return Gift;
    if (name.includes('zdrowie')) return Heart;
    return HelpCircle;
};

const formatCategoryName = (name: string) => {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
};

const CategoryBadge: React.FC<CategoryBadgeProps & { small?: boolean }> = ({ name, color, icon, iconSize, small = false, className = '', onClick }) => {
    // Fałszywy alarm lintera — jak w FamilyCard: `getCategoryIcon` tylko WYBIERA gotową
    // ikonę lucide po nazwie kategorii, nie tworzy nowego komponentu.
    // eslint-disable-next-line react-hooks/static-components
    const Icon = getCategoryIcon(name);
    const formattedName = formatCategoryName(name);
    const finalColor = color || getCategoryDefaultColor(name);
    const size = iconSize || (small ? 10 : 12);

    return (
        <div
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'} rounded font-medium border ${onClick ? 'cursor-pointer hover:brightness-125 transition-all' : ''} ${className}`}
            style={{
                backgroundColor: `${finalColor}15`,
                color: finalColor,
                borderColor: `${finalColor}30`
            }}
        >
            {icon ? (
                <CategoryIcon name={icon} color={finalColor} size={size} />
            ) : (
                // eslint-disable-next-line react-hooks/static-components
                <Icon size={size} />
            )}
            <span className={small ? 'leading-none' : ''}>{formattedName}</span>
        </div>
    );
};

export default CategoryBadge;
