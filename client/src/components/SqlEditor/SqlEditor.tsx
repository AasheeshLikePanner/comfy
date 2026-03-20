import React, { useState, useEffect, useCallback } from 'react';
import { useQueryStore } from '@/store/query';
import { useConnectionStore } from '@/store/connection';
import { useNavigationStore } from '@/store/navigation';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Play,
  CircleNotch,
  Clock,
  Rows,
  Warning,
  Copy,
  Star,
  Trash,
  Plus,
  Check,
} from '@phosphor-icons/react';
import { formatDuration, copyToClipboard, getDataTypeCategory, truncateText, isImageUrl, isVideoUrl, detectMedia } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { MediaPreview } from '@/components/MediaPreview/MediaPreview';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const SqlEditor = () => {
  const { sql, setSql, results, setResults, isExecuting, setIsExecuting, addToHistory, history, savedQueries, saveQuery, deleteSavedQuery, restoreFromHistory, toggleFavorite } = useQueryStore();
  const { activeConnectionId } = useConnectionStore();
  const { selectedObject } = useNavigationStore();

  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('editor');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [queryName, setQueryName] = useState('');
  const [expandedCell, setExpandedCell] = useState<{ row: number; col: string } | null>(null);
  const [copiedCell, setCopiedCell] = useState<{ row: number; col: string } | null>(null);
  const [copiedJSON, setCopiedJSON] = useState(false);

  const handleCopy = (text: string, row: number, col: string) => {
    copyToClipboard(text);
    setCopiedCell({ row, col });
    setTimeout(() => setCopiedCell(null), 2000);
  };

  const handleCopyJSON = (text: string) => {
    copyToClipboard(text);
    setCopiedJSON(true);
    setTimeout(() => setCopiedJSON(false), 2000);
  };

  useEffect(() => {
    if (selectedObject) {
      setSql(`SELECT * FROM ${selectedObject.schema}.${selectedObject.table} LIMIT 100;`);
    }
  }, [selectedObject, setSql]);

  const executeQuery = async () => {
    if (!activeConnectionId || !sql.trim()) return;
    setIsExecuting(true);
    setError(null);
    setResults([]);
    try {
      const response = await fetch(`/api/query/${activeConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sql.trim() }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error + (data.detail ? `\n${data.detail}` : '') + (data.hint ? `\nHint: ${data.hint}` : ''));
        setActiveTab('error');
      } else {
        setResults([data]);
        addToHistory({ sql, timestamp: new Date(), rowCount: data.rowCount, duration: data.duration });
        setActiveTab('results');
      }
    } catch (err: any) {
      setError(err.message);
      setActiveTab('error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleSave = () => {
    if (queryName.trim() && sql.trim()) {
      saveQuery(queryName.trim(), sql.trim());
      setQueryName('');
      setSaveDialogOpen(false);
    }
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); executeQuery(); }
    if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); setSaveDialogOpen(true); }
  }, [executeQuery, sql]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const result = results[0];

  const renderCellValue = (value: any, fieldName: string, rowIndex: number) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground/20 font-mono text-[10px] italic underline decoration-border/20">null</span>;
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
            onClick={() => handleCopy(displayValue, rowIndex, fieldName)} 
            title="Copy value"
          >
            {copiedCell?.row === rowIndex && copiedCell?.col === fieldName ? (
              <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in duration-300" weight="bold" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      );
    }

    const isExpanded = expandedCell?.row === rowIndex && expandedCell?.col === fieldName;
    const shouldTruncate = displayValue.length > 50;

    return (
      <div className="group/cell relative flex items-center min-w-[30px] h-6">
        <div className={cn(
          'font-mono text-[12px] leading-tight transition-all tabular-nums',
          isExpanded ? 'whitespace-normal rounded-md bg-secondary/10 p-2 z-50 absolute top-0 left-0 border border-border/40 shadow-2xl min-w-[300px]' : 'whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]',
          'text-foreground/80'
        )}>
          {typeof value === 'object' ? (
            <pre className={cn("text-[10px] bg-secondary/20 p-1.5 rounded border border-border/10 overflow-auto scrollbar-hide", !isExpanded && "max-h-[22px] max-w-[200px]")}>
              {JSON.stringify(value, null, isExpanded ? 2 : 0)}
            </pre>
          ) : displayValue}
        </div>
        {!isExpanded && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover/cell:opacity-100 transition-all pl-6 bg-gradient-to-l from-background via-background/90 to-transparent">
            {shouldTruncate && (
              <button className="text-[10px] font-bold text-muted-foreground/30 hover:text-foreground uppercase tracking-widest transition-colors mr-1" onClick={() => setExpandedCell({ row: rowIndex, col: fieldName })}>
                More
              </button>
            )}
            <button className="p-1 hover:bg-secondary/60 rounded text-muted-foreground/40 hover:text-foreground active:scale-90" onClick={() => handleCopy(displayValue, rowIndex, fieldName)}>
              {copiedCell?.row === rowIndex && copiedCell?.col === fieldName ? (
                <Check className="w-3 h-3 text-emerald-500 animate-in zoom-in duration-300" weight="bold" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          </div>
        )}
        {isExpanded && <button className="fixed inset-0 z-40 bg-background/5 cursor-default" onClick={() => setExpandedCell(null)} />}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden select-none">
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-2.5 bg-secondary/5 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Button onClick={executeQuery} disabled={isExecuting || !activeConnectionId} className="h-8 px-4 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold tracking-tight transition-all">
            {isExecuting ? <CircleNotch className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-2" weight="fill" />}
            Execute
          </Button>
          <span className="text-[10px] font-medium text-muted-foreground/40">{isExecuting ? 'Processing...' : '⌘ + Enter'}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2.5 font-medium text-muted-foreground/60 hover:text-foreground" onClick={() => setSaveDialogOpen(true)}>
            <Star className="w-3.5 h-3.5 mr-1.5" /> Save query
          </Button>
          <div className="h-4 w-[1px] bg-border/10 mx-1" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2.5 font-medium text-muted-foreground/60 hover:text-foreground">
                History ({history.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[380px] bg-card border-border/40 shadow-2xl">
              <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground/50">Saved queries</DropdownMenuLabel>
              {savedQueries.map(q => (
                <DropdownMenuItem key={q.id} onClick={() => { setSql(q.sql); setActiveTab('editor'); }} className="flex items-center justify-between group cursor-pointer">
                  <span className="text-[11px] font-bold truncate max-w-[250px]">{q.name}</span>
                  <button className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all" onClick={(e) => { e.stopPropagation(); deleteSavedQuery(q.id); }}><Trash className="h-3 w-3" /></button>
                </DropdownMenuItem>
              ))}
              {savedQueries.length > 0 && <DropdownMenuSeparator className="bg-border/10" />}
              <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground/50">Recent history</DropdownMenuLabel>
              {history.slice(0, 8).map(h => (
                <DropdownMenuItem key={h.id} onClick={() => { setSql(h.sql); setActiveTab('editor'); }} className="flex items-center justify-between group cursor-pointer">
                  <span className="text-[10px] font-mono opacity-60 truncate max-w-[220px]">{h.sql}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold opacity-30 tabular-nums">{h.duration}ms</span>
                    <button className={cn('hover:text-amber-500 transition-all', h.favorite ? 'text-amber-500' : 'opacity-20')} onClick={(e) => { e.stopPropagation(); toggleFavorite(h.id); }}><Star weight={h.favorite ? "fill" : "regular"} className="h-3 w-3" /></button>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 pt-2 bg-secondary/5 border-b border-border/40">
          <TabsList className="bg-transparent h-7 p-0 gap-4">
            {['editor', 'results', 'error'].map(tab => (
              (tab !== 'error' || error) && (
                <TabsTrigger key={tab} value={tab} className="h-7 px-0 rounded-none border-b-2 border-transparent data-[state=active]:border-primary bg-transparent data-[state=active]:bg-transparent text-[11px] font-medium text-muted-foreground/40 data-[state=active]:text-foreground transition-all">
                  {tab === 'results' && result && <span className="mr-2 px-1 bg-primary/10 text-primary rounded-xs text-[9px] font-bold">{result.rowCount}</span>}
                  <span className="capitalize">{tab}</span>
                </TabsTrigger>
              )
            ))}
          </TabsList>
        </div>

        <TabsContent value="editor" className="flex-1 m-0 overflow-hidden outline-none">
          <Editor
            height="100%"
            defaultLanguage="sql"
            value={sql}
            onChange={(v) => setSql(v || '')}
            theme="dbviz-dark"
            beforeMount={(monaco) => {
              monaco.editor.defineTheme('dbviz-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [],
                colors: {
                  'editor.background': '#121212',
                },
              });
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              lineNumbers: 'on',
              glyphMargin: false,
              folding: false,
              lineDecorationsWidth: 10,
              lineNumbersMinChars: 3,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              padding: { top: 20 },
              renderLineHighlight: 'all'
            }}
          />
        </TabsContent>

        <TabsContent value="results" className="flex-1 m-0 overflow-hidden bg-[linear-gradient(rgba(255,255,255,0.01)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.01)_1px,transparent_1px)] bg-[size:40px_40px]">
          {result ? (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-6 px-6 py-2 border-b border-border/40 bg-secondary/10 backdrop-blur-xl">
                <div className="flex items-center gap-1.5"><Rows className="w-3 h-3 text-muted-foreground/30" /><span className="text-[9px] font-black uppercase tracking-widest text-foreground/50">{result.rowCount?.toLocaleString()} rows</span></div>
                <div className="flex items-center gap-1.5"><Clock className="w-3 h-3 text-muted-foreground/30" /><span className="text-[9px] font-black uppercase tracking-widest text-foreground/50">{formatDuration(result.duration || 0)}</span></div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "h-6 text-[9px] font-black uppercase tracking-widest border border-border/10 ml-auto transition-all",
                    copiedJSON ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/5" : "text-foreground/40 hover:text-foreground"
                  )} 
                  onClick={() => handleCopyJSON(JSON.stringify(result.rows, null, 2))}
                >
                  {copiedJSON ? <Check className="w-3 h-3 mr-1.5 animate-in zoom-in duration-300" weight="bold" /> : <Copy className="w-3 h-3 mr-1.5" />}
                  {copiedJSON ? 'Copied' : 'Copy JSON'}
                </Button>
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                <Table>
                  <TableHeader className="bg-secondary/40 sticky top-0 z-10 backdrop-blur-2xl border-b border-border/20">
                    <TableRow className="hover:bg-transparent border-b border-border/20">
                      <TableHead className="w-[30px] px-0 border-none h-8">
                        <div className="flex items-center justify-center h-full">
                          <Rows className="w-3 h-3 text-muted-foreground/30" />
                        </div>
                      </TableHead>
                      {result.fields?.map((f) => (
                        <TableHead key={f.name} className="h-8 py-0 cursor-pointer hover:bg-secondary/20 transition-all border-none font-bold group/head">
                          <div className="flex items-center gap-1.5 px-2">
                            <span className="text-[11px] font-semibold text-foreground/60 transition-colors group-hover/head:text-foreground">{f.name}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows?.map((row, rowIndex) => (
                      <TableRow key={rowIndex} className="border-b border-border/5 hover:bg-secondary/15 transition-all duration-75 group">
                        <TableCell className="w-[30px] px-0 border-none">
                          <div className="flex items-center justify-center text-[9px] font-mono text-muted-foreground/20 italic tabular-nums">
                            {rowIndex + 1}
                          </div>
                        </TableCell>
                        {result.fields?.map((f) => (
                          <TableCell key={f.name} className="py-1 px-4 border-none">
                            {renderCellValue(row[f.name], f.name, rowIndex)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/10 select-none">
              <Play className="h-16 w-16 mb-4 opacity-10" weight="thin" />
              <p className="text-[10px] font-black uppercase tracking-[0.4em]">Awaiting Execution</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="error" className="flex-1 m-0 overflow-auto bg-destructive/5 select-text p-8">
          <div className="flex items-start gap-4 max-w-2xl mx-auto">
            <div className="w-8 h-8 rounded bg-destructive/20 flex items-center justify-center shrink-0 border border-destructive/20"><Warning className="h-4 w-4 text-destructive" weight="bold" /></div>
            <div className="flex flex-col gap-2">
              <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-destructive">Execution Failed</h3>
              <pre className="text-[12px] font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap selection:bg-destructive/40">{error}</pre>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {saveDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card w-full max-w-md border border-border/40 shadow-[0_0_50px_rgba(0,0,0,0.5)] rounded-sm p-6 overflow-hidden">
            <h2 className="text-[14px] font-semibold mb-6 text-foreground/80">Save query</h2>
            <div className="space-y-6">
              <div>
                <label className="text-[12px] font-medium text-muted-foreground/60 mb-2 block">Query identifier</label>
                <Input placeholder="Enter a name..." value={queryName} onChange={(e) => setQueryName(e.target.value)} autoFocus className="h-10 text-[13px] bg-secondary/5 border-border/10" />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="ghost" className="h-10 px-4 font-medium text-muted-foreground hover:text-foreground" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={!queryName.trim()} className="h-10 px-6 bg-primary text-primary-foreground hover:bg-primary/90 font-medium rounded-md">Save query</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export { SqlEditor };