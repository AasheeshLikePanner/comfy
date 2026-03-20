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

export interface TabQueryState {
  filters: Filter[];
  sortColumn: string | null;
  sortDirection: 'ASC' | 'DESC';
  searchQuery: string;
  limit: number;
  offset: number;
}

interface QueryState {
  sql: string;
  results: QueryResult[];
  isExecuting: boolean;
  history: QueryHistoryItem[];
  savedQueries: SavedQuery[];
  
  // Tab-specific states
  queries: Record<string, TabQueryState>;
  
  addToHistory: (item: Omit<QueryHistoryItem, 'id'>) => void;
  setSql: (sql: string) => void;
  setResults: (results: QueryResult[]) => void;
  setIsExecuting: (isExecuting: boolean) => void;
  toggleFavorite: (id: string) => void;
  restoreFromHistory: (id: string) => void;
  saveQuery: (name: string, sql: string) => void;
  deleteSavedQuery: (id: string) => void;
  
  // Tab-scoped actions
  getTabQuery: (tabId: string) => TabQueryState;
  addFilter: (tabId: string, filter: Omit<Filter, 'id'>) => void;
  removeFilter: (tabId: string, id: string) => void;
  clearFilters: (tabId: string) => void;
  setSort: (tabId: string, column: string | null, direction: 'ASC' | 'DESC') => void;
  setSearchQuery: (tabId: string, query: string) => void;
  setLimit: (tabId: string, limit: number) => void;
  setOffset: (tabId: string, offset: number) => void;
  
  reset: () => void;
}

const DEFAULT_TAB_QUERY: TabQueryState = {
  filters: [],
  sortColumn: null,
  sortDirection: 'ASC',
  searchQuery: '',
  limit: 50,
  offset: 0,
};

export const useQueryStore = create<QueryState>()(
  persist(
    (set, get) => ({
      sql: '',
      results: [],
      isExecuting: false,
      history: [],
      savedQueries: [],
      queries: {},

      getTabQuery: (tabId) => {
        return get().queries[tabId] || DEFAULT_TAB_QUERY;
      },

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

      addFilter: (tabId, filter) => {
        set(state => {
          const tabQuery = state.queries[tabId] || { ...DEFAULT_TAB_QUERY };
          return {
            queries: {
              ...state.queries,
              [tabId]: {
                ...tabQuery,
                filters: [...tabQuery.filters, { ...filter, id: Date.now().toString() }]
              }
            }
          };
        });
      },

      removeFilter: (tabId, id) => {
        set(state => {
          const tabQuery = state.queries[tabId];
          if (!tabQuery) return state;
          return {
            queries: {
              ...state.queries,
              [tabId]: {
                ...tabQuery,
                filters: tabQuery.filters.filter(f => f.id !== id)
              }
            }
          };
        });
      },

      clearFilters: (tabId) => {
        set(state => {
          const tabQuery = state.queries[tabId];
          if (!tabQuery) return state;
          return {
            queries: {
              ...state.queries,
              [tabId]: { ...tabQuery, filters: [] }
            }
          };
        });
      },

      setSort: (tabId, column, direction) => {
        set(state => {
          const tabQuery = state.queries[tabId] || { ...DEFAULT_TAB_QUERY };
          return {
            queries: {
              ...state.queries,
              [tabId]: { ...tabQuery, sortColumn: column, sortDirection: direction }
            }
          };
        });
      },

      setSearchQuery: (tabId, query) => {
        set(state => {
          const tabQuery = state.queries[tabId] || { ...DEFAULT_TAB_QUERY };
          return {
            queries: {
              ...state.queries,
              [tabId]: { ...tabQuery, searchQuery: query, offset: 0 }
            }
          };
        });
      },

      setLimit: (tabId, limit) => {
        set(state => {
          const tabQuery = state.queries[tabId] || { ...DEFAULT_TAB_QUERY };
          return {
            queries: {
              ...state.queries,
              [tabId]: { ...tabQuery, limit, offset: 0 }
            }
          };
        });
      },

      setOffset: (tabId, offset) => {
        set(state => {
          const tabQuery = state.queries[tabId] || { ...DEFAULT_TAB_QUERY };
          return {
            queries: {
              ...state.queries,
              [tabId]: { ...tabQuery, offset }
            }
          };
        });
      },

      reset: () => {
        set({
          sql: '',
          results: [],
          isExecuting: false,
          queries: {},
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