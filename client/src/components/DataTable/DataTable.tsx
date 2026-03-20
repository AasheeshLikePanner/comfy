import React, { useState, useEffect } from 'react';
import { useNavigationStore } from '@/store/navigation';
import { useConnectionStore } from '@/store/connection';
import { useQueryStore } from '@/store/query';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  CaretUp,
  CaretDown,
  CaretLeft,
  CaretRight,
  ArrowsDownUp,
  MagnifyingGlass,
  X,
  Copy,
  CircleNotch,
  Funnel,
  Download,
  Table as TableIcon,
  Check,
  CheckSquare,
  Square,
  Minus,
  Trash,
} from '@phosphor-icons/react';
import { getDataTypeCategory, formatTimestamp, truncateText, downloadFile, rowsToCSV, rowsToJSON, rowsToSQLInsert, copyToClipboard, isImageUrl, isVideoUrl, detectMedia } from '@/lib/utils';
import { MediaPreview } from '@/components/MediaPreview/MediaPreview';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TableData {
  rows: Record<string, any>[];
  columns: ColumnInfo[];
  total: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
}

interface DataTableProps {
  tabId: string;
}

const DataTable = ({ tabId }: DataTableProps) => {
  const { currentView, setCurrentView } = useNavigationStore();
  const { tabs } = useNavigationStore();
  
  const tab = tabs.find(t => t.id === tabId);
  const selectedObject = React.useMemo(() => 
    tab ? { schema: tab.schema, table: tab.name, type: tab.type } : null,
    [tab?.schema, tab?.name, tab?.type]
  );

  const { activeConnectionId } = useConnectionStore();
  const queryStore = useQueryStore();
  const tabQuery = queryStore.getTabQuery(tabId);
  
  const { 
    searchQuery, limit, offset, sortColumn, sortDirection, filters 
  } = tabQuery;

  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: string } | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string | number>>(new Set());
  const [copiedCell, setCopiedCell] = useState<{ row: number; col: string } | null>(null);

  const handleCopy = (text: string, row: number, col: string) => {
    copyToClipboard(text);
    setCopiedCell({ row, col });
    setTimeout(() => setCopiedCell(null), 2000);
  };

  const toggleRowSelection = (id: string | number) => {
    const newSelected = new Set(selectedRowIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedRowIds(newSelected);
  };

  const toggleAllSelection = () => {
    if (!data) return;
    if (selectedRowIds.size === data.rows.length) {
      setSelectedRowIds(new Set());
    } else {
      const allIds = data.rows.map((row, idx) => row.id || idx);
      setSelectedRowIds(new Set(allIds));
    }
  };

  const deleteSelected = () => {
    if (selectedRowIds.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedRowIds.size} selected records?`)) {
      console.log('Deleting:', Array.from(selectedRowIds));
      setSelectedRowIds(new Set());
    }
  };

  useEffect(() => {
    if (selectedObject && activeConnectionId && currentView === 'data') {
      fetchData();
    }
  }, [selectedObject, activeConnectionId, currentView, searchQuery, limit, offset, sortColumn, sortDirection, filters]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        queryStore.setSearchQuery(tabId, searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, tabId]);

  const fetchData = async () => {
    const currentActiveId = useConnectionStore.getState().activeConnectionId;
    if (!selectedObject || !currentActiveId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (searchQuery) params.append('search', searchQuery);
      if (sortColumn) {
        params.append('orderBy', sortColumn);
        params.append('orderDir', sortDirection);
      }
      if (filters.length > 0) {
        params.append('filters', JSON.stringify(filters.map(f => ({ column: f.column, operator: f.operator, value: f.value }))));
      }
      const [rowsRes, schemaRes] = await Promise.all([
        fetch(`/api/tables/${currentActiveId}/${selectedObject.schema}/${selectedObject.table}/rows?${params}`),
        fetch(`/api/tables/${currentActiveId}/${selectedObject.schema}/${selectedObject.table}/schema`)
      ]);
      const rowsData = await rowsRes.json();
      const schemaData = await schemaRes.json();
      setData({
        rows: rowsData.rows || [],
        columns: schemaData.columns?.map((col: any) => ({
          name: col.column_name, type: col.data_type, nullable: col.is_nullable === 'YES', is_pk: !!col.pk_column, is_fk: false
        })) || [],
        total: rowsData.total || 0,
      });
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      queryStore.setSort(tabId, column, sortDirection === 'ASC' ? 'DESC' : 'ASC');
    } else {
      queryStore.setSort(tabId, column, 'ASC');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowsDownUp className="w-3 h-3 text-muted-foreground/30" />;
    return sortDirection === 'ASC' 
      ? <CaretUp className="w-3 h-3 text-foreground" weight="bold" />
      : <CaretDown className="w-3 h-3 text-foreground" weight="bold" />;
  };

  const handleExport = (format: 'csv' | 'json' | 'sql') => {
    if (!data || !selectedObject) return;
    const columns = data.columns.map(c => c.name);
    let content: string, filename: string, mimeType: string;
    switch (format) {
      case 'csv': content = rowsToCSV(data.rows, columns); filename = `${selectedObject.table}.csv`; mimeType = 'text/csv'; break;
      case 'json': content = rowsToJSON(data.rows); filename = `${selectedObject.table}.json`; mimeType = 'application/json'; break;
      case 'sql': content = rowsToSQLInsert(data.rows, `${selectedObject.schema}.${selectedObject.table}`, columns); filename = `${selectedObject.table}.sql`; mimeType = 'text/sql'; break;
      default: return;
    }
    downloadFile(content, filename, mimeType);
  };

  const renderCellValue = (value: any, column: ColumnInfo, rowIndex: number) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground/20 font-mono text-[10px] italic underline decoration-border/20">null</span>;
    const typeCategory = getDataTypeCategory(column.type);
    const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

    // Media detection
    const mediaItems = detectMedia(value);

    if (mediaItems.length > 0) {
      return (
        <div className="flex items-center gap-3 group/media">
          <MediaPreview 
            items={mediaItems} 
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-muted-foreground/40 font-mono truncate max-w-[150px] group-hover/media:text-muted-foreground/60 transition-colors">
              {mediaItems.length > 1 ? `${mediaItems.length} MEDIA ITEMS` : truncateText(displayValue, 30)}
            </div>
          </div>
          <button 
            className="p-1 opacity-0 group-hover/cell:opacity-100 hover:bg-secondary/60 rounded text-muted-foreground/40 hover:text-foreground transition-all active:scale-90" 
            onClick={() => handleCopy(displayValue, rowIndex, column.name)} 
            title="Copy value"
          >
            {copiedCell?.row === rowIndex && copiedCell?.col === column.name ? (
              <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in duration-300" weight="bold" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      );
    }

    const isExpanded = expandedCell?.row === rowIndex && expandedCell?.col === column.name;
    const shouldTruncate = displayValue.length > 50;

    return (
      <div className="group/cell relative flex items-center min-w-[30px] h-6">
        <div className={cn(
          'font-mono text-[12px] leading-tight transition-all tabular-nums',
          isExpanded ? 'whitespace-normal rounded-md bg-secondary/10 p-2 z-50 absolute top-0 left-0 border border-border/40 shadow-2xl min-w-[300px]' : 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]',
          typeCategory === 'numeric' ? 'text-emerald-400/90' : 
          typeCategory === 'date' ? 'text-blue-400/90' :
          typeCategory === 'boolean' ? (value ? 'text-emerald-500' : 'text-rose-500') : 'text-foreground/80'
        )}>
          {typeCategory === 'boolean' ? (value ? 'TRUE' : 'FALSE') : 
           typeCategory === 'json' ? (
             <pre className={cn("text-[10px] bg-secondary/20 p-1.5 rounded border border-border/10 overflow-auto scrollbar-hide", !isExpanded && "max-h-[22px] max-w-[200px]")}>
               {JSON.stringify(value, null, isExpanded ? 2 : 0)}
             </pre>
           ) : (displayValue)}
        </div>
        {!isExpanded && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-all pl-6 bg-gradient-to-l from-background via-background/90 to-transparent">
            {shouldTruncate && (
              <button className="text-[10px] font-bold text-muted-foreground/30 hover:text-foreground uppercase tracking-widest transition-colors mr-1" onClick={() => setExpandedCell({ row: rowIndex, col: column.name })}>
                More
              </button>
            )}
            <button className="p-1 hover:bg-secondary/60 rounded text-muted-foreground/40 hover:text-foreground transition-all active:scale-90" onClick={() => handleCopy(displayValue, rowIndex, column.name)} title="Copy value">
              {copiedCell?.row === rowIndex && copiedCell?.col === column.name ? (
                <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in duration-300" weight="bold" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}
        {isExpanded && (
          <button className="fixed inset-0 z-40 bg-background/5 cursor-default" onClick={() => setExpandedCell(null)} />
        )}
      </div>
    );
  };

  if (!selectedObject) return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground/10 bg-background">
      <div className="text-center">
        <TableIcon className="h-24 w-24 mx-auto mb-6 opacity-5" weight="thin" />
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground/40">Select a table to start</p>
      </div>
    </div>
  );

  const totalPages = Math.ceil((data?.total || 0) / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden select-none">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-2.5 bg-secondary/5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-sm bg-foreground/5 flex items-center justify-center border border-border/10">
            <TableIcon className="w-3.5 h-3.5 text-foreground/50" weight="regular" />
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-foreground/90">{selectedObject.schema}.{selectedObject.table}</h2>
            {data && <p className="text-[10px] text-muted-foreground/40 font-medium">{data.total.toLocaleString()} rows · {data.columns.length} columns</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedRowIds.size > 0 && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-300 mr-2">
              <span className="text-[11px] font-medium text-foreground/60 px-2 py-1 bg-foreground/[0.03] rounded-md border border-foreground/[0.05]">
                {selectedRowIds.size} selected
              </span>
              <Button 
                variant="destructive" 
                size="sm" 
                className="h-7 px-3 text-[11px] font-medium bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 transition-all active:scale-95"
                onClick={deleteSelected}
              >
                <Trash className="w-3.5 h-3.5 mr-1.5" />
                Delete
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 px-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-all"
                onClick={() => setSelectedRowIds(new Set())}
              >
                Clear
              </Button>
              <div className="w-px h-4 bg-border/20 mx-1" />
            </div>
          )}
          <div className="relative group">
            <MagnifyingGlass className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30 group-focus-within:text-foreground/50 transition-colors" />
            <Input
              placeholder="Search table..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 w-[140px] h-7 text-[11px] font-medium bg-secondary/10 border-border/10 focus:w-[220px] transition-all rounded-md"
            />
          </div>
          <Button variant="ghost" size="sm" className={cn("h-7 text-[11px] px-3 font-medium text-muted-foreground hover:text-foreground transition-all", showFilters && "bg-primary text-primary-foreground hover:bg-primary/90")} onClick={() => setShowFilters(!showFilters)}>
            Filters {filters.length > 0 && `(${filters.length})`}
          </Button>          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-3 font-medium text-muted-foreground/60 hover:text-foreground">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border/40 min-w-[120px]">
              {['CSV', 'JSON', 'SQL'].map(f => (
                <DropdownMenuItem key={f} onClick={() => handleExport(f.toLowerCase() as any)} className="text-[11px] font-medium cursor-pointer">{f}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
      <div className="h-4 w-[1px] bg-border/10 mx-1" />
      <div className="flex items-center p-0.5 bg-secondary/30 rounded-md border border-border/10">
        {['data', 'schema', 'sql'].map(v => (
          <button key={v} onClick={() => setCurrentView(v as any)} className={cn('px-3 py-1 text-[10px] font-medium capitalize rounded-md transition-all', currentView === v ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/30 hover:text-foreground')}>
            {v}
          </button>
        ))}
      </div>

    </div>
  </div>
  {showFilters && (
    <FilterPanel 
      columns={data?.columns || []} 
      filters={filters} 
      onAddFilter={(f) => queryStore.addFilter(tabId, f)} 
      onRemoveFilter={(id) => queryStore.removeFilter(tabId, id)} 
      onClearFilters={() => queryStore.clearFilters(tabId)} 
    />
  )}
      {loading ? (
        <div className="flex-1 flex items-center justify-center bg-background"><CircleNotch className="w-5 h-5 animate-spin text-muted-foreground/10" /></div>
      ) : data ? (
        <>
          <div className="flex-1 overflow-auto custom-scrollbar">
            <Table className="border-collapse border-spacing-0">
              <TableHeader className="bg-secondary/40 sticky top-0 z-10 backdrop-blur-2xl border-b border-border/20">
                <TableRow className="hover:bg-transparent border-b border-border/20">
                  <TableHead className="w-[30px] px-0 border-none h-8">
                    <div className="flex items-center justify-center h-full">
                      <button
                        onClick={toggleAllSelection}
                        className={cn(
                          "w-3 h-3 rounded-sm border transition-all flex items-center justify-center active:scale-90 shadow-sm",
                          data.rows.length > 0 && selectedRowIds.size === data.rows.length 
                            ? "bg-foreground border-foreground text-background" 
                            : selectedRowIds.size > 0
                              ? "bg-foreground/40 border-foreground/40 text-background"
                              : "border-foreground/40 hover:border-foreground/60"
                        )}
                      >
                        {selectedRowIds.size === data.rows.length && data.rows.length > 0 && <Check weight="bold" className="w-2.5 h-2.5" />}
                        {selectedRowIds.size > 0 && selectedRowIds.size < data.rows.length && <Minus weight="bold" className="w-2.5 h-2.5" />}
                      </button>
                    </div>
                  </TableHead>                  {data.columns.map(column => (
                    <TableHead key={column.name} className="h-8 py-0 cursor-pointer hover:bg-secondary/20 transition-all border-none font-bold group/head" onClick={() => handleSort(column.name)}>
                      <div className="flex items-center gap-2 px-2">
                        {column.is_pk && <span className="text-[8px] font-bold text-amber-500/60 uppercase">PK</span>}
                        <span className="text-[11px] font-semibold text-foreground/60 transition-colors group-hover/head:text-foreground">{column.name}</span>
                        <span className="text-[8px] font-medium text-muted-foreground/20 bg-foreground/[0.03] px-1 py-0.5 rounded border border-foreground/[0.05] group-hover/head:text-muted-foreground/40 transition-colors uppercase">{column.type}</span>
                        <div className="opacity-0 group-hover/head:opacity-100 transition-opacity">
                          {getSortIcon(column.name)}
                        </div>
                      </div>
                    </TableHead>
                  ))}

                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow><TableCell colSpan={data.columns.length + 1} className="text-center py-40 text-[11px] text-muted-foreground/20 font-medium italic">No results found</TableCell></TableRow>
                ) : data.rows.map((row, rowIndex) => {
                  const rowId = row.id || rowIndex;
                  const isSelected = selectedRowIds.has(rowId);
                  return (
                    <TableRow key={rowIndex} className={cn("border-b border-border/5 hover:bg-secondary/10 transition-all duration-75 group", isSelected && "bg-foreground/[0.03] hover:bg-foreground/[0.05]")}>
                      <TableCell className="w-[30px] px-0 border-none">
                        <div className="flex items-center justify-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleRowSelection(rowId); }}
                            className={cn(
                              "w-3 h-3 rounded-sm border transition-all flex items-center justify-center active:scale-90 shadow-xs",
                              isSelected 
                                ? "bg-foreground border-foreground text-background" 
                                : "border-foreground/20 group-hover:border-foreground/40 hover:border-foreground/60"
                            )}
                          >
                            {isSelected && <Check weight="bold" className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      </TableCell>
                      {data.columns.map(column => (
                        <TableCell key={column.name} className="py-1 px-4 border-none last:border-r-0">
                          {renderCellValue(row[column.name], column, rowIndex)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between border-t border-border/40 p-2 bg-secondary/5 backdrop-blur-2xl">
            <div className="flex items-center gap-4">
              <span className="text-[10px] text-muted-foreground/40 font-medium px-4">{offset + 1}-{Math.min(offset + limit, data.total)} of {data.total.toLocaleString()} rows</span>
          <Select value={String(limit)} onValueChange={v => queryStore.setLimit(tabId, Number(v))}>
            <SelectTrigger className="h-7 text-[10px] bg-background/30 border-border/10 w-[90px] font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border/40">
              {[25, 50, 100, 500].map(val => <SelectItem key={val} value={String(val)} className="text-[10px] font-medium">{val} per page</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 px-4">
          <Button variant="ghost" size="icon" className="h-7 w-7 border border-border/10 bg-background/20 hover:bg-background/40 transition-all active:scale-90" onClick={() => queryStore.setOffset(tabId, Math.max(0, offset - limit))} disabled={offset === 0}><CaretLeft className="w-3.5 h-3.5 text-muted-foreground/40" /></Button>
          <div className="px-3 font-semibold tabular-nums text-foreground/50 text-[11px] min-w-[70px] text-center">{currentPage} of {totalPages || 1}</div>
          <Button variant="ghost" size="icon" className="h-7 w-7 border border-border/10 bg-background/20 hover:bg-background/40 transition-all active:scale-90" onClick={() => queryStore.setOffset(tabId, offset + limit)} disabled={offset + limit >= data.total}><CaretRight className="w-3.5 h-3.5 text-muted-foreground/40" /></Button>
        </div>
      </div>
        </>
      ) : null}
    </div>
  );
};

const FilterPanel = ({ columns, filters, onAddFilter, onRemoveFilter, onClearFilters }: { columns: ColumnInfo[]; filters: any[]; onAddFilter: (filter: any) => void; onRemoveFilter: (id: string) => void; onClearFilters: () => void; }) => {
  const [column, setColumn] = useState(columns[0]?.name || '');
  const [operator, setOperator] = useState('equals');
  const [value, setValue] = useState('');
  const ops = (c: string) => {
    const col = columns.find(x => x.name === c);
    if (!col) return ['equals'];
    const cat = getDataTypeCategory(col.type);
    if (cat === 'text') return ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null', 'regex'];
    if (cat === 'numeric') return ['equals', 'not_equals', 'gt', 'lt', 'gte', 'lte', 'between', 'is_null', 'is_not_null'];
    if (cat === 'date') return ['equals', 'gt', 'lt', 'between', 'last_n_days', 'is_null', 'is_not_null'];
    if (cat === 'boolean') return ['is_true', 'is_false', 'is_null', 'is_not_null'];
    return ['equals', 'not_equals', 'is_null', 'is_not_null'];
  };
  const labels: Record<string, string> = { equals: '=', not_equals: '≠', contains: 'CONTAINS', starts_with: 'STARTS', ends_with: 'ENDS', gt: '>', lt: '<', gte: '≥', lte: '≤', between: 'BETWEEN', is_null: 'NULL', is_not_null: '!NULL', regex: 'RE', is_true: 'TRUE', is_false: 'FALSE', last_n_days: 'RECENT' };
  const add = () => { if (column && operator) { onAddFilter({ column, operator, value }); setValue(''); } };

  return (
    <div className="border-b border-border/40 p-4 bg-secondary/5 animate-in slide-in-from-top-1 duration-200">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2"><Funnel className="w-3.5 h-3.5 text-muted-foreground/40" /><span className="text-[11px] font-semibold text-muted-foreground/50">Query filters</span></div>
        {filters.length > 0 && <Button variant="ghost" size="sm" className="h-7 text-[10px] font-medium text-destructive hover:text-destructive/80" onClick={onClearFilters}>Reset all</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-3 p-3 bg-card border border-border/10 rounded-md">
        <Select value={column} onValueChange={setColumn}><SelectTrigger className="w-[140px] h-8 text-[11px] font-medium bg-background border-border/10"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border/40 min-w-[140px]">{columns.map(c => <SelectItem key={c.name} value={c.name} className="text-[11px] font-medium">{c.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={operator} onValueChange={setOperator}><SelectTrigger className="w-[120px] h-8 text-[11px] font-medium bg-background border-border/10"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card border-border/40 min-w-[120px]">{column && ops(column).map(o => <SelectItem key={o} value={o} className="text-[11px] font-medium">{labels[o] || o}</SelectItem>)}</SelectContent>
        </Select>
        {!['is_null', 'is_not_null', 'is_true', 'is_false'].includes(operator) && <Input value={value} onChange={e => setValue(e.target.value)} placeholder="Value..." className="h-8 text-[11px] font-medium bg-background border-border/10 flex-1 min-w-[140px]" />}
        <Button onClick={add} disabled={!column || !operator || (!['is_null', 'is_not_null', 'is_true', 'is_false'].includes(operator) && !value)} className="h-8 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-all">Add filter</Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-4 px-1">
        {filters.map(f => (
          <div key={f.id} className="flex items-center gap-2 bg-secondary/20 border border-border/10 px-3 py-1.5 rounded-md text-[11px] font-medium shadow-sm hover:border-border/30 group">
            <span className="text-muted-foreground/60">{f.column}</span><span className="text-muted-foreground/40">{labels[f.operator] || f.operator}</span>
            {f.value && <span className="text-foreground/90 font-semibold">{f.value}</span>}
            <button className="ml-1 text-muted-foreground/20 group-hover:text-destructive transition-colors" onClick={() => onRemoveFilter(f.id)}><X className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export { DataTable };