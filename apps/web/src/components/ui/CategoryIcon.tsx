import { Tag, ShoppingBag, Fuel, Utensils, Hammer, Monitor, Shirt, Pill, Bus, Film, Scissors, Activity, Sparkles, Plane, CreditCard, Dumbbell, FileText, Home, Coffee, Book, Briefcase, Shield, Repeat, TrendingUp, Baby, PawPrint, Dog, Cat } from 'lucide-react';

export const iconMap: Record<string, any> = {
    'tag': Tag,
    'shopping-cart': ShoppingBag,
    'fuel': Fuel,
    'utensils': Utensils,
    'hammer': Hammer,
    'monitor': Monitor,
    'shirt': Shirt,
    'pill': Pill,
    'bus': Bus,
    'film': Film,
    'scissors': Scissors,
    'activity': Activity,
    'sparkles': Sparkles,
    'plane': Plane,
    'shopping-bag': ShoppingBag,
    'credit-card': CreditCard,
    'dumbbell': Dumbbell,
    'file-text': FileText,
    'home': Home,
    'coffee': Coffee,
    'book': Book,
    'briefcase': Briefcase,
    'shield': Shield,
    'repeat': Repeat,
    'trending-up': TrendingUp,
    'baby': Baby,
    'paw-print': PawPrint,
    'dog': Dog,
    'cat': Cat,
};

interface CategoryIconProps {
    name: string | null;
    color: string;
    size?: number;
    className?: string;
}

export const CategoryIcon = ({ name, color, size = 18, className = "" }: CategoryIconProps) => {
    const IconComponent = name && iconMap[name] ? iconMap[name] : Tag;
    return (
        <div className={`flex items-center justify-center rounded-full ${className}`} style={{ color }}>
            <IconComponent size={size} />
        </div>
    );
};
