/**
 * UI State Store — manages only presentation state.
 * All domain data (items, categories, orders) is managed by React Query.
 *
 * This store has NO persist middleware — UI state resets on app restart.
 * This store has NO sync logic — there is nothing to sync.
 * This store has NO domain mutations — those go through server via React Query.
 */
import { create } from 'zustand';

interface UIState {
  isInitialized: boolean;
  searchQuery: string;
  selectedCategoryId: string | null;
  expandedCategories: string[];
  expandedItems: string[];
}

interface UIActions {
  initialize: () => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (id: string | null) => void;
  toggleCategoryExpand: (id: string) => void;
  toggleItemExpand: (id: string) => void;
  expandAllCategories: (ids: string[]) => void;
  collapseAllCategories: () => void;
  resetUIState: () => void;
}

export const useAppStore = create<UIState & UIActions>((set) => ({
  isInitialized: false,
  searchQuery: '',
  selectedCategoryId: null,
  expandedCategories: [],
  expandedItems: [],

  initialize: () => set({ isInitialized: true }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  toggleCategoryExpand: (id) =>
    set((s) => ({
      expandedCategories: s.expandedCategories.includes(id)
        ? s.expandedCategories.filter((c) => c !== id)
        : [...s.expandedCategories, id],
    })),
  toggleItemExpand: (id) =>
    set((s) => ({
      expandedItems: s.expandedItems.includes(id)
        ? s.expandedItems.filter((i) => i !== id)
        : [...s.expandedItems, id],
    })),
  expandAllCategories: (ids) => set({ expandedCategories: ids }),
  collapseAllCategories: () => set({ expandedCategories: [] }),
  resetUIState: () =>
    set({
      searchQuery: '',
      selectedCategoryId: null,
      expandedCategories: [],
      expandedItems: [],
    }),
}));
