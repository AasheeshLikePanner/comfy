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

export interface Tab {
  id: string; // key: connectionId:schema:name
  name: string;
  type: ObjectType;
  schema: string;
}

interface NavigationState {
  tabs: Tab[];
  activeTabId: string | null;
  selectedObject: {
    schema: string;
    table: string;
    type: ObjectType;
  } | null;
  expandedNodes: Set<string>;
  searchQuery: string;
  currentView: 'data' | 'schema' | 'sql';
  schemaTab: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'stats' | 'foreignKeys';
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toggleExpanded: (nodeId: string) => void;
  setExpanded: (nodeId: string, expanded: boolean) => void;
  selectObject: (schema: string, table: string, type: ObjectType) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setSearchQuery: (query: string) => void;
  setCurrentView: (view: 'data' | 'schema' | 'sql') => void;
  setSchemaTab: (tab: 'columns' | 'indexes' | 'constraints' | 'triggers' | 'stats' | 'foreignKeys') => void;
  reset: () => void;
  nextTab: () => void;
  previousTab: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  tabs: [],
  activeTabId: null,
  selectedObject: null,
  expandedNodes: new Set(),
  searchQuery: '',
  currentView: 'data',
  schemaTab: 'columns',
  isSidebarCollapsed: false,

  toggleSidebar: () => set(state => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

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
    set(state => {
      const tabId = `${schema}:${table}`;
      const existingTab = state.tabs.find(t => t.id === tabId);
      
      const newTabs = existingTab ? state.tabs : [...state.tabs, { id: tabId, name: table, type, schema }];
      
      return { 
        tabs: newTabs,
        activeTabId: tabId,
        selectedObject: { schema, table, type },
        currentView: type === 'function' || type === 'sequence' ? 'schema' : 'data'
      };
    });
  },

  setActiveTab: (tabId) => {
    set(state => {
      const tab = state.tabs.find(t => t.id === tabId);
      if (!tab) return state;
      return { 
        activeTabId: tabId,
        selectedObject: { schema: tab.schema, table: tab.name, type: tab.type }
      };
    });
  },

  closeTab: (tabId) => {
    set(state => {
      const newTabs = state.tabs.filter(t => t.id !== tabId);
      let newActiveId = state.activeTabId;
      
      if (state.activeTabId === tabId) {
        newActiveId = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
      }
      
      const activeTab = newTabs.find(t => t.id === newActiveId);
      
      return { 
        tabs: newTabs,
        activeTabId: newActiveId,
        selectedObject: activeTab ? { schema: activeTab.schema, table: activeTab.name, type: activeTab.type } : null
      };
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
      tabs: [],
      activeTabId: null,
      selectedObject: null,
      expandedNodes: new Set(),
      searchQuery: '',
      currentView: 'data',
      schemaTab: 'columns',
    });
  },

  nextTab: () => {
    set(state => {
      if (state.tabs.length <= 1) return state;
      const currentIndex = state.tabs.findIndex(t => t.id === state.activeTabId);
      const nextIndex = (currentIndex + 1) % state.tabs.length;
      const nextTab = state.tabs[nextIndex];
      return { 
        activeTabId: nextTab.id, 
        selectedObject: { schema: nextTab.schema, table: nextTab.name, type: nextTab.type } 
      };
    });
  },

  previousTab: () => {
    set(state => {
      if (state.tabs.length <= 1) return state;
      const currentIndex = state.tabs.findIndex(t => t.id === state.activeTabId);
      const prevIndex = (currentIndex - 1 + state.tabs.length) % state.tabs.length;
      const prevTab = state.tabs[prevIndex];
      return { 
        activeTabId: prevTab.id, 
        selectedObject: { schema: prevTab.schema, table: prevTab.name, type: prevTab.type } 
      };
    });
  }
}));