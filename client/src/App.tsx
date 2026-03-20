import React, { useEffect } from 'react';
import { Sidebar } from '@/components/Sidebar/Sidebar';
import { DataTable } from '@/components/DataTable/DataTable';
import { SchemaInspector } from '@/components/SchemaInspector/SchemaInspector';
import { SqlEditor } from '@/components/SqlEditor/SqlEditor';
import { GlobalSearch } from '@/components/GlobalSearch/GlobalSearch';
import { useNavigationStore } from '@/store/navigation';
import { useConnectionStore } from '@/store/connection';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Moon, Sun, Monitor, Database, List } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

import { TabContainer } from '@/components/Navigation/TabContainer';

function App() {
  const { currentView, selectedObject, tabs, activeTabId, nextTab, previousTab, isSidebarCollapsed, toggleSidebar } = useNavigationStore();
  const { fetchConnections } = useConnectionStore();
  const [theme, setTheme] = React.useState<'light' | 'dark' | 'system'>('dark');

  useEffect(() => {
    fetchConnections();

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prioritize Tab switching as requested, but preserve input focus behavior
      const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '');
      if (e.key === 'Tab' && !isInput) {
        e.preventDefault();
        if (e.shiftKey) {
          previousTab();
        } else {
          nextTab();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextTab, previousTab]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        document.documentElement.classList.toggle('dark', mediaQuery.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const renderContent = (tabId: string) => {
    switch (currentView) {
      case 'data':
        return <DataTable tabId={tabId} />;
      case 'schema':
        return <SchemaInspector />;
      case 'sql':
        return <SqlEditor />;
      default:
        return <DataTable tabId={tabId} />;
    }
  };

  const renderMainContent = () => {
    if (tabs.length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center bg-muted/10">
          <div className="text-center max-w-md p-8">
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
                <Database className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-3">Explore Your Database</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Select a table from the sidebar to browse data, view schema, and run queries
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <kbd className="px-2 py-1 bg-muted rounded font-mono">⌘K</kbd>
                Quick search
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <TabContainer />
        <div className="flex-1 relative overflow-hidden">
          {tabs.map((tab) => (
            <div 
              key={tab.id}
              className={cn(
                "absolute inset-0 flex flex-col",
                tab.id === activeTabId ? "visible z-10" : "invisible -z-10"
              )}
              style={tab.id !== activeTabId ? { display: 'none' } : {}}
            >
              {renderContent(tab.id)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="h-screen flex bg-background text-foreground antialiased selection:bg-primary/10 overflow-hidden">
        <div 
          className={cn(
            "flex-shrink-0 border-r border-border/40 bg-card/30 backdrop-blur-xl transition-all duration-300 ease-in-out overflow-hidden",
            isSidebarCollapsed ? "w-0" : "w-64"
          )}
        >
          <div className="w-64 h-full">
            <Sidebar />
          </div>
        </div>
<div className="flex-1 flex flex-col min-w-0 overflow-hidden">
  {/* Header */}
  <header className="h-12 border-b border-border/40 flex items-center justify-between px-4 bg-background/50 backdrop-blur-md">
    <div className="flex items-center gap-4">
      <button
        onClick={toggleSidebar}
        className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground/40 hover:text-foreground transition-colors mr-2"
        title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
      >
        <List className="w-5 h-5" />
      </button>

      {isSidebarCollapsed && (
        <div className="flex items-center gap-2 mr-2 animate-in fade-in slide-in-from-left-4 duration-500">
          <Database className="w-4 h-4 text-primary" weight="fill" />
          <span className="font-bold text-[13px] tracking-tight text-foreground/90 uppercase">dbviz</span>
        </div>
      )}
      {selectedObject && (
        <div className="flex items-center gap-2 text-[13px]">
          <span className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px] font-medium tracking-tight">
            {selectedObject.schema}
          </span>
          <span className="text-muted-foreground/30 font-light">/</span>
          <span className="font-medium text-foreground/90">
            {selectedObject.table}
          </span>
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-widest ml-1 font-semibold">{selectedObject.type}</span>
        </div>
      )}
            </div>

            <div className="flex items-center gap-4">
              <GlobalSearch />

              <div className="flex items-center gap-0.5 p-0.5 bg-secondary/50 rounded-md border border-border/40">
                <button
                  onClick={() => setTheme('light')}
                  className={cn(
                    'p-1 rounded-sm transition-all duration-200',
                    theme === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/60 hover:text-foreground hover:bg-background/20'
                  )}
                >
                  <Sun className="h-3.5 w-3.5" weight={theme === 'light' ? 'fill' : 'regular'} />
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={cn(
                    'p-1 rounded-sm transition-all duration-200',
                    theme === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/60 hover:text-foreground hover:bg-background/20'
                  )}
                >
                  <Moon className="h-3.5 w-3.5" weight={theme === 'dark' ? 'fill' : 'regular'} />
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={cn(
                    'p-1 rounded-sm transition-all duration-200',
                    theme === 'system' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/60 hover:text-foreground hover:bg-background/20'
                  )}
                >
                  <Monitor className="h-3.5 w-3.5" weight={theme === 'system' ? 'fill' : 'regular'} />
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 flex overflow-hidden bg-background">
            {renderMainContent()}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

export default App;