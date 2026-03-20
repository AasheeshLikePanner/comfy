import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface QueryResult {
  rows?: Record<string, any>[];
  rowCount?: number;
  fields?: Array<{ name: string; dataTypeID: number }>;
  duration?: number;
  error?: string;
  detail?: string;
  hint?: string;
  position?: number;
  line?: number;
  column?: number;
}

interface QueryHistoryItem {
  id: string;
  sql: string;
  timestamp: Date;
  rowCount?: number;
  duration?: number;
  favorite?: boolean;
}

interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  connectionHash?: string;
  folder?: string;
  tags?: string[];
}

interface Filter {
  id: string;
  column: string;
  operator: string;
  value: any;
}

interface QueryState {
  sql: string;
  results: QueryResult[];
  isExecuting: boolean;
  history: QueryHistoryItem[];
  savedQueries: SavedQuery[];
  filters: Filter[];
  sortColumn: string | null;
  sortDirection: 'ASC' | 'DESC';
  searchQuery: string;
  limit: number;
  offset: number;
  addToHistory: (item: Omit<QueryHistoryItem, 'id'>) => void;
  setSql: (sql: string) => void;
  setResults: (results: QueryResult[]) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  toggleFavorite: (id: string) => void;
  restoreFromHistory: (id: string) => void;
  saveQuery: (name: string, sql: string) => void;
  deleteSavedQuery: (id: string) => void;
  setFilters: (filters: Filter[]) => void;
  addFilter: (filter: Omit<Filter, 'id'>) => void;
  removeFilter: (id: string) => void;
  updateFilter: (id: string, updates: Partial<Filter>) => void;
  clearFilters: () => void;
  setSort: (column: string | null, direction: 'ASC' | 'DESC') => void;
  setSearchQuery: (query: string) => void;
  setLimit: (limit: number) => void;
  setOffset: (offset: number) => void;
  reset: () => void;
}

export const useQueryStore = create<QueryState>()(
  persist(
    (set, get) => ({
      sql: '',
      results: [],
      isExecuting: false,
      history: [],
      savedQueries: [],
      filters: [],
      sortColumn: null,
      sortDirection: 'ASC',
      searchQuery: '',
      limit: 50,
      offset: 0,

      addToHistory: (item) => {
        set(state => ({
          history: [
            { ...item, id: Date.now().toString() },
            ...state.history.slice(0, 49)
          ]
        }));
      },

      setSql: (sql) => {
        set({ sql });
      },

      setResults: (results) => {
        set({ results });
      },

      setIsExecuting: (isExecuting) => {
        set({ isExecuting });
      },

      toggleFavorite: (id) => {
        set(state => ({
          history: state.history.map(item =>
            item.id === id ? { ...item, favorite: !item.favorite } : item
          )
        }));
      },

      restoreFromHistory: (id) => {
        const item = get().history.find(h => h.id === id);
        if (item) {
          set({ sql: item.sql });
        }
      },

      saveQuery: (name, sql) => {
        set(state => ({
          savedQueries: [
            ...state.savedQueries,
            { id: Date.now().toString(), name, sql }
          ]
        }));
      },

      deleteSavedQuery: (id) => {
        set(state => ({
          savedQueries: state.savedQueries.filter(q => q.id !== id)
        }));
      },

      setFilters: (filters) => {
        set({ filters });
      },

      addFilter: (filter) => {
        set(state => ({
          filters: [
            ...state.filters,
            { ...filter, id: Date.now().toString() }
          ]
        }));
      },

      removeFilter: (id) => {
        set(state => ({
          filters: state.filters.filter(f => f.id !== id)
        }));
      },

      updateFilter: (id, updates) => {
        set(state => ({
          filters: state.filters.map(f =>
            f.id === id ? { ...f, ...updates } : f
          )
        }));
      },

      clearFilters: () => {
        set({ filters: [] });
      },

      setSort: (column, direction) => {
        set({ sortColumn: column, sortDirection: direction });
      },

      setSearchQuery: (query) => {
        set({ searchQuery: query, offset: 0 });
      },

      setLimit: (limit) => {
        set({ limit, offset: 0 });
      },

      setOffset: (offset) => {
        set({ offset });
      },

      reset: () => {
        set({
          sql: '',
          results: [],
          isExecuting: false,
          filters: [],
          sortColumn: null,
          sortDirection: 'ASC',
          searchQuery: '',
          offset: 0,
        });
      },
    }),
    {
      name: 'dbviz-query-store',
      partialize: (state) => ({
        savedQueries: state.savedQueries,
        history: state.history.filter(h => h.favorite),
      }),
    }
  )
);