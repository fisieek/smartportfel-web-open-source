import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, AlertCircle, ChevronRight, ChevronDown, ShoppingBag, Lock } from 'lucide-react';
import api from '../lib/api';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ui/ConfirmModal';
import { iconMap } from '../components/ui/CategoryIcon';
import CategoryBadge from '../components/ui/CategoryBadge';

interface Store {
    id: string;
    name: string;
    categoryId: number;
}

interface Category {
    id: number;
    name: string;
    color: string;
    description: string | null;
    icon: string | null;
    userId: string | null;
    stores?: Store[];
    isSystemCategory?: boolean;
}

export default function CategorySettings() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCategory, setExpandedCategory] = useState<number | null>(null);
    const { showToast } = useToast();

    // Custom Category Form
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [catName, setCatName] = useState('');
    const [catColor, setCatColor] = useState('#EF4444');
    const [catIcon, setCatIcon] = useState('tag');

    // Store Form
    const [newStoreName, setNewStoreName] = useState('');
    const [addingStoreTo, setAddingStoreTo] = useState<number | null>(null);

    // Delete confirmation
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'category' | 'store', id: string | number, name: string } | null>(null);

    const getSystemStores = (description: string | null): string[] => {
        if (!description) return [];
        return description.split(',').map(s => s.trim()).filter(Boolean);
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const res = await api.get('/categories');
            // Sort categories: system first, then custom
            const sorted = res.data.sort((a: Category, b: Category) => {
                if (a.userId === null && b.userId !== null) return -1;
                if (a.userId !== null && b.userId === null) return 1;
                return a.name.localeCompare(b.name);
            });
            setCategories(sorted);
        } catch {
            showToast('Nie udało się pobrać kategorii', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchStores = async (categoryId: number) => {
        try {
            const res = await api.get(`/stores/category/${categoryId}`);
            setCategories(prev => prev.map(c =>
                c.id === categoryId ? { ...c, stores: res.data } : c
            ));
        } catch {
            showToast('Nie udało się pobrać sklepów', 'error');
        }
    };

    const handleToggleExpand = (categoryId: number) => {
        if (expandedCategory === categoryId) {
            setExpandedCategory(null);
        } else {
            setExpandedCategory(categoryId);
            const cat = categories.find(c => c.id === categoryId);
            if (cat && !cat.stores) {
                fetchStores(categoryId);
            }
        }
    };

    const handleAddCategory = async () => {
        if (!catName.trim()) return;
        try {
            await api.post('/categories', { name: catName, color: catColor, icon: catIcon });
            showToast('Kategoria dodana!', 'success');
            setIsAddingCategory(false);
            setCatName('');
            fetchCategories();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Błąd dodawania kategorii', 'error');
        }
    };

    const handleUpdateCategory = async () => {
        if (!editingCategory || !catName.trim()) return;
        try {
            await api.put(`/categories/${editingCategory.id}`, { name: catName, color: catColor, icon: catIcon });
            showToast('Kategoria zaktualizowana!', 'success');
            setEditingCategory(null);
            setCatName('');
            fetchCategories();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Błąd aktualizacji kategorii', 'error');
        }
    };

    const handleDeleteCategory = async (id: number) => {
        try {
            await api.delete(`/categories/${id}`);
            showToast('Kategoria usunięta', 'success');
            setConfirmDelete(null);
            fetchCategories();
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Nie można usunąć kategorii (może być używana w wydatkach)', 'error');
        }
    };

    const handleAddStore = async (categoryId: number) => {
        if (!newStoreName.trim()) return;
        try {
            await api.post('/stores', { name: newStoreName, categoryId });
            showToast('Sklep dodany!', 'success');
            setNewStoreName('');
            setAddingStoreTo(null);
            fetchStores(categoryId);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Błąd dodawania sklepu', 'error');
        }
    };

    const handleDeleteStore = async (storeId: string, categoryId: number) => {
        try {
            await api.delete(`/stores/${storeId}`);
            showToast('Sklep usunięty', 'success');
            setConfirmDelete(null);
            fetchStores(categoryId);
        } catch (error: any) {
            showToast(error.response?.data?.message || 'Nie można usunąć sklepu (może być używany w wydatkach)', 'error');
        }
    };

    const startEditing = (cat: Category) => {
        setEditingCategory(cat);
        setCatName(cat.name);
        setCatColor(cat.color);
        setCatIcon(cat.icon || 'tag');
        setIsAddingCategory(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Kategorie i Sklepy</h2>
                    <p className="text-gray-400 text-sm">Zarządzaj swoimi kategoriami wydatków i przypisanymi do nich sklepami.</p>
                </div>
                {!isAddingCategory && !editingCategory && (
                    <button
                        onClick={() => setIsAddingCategory(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-[5px] hover:bg-primary/20 transition-all font-bold text-sm"
                    >
                        <Plus size={18} />
                        Dodaj kategorię
                    </button>
                )}
            </div>

            {/* Category Form (Add/Edit) */}
            {(isAddingCategory || editingCategory) && (
                <div className="bg-surface border border-white/10 rounded-[5px] p-6 shadow-card animate-in fade-in slide-in-from-top-4 duration-300">
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        {isAddingCategory ? <Plus size={20} className="text-primary" /> : <Edit2 size={20} className="text-primary" />}
                        {isAddingCategory ? 'Nowa kategoria' : `Edytuj: ${editingCategory?.name}`}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Nazwa (maks. 25 znaków)</label>
                            <input
                                type="text"
                                value={catName}
                                onChange={(e) => setCatName(e.target.value)}
                                maxLength={25}
                                className="w-full bg-site border border-white/10 rounded-[5px] px-4 py-2 text-white focus:outline-none focus:border-primary/50"
                                placeholder="Np. Zakupy online"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-2">Kolor</label>
                            <div className="flex gap-2">
                                <input
                                    type="color"
                                    value={catColor}
                                    onChange={(e) => setCatColor(e.target.value)}
                                    className="h-10 w-20 bg-site border border-white/10 rounded-[5px] cursor-pointer"
                                />
                                <input
                                    type="text"
                                    value={catColor}
                                    onChange={(e) => setCatColor(e.target.value)}
                                    className="flex-1 bg-site border border-white/10 rounded-[5px] px-4 py-2 text-white text-xs font-mono focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm text-gray-400 mb-3">Ikona</label>
                            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2 p-3 bg-site border border-white/10 rounded-[5px]">
                                {Object.entries(iconMap).map(([name, IconComponent]) => (
                                    <button
                                        key={name}
                                        type="button"
                                        onClick={() => setCatIcon(name)}
                                        className={`p-2 rounded-[5px] flex items-center justify-center transition-all ${catIcon === name ? 'bg-primary shadow-glow-primary' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                                    >
                                        <IconComponent size={20} className={catIcon === name ? 'text-white' : ''} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => { setIsAddingCategory(false); setEditingCategory(null); }}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={isAddingCategory ? handleAddCategory : handleUpdateCategory}
                            disabled={!catName.trim()}
                            className="px-6 py-2 bg-primary text-white font-bold rounded-[5px] hover:bg-primary-hover transition-all disabled:opacity-50"
                        >
                            {isAddingCategory ? 'Dodaj kategorię' : 'Zapisz zmiany'}
                        </button>
                    </div>
                </div>
            )}

            {/* Categories List */}
            <div className="space-y-3">
                {categories.map((category) => (
                    <div
                        key={category.id}
                        className="bg-surface border border-white/5 rounded-[5px] overflow-hidden transition-all hover:border-white/10"
                    >
                        <div className="p-4 flex items-center justify-between gap-4">
                            <div
                                className="flex items-center gap-4 cursor-pointer flex-1"
                                onClick={() => handleToggleExpand(category.id)}
                            >
                                <CategoryBadge
                                    name={category.name}
                                    color={category.color}
                                    icon={category.icon}
                                    iconSize={12}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        {category.userId === null && (
                                            <span className="text-[10px] font-black bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 uppercase tracking-widest">Systemowa</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {category.userId !== null && (
                                    <>
                                        <button
                                            onClick={() => startEditing(category)}
                                            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all"
                                            title="Edytuj"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete({ type: 'category', id: category.id, name: category.name })}
                                            className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                                            title="Usuń"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => handleToggleExpand(category.id)}
                                    className="p-2 text-gray-400 hover:text-white transition-all"
                                >
                                    {expandedCategory === category.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                </button>
                            </div>
                        </div>

                        {/* Expanded Section: Stores */}
                        {expandedCategory === category.id && (
                            <div className="px-4 pb-4 pt-0 border-t border-white/5 bg-white/[0.02]">
                                <div className="mt-4 flex items-center justify-between mb-3 px-2">
                                    <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                                        <ShoppingBag size={12} />
                                        Przypisane sklepy
                                    </h5>
                                    {addingStoreTo !== category.id && (
                                        <button
                                            onClick={() => setAddingStoreTo(category.id)}
                                            className="text-[10px] font-bold text-primary hover:text-primary-hover flex items-center gap-1"
                                        >
                                            <Plus size={12} />
                                            Dodaj sklep
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {/* Add Store Input */}
                                    {addingStoreTo === category.id && (
                                        <div className="flex items-center gap-2 p-2 bg-site border border-primary/20 rounded-[5px]">
                                            <input
                                                type="text"
                                                autoFocus
                                                value={newStoreName}
                                                onChange={(e) => setNewStoreName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleAddStore(category.id);
                                                    if (e.key === 'Escape') setAddingStoreTo(null);
                                                }}
                                                placeholder="Nazwa sklepu..."
                                                className="flex-1 bg-transparent border-none text-xs text-white focus:outline-none"
                                            />
                                            <button
                                                onClick={() => handleAddStore(category.id)}
                                                className="p-1 text-primary hover:bg-primary/10 rounded cursor-pointer"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                onClick={() => setAddingStoreTo(null)}
                                                className="p-1 text-gray-500 hover:bg-white/5 rounded cursor-pointer"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    )}

                                    {(category.stores && category.stores.length > 0) || getSystemStores(category.description).length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                            {/* System Stores */}
                                            {getSystemStores(category.description).map((storeName, idx) => (
                                                <div
                                                    key={`system-${idx}`}
                                                    className="group flex items-center justify-between p-2 bg-white/[0.03] border border-white/5 rounded-[5px] opacity-60"
                                                >
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <Lock size={10} className="text-gray-500 shrink-0" />
                                                        <span className="text-xs text-gray-400 truncate">{storeName}</span>
                                                    </div>
                                                </div>
                                            ))}
                                            {/* User Stores */}
                                            {category.stores?.map((store) => (
                                                <div
                                                    key={store.id}
                                                    className="group flex items-center justify-between p-2 bg-site border border-white/5 rounded-[5px] hover:border-white/10 transition-all"
                                                >
                                                    <span className="text-xs text-gray-300 truncate">{store.name}</span>
                                                    <button
                                                        onClick={() => setConfirmDelete({ type: 'store', id: store.id, name: store.name })}
                                                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2 lg:p-1 text-gray-500 hover:text-rose-500 transition-all"
                                                        title="Usuń sklep"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : !addingStoreTo && (
                                        <div className="text-center py-6 border border-dashed border-white/10 rounded-[5px]">
                                            <p className="text-xs text-gray-500 italic">Brak przypisanych sklepów</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {categories.length === 0 && !loading && (
                <div className="text-center py-12 bg-surface/50 border border-dashed border-white/10 rounded-[5px]">
                    <AlertCircle className="mx-auto text-gray-600 mb-4" size={48} />
                    <h3 className="text-white font-bold mb-2">Brak kategorii</h3>
                    <p className="text-gray-500 text-sm">Nie masz jeszcze żadnych kategorii. Dodaj pierwszą, aby zacząć zarządzać wydatkami.</p>
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirmDelete}
                onClose={() => setConfirmDelete(null)}
                onConfirm={() => {
                    if (confirmDelete?.type === 'category') {
                        handleDeleteCategory(confirmDelete.id as number);
                    } else if (confirmDelete?.type === 'store') {
                        // We need the categoryId to refresh stores list
                        const storeId = confirmDelete.id as string;
                        // Find categoryId for this store in local state
                        let categoryId = 0;
                        categories.forEach(c => {
                            if (c.stores?.find(s => s.id === storeId)) {
                                categoryId = c.id;
                            }
                        });
                        handleDeleteStore(storeId, categoryId);
                    }
                }}
                title={confirmDelete?.type === 'category' ? 'Usuń kategorię' : 'Usuń sklep'}
                message={`Czy na pewno chcesz usunąć ${confirmDelete?.type === 'category' ? 'kategorię' : 'sklep'} "${confirmDelete?.name}"? Tej operacji nie można cofnąć.`}
                confirmLabel="Usuń"
                cancelLabel="Anuluj"
                variant="danger"
            />
        </div>
    );
}
