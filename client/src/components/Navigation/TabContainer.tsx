import React from 'react';
import { useNavigationStore, ObjectType } from '@/store/navigation';
import { cn } from '@/lib/utils';
import { X, Table, Eye, Function, Stack, CaretRight } from '@phosphor-icons/react';
import { AppTooltip } from '@/components/ui/AppTooltip';

const getIcon = (type: ObjectType) => {
  const props = { className: "w-3.5 h-3.5" };
  switch (type) {
    case 'table': return <Table {...props} className="text-emerald-400/70" />;
    case 'view': return <Eye {...props} className="text-indigo-400/70" />;
    case 'materialized_view': return <Eye {...props} className="text-orange-400/70" />;
    case 'function': return <Function {...props} className="text-amber-400/70" />;
    case 'sequence': return <Stack {...props} className="text-rose-400/70" />;
    default: return null;
  }
};

export const TabContainer = () => {
  const { tabs, activeTabId, setActiveTab, closeTab } = useNavigationStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex flex-col w-full border-b border-white/5 bg-secondary/5 backdrop-blur-md">
      {/* Breadcrumbs (VS Code style) */}
      <div className="px-4 py-1 flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-medium">
        <span>Explorer</span>
        <CaretRight weight="bold" className="w-2 h-2" />
        <span className="text-muted-foreground/60">{tabs.find(t => t.id === activeTabId)?.schema || 'public'}</span>
        <CaretRight weight="bold" className="w-2 h-2" />
        <span className="text-foreground/60">{tabs.find(t => t.id === activeTabId)?.name || 'Untitled'}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center h-8 overflow-x-auto no-scrollbar scroll-smooth px-2 gap-1 mt-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <AppTooltip 
              key={tab.id}
              delayDuration={700}
              content={
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground whitespace-nowrap text-[10px]">Schema: <span className="text-foreground">{tab.schema}</span></span>
                  <span className="text-muted-foreground whitespace-nowrap text-[10px]">Type: <span className="text-foreground uppercase">{tab.type}</span></span>
                </div>
              }
            >
              <div
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "group relative flex items-center h-full px-4 gap-2 cursor-pointer transition-all duration-150 min-w-[120px] max-w-[200px] rounded-t-lg",
                  isActive 
                    ? "bg-black/40 text-foreground border-x border-t border-white/5 shadow-inner" 
                    : "bg-transparent text-muted-foreground/30 hover:bg-black/10 hover:text-foreground/80"
                )}
              >
                <div className="flex-shrink-0">{getIcon(tab.type)}</div>
                <span className="text-[11px] font-medium truncate flex-1">{tab.name}</span>
                
                <AppTooltip content="Close Tab">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                    className={cn(
                      "p-0.5 rounded-md hover:bg-secondary transition-all",
                      isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <X className="w-2.5 h-2.5" weight="bold" />
                  </button>
                </AppTooltip>
              </div>
            </AppTooltip>
          );
        })}
      </div>
    </div>
  );
};
