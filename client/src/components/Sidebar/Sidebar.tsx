import React, { useState, useEffect } from 'react';
import { useConnectionStore, Connection } from '@/store/connection';
import { useNavigationStore, ObjectInfo } from '@/store/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectionDialog } from './ConnectionDialog';
import {
  CaretRight,
  CaretDown,
  Table,
  Eye,
  Function,
  Stack,
  Database,
  X,
  Plus,
  CircleNotch,
  MagnifyingGlass,
  ArrowsClockwise,
} from '@phosphor-icons/react';

const ObjectTreeNode = ({ 
  node, 
  level = 0,
  connectionId,
  parentSchema = '',
}: { 
  node: ObjectInfo; 
  level?: number;
  connectionId: string;
  parentSchema?: string;
}) => {
  const { selectedObject, expandedNodes, toggleExpanded, selectObject } = useNavigationStore();
  const [children, setChildren] = useState<ObjectInfo[]>([]);
  const [isHovered, setIsHovered] = useState(false);

  const nodeSchema = node.schema || parentSchema;
  const isExpanded = expandedNodes.has(`${connectionId}:${nodeSchema}:${node.name}`);
  const isSelected = selectedObject?.table === node.name && selectedObject?.schema === nodeSchema;
  const hasChildren = node.children && node.children.length > 0;
  
  // Expansion is click-based only
  const showChildren = isExpanded;

  useEffect(() => {
    if (showChildren && hasChildren && node.children) {
      setChildren(node.children);
    }
  }, [showChildren, hasChildren, node.children]);

  const handleClick = () => {
    if (node.type === 'category') {
      toggleExpanded(`${connectionId}:${nodeSchema}:${node.name}`);
    } else if (nodeSchema) {
      selectObject(nodeSchema, node.name, node.type);
    }
  };

  const getIcon = () => {
    const iconProps = { className: "w-3.5 h-3.5", weight: "regular" as const };
    
    if (node.type === 'category') {
      // Show arrow ONLY when hovered or expanded (but the user said "when hover then show hte arrow")
      if (!isHovered && !isExpanded) return <div className="w-2.5" />; // Spacer to prevent jumps
      
      return isExpanded 
        ? <CaretDown className="w-2.5 h-2.5 text-muted-foreground/40" weight="bold" /> 
        : <CaretRight className="w-2.5 h-2.5 text-muted-foreground/40" weight="bold" />;
    }

    switch (node.type) {
      case 'schema':
        return <Database {...iconProps} className="w-3.5 h-3.5 text-blue-400/70" />;
      case 'table':
        return <Table {...iconProps} className="w-3.5 h-3.5 text-muted-foreground/40" weight="duotone" />;
      case 'view':
        return <Eye {...iconProps} className="w-3.5 h-3.5 text-indigo-400/40" />;
      case 'materialized_view':
        return <Eye {...iconProps} className="w-3.5 h-3.5 text-orange-400/70" />;
      case 'function':
        return <Function {...iconProps} className="w-3.5 h-3.5 text-amber-400/70" />;
      case 'sequence':
        return <Stack {...iconProps} className="w-3.5 h-3.5 text-rose-400/70" />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="select-none"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'flex items-center gap-2.5 py-1 px-3 cursor-pointer rounded-md transition-all duration-150',
          isSelected 
            ? 'bg-secondary text-foreground font-medium' 
            : 'hover:bg-secondary/30 text-muted-foreground/70 hover:text-foreground',
          node.type === 'category' && 'mt-2 mb-1 opacity-80'
        )}
        style={{ paddingLeft: `${level * 14 + 12}px` }}
        onClick={handleClick}
      >
        <span className="flex-shrink-0 w-4 flex items-center justify-center">
          {getIcon()}
        </span>
        <span className={cn(
          'flex-1 truncate tracking-tight flex items-center gap-2',
          node.type === 'category' ? 'text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/40' : 'text-[12px]'
        )}>
          {node.type === 'category' && (
            <>
              {node.name.toLowerCase().includes('table') && <Table className="w-3 h-3 opacity-40" weight="fill" />}
              {node.name.toLowerCase().includes('view') && <Eye className="w-3 h-3 opacity-40" weight="fill" />}
              {node.name.toLowerCase().includes('function') && <Function className="w-3 h-3 opacity-40" weight="fill" />}
              {node.name.toLowerCase().includes('sequence') && <Stack className="w-3 h-3 opacity-40" weight="fill" />}
            </>
          )}
          {node.name}
        </span>
        {node.row_count !== undefined && node.row_count > 0 && (
          <span className="text-[9px] text-muted-foreground/30 font-mono tabular-nums">
            {node.row_count > 1000 ? `${(node.row_count / 1000).toFixed(1)}k` : node.row_count}
          </span>
        )}
      </div>
      {showChildren && children.length > 0 && (
        <div className="mt-0.5 animate-in slide-in-from-top-1 duration-200">
          {children.map((child, index) => (
            <ObjectTreeNode
              key={`${child.schema || ''}:${child.name}:${index}`}
              node={child}
              level={level + 1}
              connectionId={connectionId}
              parentSchema={node.type === 'schema' ? node.name : nodeSchema}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ConnectionTab = ({ connection, isActive, onClick, onClose }: {
  connection: Connection;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
}) => {
  const statusColor = {
    connected: 'bg-emerald-500',
    connecting: 'bg-amber-500 animate-pulse',
    error: 'bg-red-500',
    disconnected: 'bg-muted-foreground',
  }[connection.status];

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-4 py-2 cursor-pointer transition-all duration-200 border-l-2',
        isActive 
          ? 'bg-secondary/40 border-l-foreground/80' 
          : 'hover:bg-secondary/20 border-l-transparent'
      )}
      onClick={onClick}
    >
      <div className={cn('w-1.5 h-1.5 rounded-full shadow-sm', statusColor)} />
      <div className="flex-1 min-w-0">
        <span className={cn('text-[12px] truncate block font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
          {connection.name}
        </span>
        {connection.latency && (
          <span className="text-[10px] text-muted-foreground/50 tabular-nums">{connection.latency}ms</span>
        )}
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 hover:bg-secondary rounded p-0.5 transition-all duration-200"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <X className="w-3 h-3 text-muted-foreground/60 hover:text-foreground" />
      </button>
    </div>
  );
};

export const Sidebar = () => {
  const { connections, activeConnectionId, setActiveConnection, removeConnection, completeConnection } = useConnectionStore();
  const { searchQuery, setSearchQuery, setExpanded } = useNavigationStore();
  const [objects, setObjects] = useState<ObjectInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showConnectDialog, setShowConnectDialog] = useState(false);

  const activeConnection = connections.find(c => c.id === activeConnectionId);

  useEffect(() => {
    if (activeConnectionId && activeConnection?.status === 'connected') {
      fetchObjects();
    }
  }, [activeConnectionId, activeConnection?.status]);

  const fetchObjects = async () => {
    const currentActiveId = useConnectionStore.getState().activeConnectionId;
    if (!currentActiveId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/objects/${currentActiveId}`);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        setObjects([]);
        return;
      }
      
      setObjects(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0 && data[0].name) {
        const schemaName = data[0].name;
        const schemaKey = `${currentActiveId}::${schemaName}`;
        setExpanded(schemaKey, true);
        
        const tablesCategory = data[0].children?.find(c => c.name === 'Tables');
        if (tablesCategory) {
          const tablesKey = `${currentActiveId}::Tables`;
          setExpanded(tablesKey, true);
        }
      }
    } catch (err) {
      setObjects([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (connectionString: string) => {
    await completeConnection(connectionString);
  };

  const handleRefresh = () => {
    fetchObjects();
  };

  const filteredObjects = React.useMemo(() => {
    if (!searchQuery) return objects;
    const query = searchQuery.toLowerCase();
    return filterObjects(objects, query);
  }, [objects, searchQuery]);

  const filterObjects = (objs: ObjectInfo[], query: string): ObjectInfo[] => {
    return objs.reduce((acc: ObjectInfo[], obj) => {
      const matches = obj.name.toLowerCase().includes(query);
      const filteredChildren = obj.children ? filterObjects(obj.children, query) : [];
      
      if (matches || filteredChildren.length > 0) {
        acc.push({
          ...obj,
          children: filteredChildren.length > 0 ? filteredChildren : obj.children,
        });
      }
      return acc;
    }, []);
  };

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
          <Database className="w-3.5 h-3.5 text-background" weight="fill" />
        </div>
        <span className="font-bold text-[14px] tracking-tight text-foreground/90 uppercase">dbviz</span>
      </div>

      {/* Connection tabs */}
      <div className="border-b border-border/40 pb-2">
        <div className="px-5 mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Connections</span>
          <button
            onClick={() => setShowConnectDialog(true)}
            className="p-1 hover:bg-secondary rounded-sm transition-colors text-muted-foreground/60 hover:text-foreground"
          >
            <Plus className="w-3.5 h-3.5" weight="bold" />
          </button>
        </div>
        <div className="max-h-[120px] overflow-auto">
          {connections.map(conn => (
            <ConnectionTab
              key={conn.id}
              connection={conn}
              isActive={conn.id === activeConnectionId}
              onClick={() => setActiveConnection(conn.id)}
              onClose={() => removeConnection(conn.id)}
            />
          ))}
        </div>
      </div>

      {/* Search and tree */}
      {activeConnection?.status === 'connected' && (
        <>
          <div className="p-3">
            <div className="relative group">
              <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 group-focus-within:text-foreground/50 transition-colors" />
              <Input
                placeholder="Find objects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-[12px] bg-secondary/30 border-border/20 focus:bg-secondary/50 focus:border-border/40 transition-all rounded-md placeholder:text-muted-foreground/30"
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto px-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <CircleNotch className="w-5 h-5 animate-spin text-muted-foreground/30" />
              </div>
            ) : !Array.isArray(filteredObjects) || filteredObjects.length === 0 ? (
              <div className="text-center py-12 text-[11px] text-muted-foreground/40 italic">
                No objects found
              </div>
            ) : (
              <div className="py-2 space-y-0.5">
                {filteredObjects.map((obj, index) => (
                  <ObjectTreeNode
                    key={`${obj.name}:${index}`}
                    node={obj}
                    connectionId={activeConnectionId!}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-border/40">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full h-8 text-[11px] font-medium justify-start text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 rounded-md px-2 transition-all" 
              onClick={handleRefresh}
            >
              <ArrowsClockwise className="w-3.5 h-3.5 mr-2" weight="bold" />
              Refresh all schemas
            </Button>
          </div>
        </>
      )}

      {activeConnection?.status !== 'connected' && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/40 text-[11px] p-6 text-center italic">
          {activeConnection?.status === 'connecting' ? (
            <div className="flex flex-col items-center gap-3">
              <CircleNotch className="w-5 h-5 animate-spin text-muted-foreground/20" />
              <span>Establishing connection...</span>
            </div>
          ) : activeConnection?.status === 'error' ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center mb-1">
                <X className="w-4 h-4 text-destructive/60" weight="bold" />
              </div>
              <p className="text-foreground/70 font-medium">Connection failed</p>
              <p className="text-[10px] opacity-60 leading-relaxed max-w-[160px]">{activeConnection.error}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Database className="w-8 h-8 opacity-10 mb-1" weight="duotone" />
              <p>No active connection</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 text-[11px] h-7 border-border/40 hover:bg-secondary/60 hover:text-foreground rounded-md px-3 transition-all"
                onClick={() => setShowConnectDialog(true)}
              >
                Add new connection
              </Button>
            </div>
          )}
        </div>
      )}

      <ConnectionDialog
        open={showConnectDialog}
        onOpenChange={setShowConnectDialog}
        onConnect={handleConnect}
      />
    </div>
  );
};