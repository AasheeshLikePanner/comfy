import { create } from 'zustand';

export type ObjectType = 'schema' | 'table' | 'view' | 'materialized_view' | 'function' | 'sequence' | 'category';

export interface ObjectInfo {
  name: string;
  type: ObjectType;
  schema?: string;
  row_count?: number;
  children?: ObjectInfo[];
  count?: number;
}

interface NavigationState {
  selectedObject: {
    schema: string;
    table: string;
    type: ObjectType;
  } | null;
  expandedNodes: Set<string>;
  searchQuery: string;
  currentView: 'data' | 'schema' | 'sql';
  schemaTab: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'stats' | 'foreignKeys';
  toggleExpanded: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;
  selectObject: (schema: string, table: string, type: ObjectType) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: 'data' | 'schema' | 'sql') => void;
  setSchemaTab: (tab: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'stats' | 'foreignKeys') => void;
  reset: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  selectedObject: null,
  expandedNodes: new Set(),
  searchQuery: '',
  currentView: 'data',
  schemaTab: 'columns',

  toggleExpanded: (nodeId) => {
    set(state => {
      const newExpanded = new Set(state.expandedNodes);
      if (newExpanded.has(nodeId)) {
        newExpanded.delete(nodeId);
      } else {
        newExpanded.add(nodeId);
      }
      return { expandedNodes: newExpanded };
    });
  },

  setExpanded: (nodeId, expanded) => {
    set(state => {
      const newExpanded = new Set(state.expandedNodes);
      if (expanded) {
        newExpanded.add(nodeId);
      } else {
        newExpanded.delete(nodeId);
      }
      return { expandedNodes: newExpanded };
    });
  },

  selectObject: (schema, table, type) => {
    set({ 
      selectedObject: { schema, table, type },
      currentView: type === 'function' || type === 'sequence' ? 'schema' : 'data'
    });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  setCurrentView: (view) => {
    set({ currentView: view });
  },

  setSchemaTab: (tab) => {
    set({ schemaTab: tab });
  },

  reset: () => {
    set({
      selectedObject: null,
      expandedNodes: new Set(),
      searchQuery: '',
      currentView: 'data',
      schemaTab: 'columns',
    });
  },
}));