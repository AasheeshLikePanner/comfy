import React, { useCallback, memo, useRef, useEffect, useState } from 'react';
import { useNavigationStore, ObjectType } from '@/store/navigation';
import { cn } from '@/lib/utils';
import { X, Table, Eye, Function, Stack, CaretRight } from '@phosphor-icons/react';
import { AppTooltip } from '@/components/ui/AppTooltip';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  Modifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const constrainToHorizontal: Modifier = ({ transform }) => {
  return {
    ...transform,
    y: 0,
  };
};

const getIcon = (type: ObjectType) => {
  const props = { className: "w-3.5 h-3.5" };
  switch (type) {
    case 'table': return <Table {...props} className="text-muted-foreground/40" weight="duotone" />;
    case 'view': return <Eye {...props} className="text-indigo-400/40" />;
    case 'materialized_view': return <Eye {...props} className="text-orange-400/40" />;
    case 'function': return <Function {...props} className="text-amber-400/70" />;
    case 'sequence': return <Stack {...props} className="text-rose-400/70" />;
    default: return null;
  }
};

const SortableTab = memo(({ 
  tab, 
  isActive, 
  onSelect, 
  onClose
}: { 
  tab: any; 
  isActive: boolean; 
  onSelect: () => void; 
  onClose: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <AppTooltip 
      delayDuration={700}
      content={
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground whitespace-nowrap text-[10px]">Schema: <span className="text-foreground">{tab.schema}</span></span>
          <span className="text-muted-foreground whitespace-nowrap text-[10px]">Type: <span className="text-foreground uppercase">{tab.type}</span></span>
        </div>
      }
    >
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onClick={onSelect}
        className={cn(
          "group relative flex items-center h-full px-4 gap-2 cursor-pointer active:cursor-grabbing transition-colors duration-200 min-w-[120px] max-w-[200px] rounded-t-lg select-none",
          isActive 
            ? "bg-black/40 text-foreground border-x border-t border-white/5 shadow-inner" 
            : "bg-transparent text-muted-foreground/30 hover:bg-black/10 hover:text-foreground/80",
          isDragging && "opacity-50 z-50 shadow-2xl"
        )}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 pointer-events-none">
          <div className="flex-shrink-0">{getIcon(tab.type)}</div>
          <span className="text-[11px] font-medium truncate">{tab.name}</span>
        </div>
        
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={cn(
            "p-0.5 rounded-md hover:bg-secondary/50 transition-all pointer-events-auto",
            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <X className="w-2.5 h-2.5" weight="bold" />
        </button>
      </div>
    </AppTooltip>
  );
});

export const TabContainer = memo(() => {
  const tabs = useNavigationStore(state => state.tabs);
  const activeTabId = useNavigationStore(state => state.activeTabId);
  const setActiveTab = useNavigationStore(state => state.setActiveTab);
  const closeTab = useNavigationStore(state => state.closeTab);
  const setTabs = useNavigationStore(state => state.setTabs);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex(t => t.id === active.id);
      const newIndex = tabs.findIndex(t => t.id === over.id);
      setTabs(arrayMove(tabs, oldIndex, newIndex));
    }
  }, [tabs, setTabs]);

  const handleSelect = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, [setActiveTab]);

  const handleClose = useCallback((tabId: string) => {
    closeTab(tabId);
  }, [closeTab]);

  // Scroll active tab to center
  useEffect(() => {
    if (containerRef.current && activeTabId) {
      const container = containerRef.current;
      const tabEl = container.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement;
      if (tabEl) {
        const tabLeft = tabEl.offsetLeft;
        const tabWidth = tabEl.offsetWidth;
        const containerWidth = container.offsetWidth;
        const scrollTarget = tabLeft - (containerWidth / 2) + (tabWidth / 2);
        container.scrollTo({ left: scrollTarget, behavior: 'smooth' });
      }
    }
  }, [activeTabId]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  if (tabs.length === 0) return null;

  return (
    <div className="flex flex-col w-full border-b border-white/5 bg-secondary/5 backdrop-blur-md">
      {/* Breadcrumbs */}
      <div className="px-4 h-6 flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-medium">
        <span>Explorer</span>
        <CaretRight weight="bold" className="w-2 h-2" />
        <span className="text-muted-foreground/60">{activeTab?.schema || 'public'}</span>
        <CaretRight weight="bold" className="w-2 h-2" />
        <span className="text-foreground/60">{activeTab?.name || 'Untitled'}</span>
      </div>

      {/* Tabs */}
      <div 
        ref={containerRef}
        className={cn(
          "flex items-center h-9 px-2 gap-0.5",
          "overflow-x-auto scroll-smooth",
          isHovering ? "scrollbar-visible" : "no-scrollbar"
        )}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[constrainToHorizontal]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={tabs.map(t => t.id)} strategy={horizontalListSortingStrategy}>
            {tabs.map((tab) => (
              <div key={tab.id} data-tab-id={tab.id} className="h-full flex-shrink-0">
                <SortableTab 
                  tab={tab} 
                  isActive={tab.id === activeTabId}
                  onSelect={() => handleSelect(tab.id)}
                  onClose={() => handleClose(tab.id)}
                />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
});
