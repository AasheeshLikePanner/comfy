import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useConnectionStore } from '@/store/connection';
import { useNavigationStore } from '@/store/navigation';
import { useQueryStore } from '@/store/query';
import { cn } from '@/lib/utils';
import { 
  Table, Eye, Function, Stack, LinkSimple, MagnifyingGlass, 
  Clock, X, CircleNotch, Database, CaretRight 
} from '@phosphor-icons/react';

interface SearchResult {
  tables: Array<{ schema: string; name: string; type: string; score: number }>;
  columns: Array<{ schema: string; table: string; column: string; type: string; is_fk: boolean; fk_ref?: string; score: number }>;
  relationships: Array<{ from: { schema: string; table: string; column: string }; to: { schema: string; table: string; column: string }; score: number }>;
  values: Array<{ schema: string; table: string; column: string; value: string; row: any }>;
  valueCounts?: Array<{ schema: string; table: string; column: string; count: number }>;
  cachedAt?: number;
}

const HISTORY_KEY = 'cleo-search-history';
const MAX_HISTORY = 10;

function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function addToHistory(term: string) {
  const h = getHistory().filter(x => x !== term);
  h.unshift(term);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
}
function removeFromHistory(term: string) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(getHistory().filter(x => x !== term)));
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-500/20 text-foreground rounded-[2px] px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const getIcon = (type: string, className = 'w-3.5 h-3.5') => {
  switch (type) {
    case 'table': return <Table className={cn(className, 'text-muted-foreground/40')} weight="duotone" />;
    case 'view': return <Eye className={cn(className, 'text-indigo-400/40')} />;
    case 'materialized_view': return <Eye className={cn(className, 'text-orange-400/40')} />;
    case 'function': return <Function className={cn(className, 'text-amber-400/70')} />;
    case 'sequence': return <Stack className={cn(className, 'text-rose-400/70')} />;
    default: return <Table className={cn(className, 'text-muted-foreground/40')} weight="duotone" />;
  }
};

interface FlatItem {
  id: string;
  type: 'table' | 'column' | 'relation' | 'value';
  action: () => void;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'tables' | 'columns' | 'values' | 'relations'>('tables');
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const listRef = useRef<HTMLDivElement>(null);

  const { activeConnectionId } = useConnectionStore();
  const { selectObject } = useNavigationStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setHistory(getHistory());
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      setActiveTab('tables');
      setActiveIndex(0);
      return;
    }
    setLoading(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!activeConnectionId) return;
      try {
        const res = await fetch(`/api/search/${activeConnectionId}?q=${encodeURIComponent(query)}`);
        if (!res.ok) {
          setResults({ tables: [], columns: [], relationships: [], values: [], valueCounts: [] });
          return;
        }
        const data = await res.json();
        setResults({
          tables: data.tables || [],
          columns: data.columns || [],
          relationships: data.relationships || [],
          values: data.values || [],
          valueCounts: data.valueCounts || [],
          cachedAt: data.cachedAt,
        });
        if (data.tables?.length) setActiveTab('tables');
        else if (data.columns?.length) setActiveTab('columns');
        else if (data.relationships?.length) setActiveTab('relations');
        else if (data.values?.length) setActiveTab('values');
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => clearTimeout(timerRef.current);
  }, [query, activeConnectionId]);

  useEffect(() => { setActiveIndex(0); }, [activeTab, query]);

  const navigate = useCallback((schema: string, table: string, type = 'table', column?: string, value?: string) => {
    if (query) addToHistory(query);
    selectObject(schema, table, type as any);
    if (column && value) {
      const tabId = `${schema}.${table}`;
      const qs = useQueryStore.getState();
      qs.clearFilters(tabId);
      qs.addFilter(tabId, { column, operator: 'equals', value });
    }
    setOpen(false);
    setQuery('');
  }, [query, selectObject]);

  const getFlatItems = useCallback((): FlatItem[] => {
    if (!results) return [];
    const items: FlatItem[] = [];
    if (activeTab === 'tables') {
      results.tables.forEach((t, i) => items.push({ id: `t-${i}`, type: 'table', action: () => navigate(t.schema, t.name, t.type) }));
    } else if (activeTab === 'columns') {
      results.columns.forEach((c, i) => items.push({ id: `c-${i}`, type: 'column', action: () => navigate(c.schema, c.table) }));
    } else if (activeTab === 'relations') {
      results.relationships.forEach((r, i) => items.push({ id: `r-${i}`, type: 'relation', action: () => navigate(r.from.schema, r.from.table) }));
    } else if (activeTab === 'values') {
      results.values.forEach((v, i) => items.push({ id: `v-${i}`, type: 'value', action: () => navigate(v.schema, v.table, 'table', v.column, v.value) }));
    }
    return items;
  }, [results, activeTab, navigate]);

  // Keyboard nav
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const items = getFlatItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].action();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, activeIndex, getFlatItems]);

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeIndex]);

  const hasResults = results && ((results.tables?.length || 0) + (results.columns?.length || 0) + (results.relationships?.length || 0) + (results.values?.length || 0) > 0);
  const tabCounts = results ? {
    tables: results.tables?.length || 0,
    columns: results.columns?.length || 0,
    values: results.values?.length || 0,
    relations: results.relationships?.length || 0,
  } : { tables: 0, columns: 0, values: 0, relations: 0 };

  let itemIdx = 0;

  const dialog = open ? createPortal(
    <div 
      data-search-portal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}
      onClick={() => setOpen(false)}
    >
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} />
      <div 
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 680, background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center px-5 py-4" style={{ borderBottom: '1px solid hsl(var(--border) / 0.2)' }}>
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-secondary/30 mr-3">
            <MagnifyingGlass className="w-4 h-4 text-muted-foreground/50" weight="bold" />
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tables, columns, values, relationships..."
            className="flex-1 bg-transparent text-[14px] font-medium text-foreground placeholder:text-muted-foreground/25 outline-none"
            autoFocus
          />
          {loading && <CircleNotch className="w-4 h-4 animate-spin text-muted-foreground/30 mr-2" />}
          {query && <button onClick={() => setQuery('')} className="p-1 hover:bg-secondary/50 rounded-md text-muted-foreground/30 hover:text-foreground transition-colors mr-2"><X className="w-3.5 h-3.5" weight="bold" /></button>}
          <div className="px-1.5 py-1 bg-secondary/20 rounded border border-border/15"><kbd className="text-[8px] font-mono text-muted-foreground/30">ESC</kbd></div>
        </div>

        {/* Tabs */}
        {hasResults && (
          <div className="flex items-center gap-1 px-5 py-2" style={{ borderBottom: '1px solid hsl(var(--border) / 0.15)' }}>
            {[
              { key: 'tables' as const, label: 'Tables', icon: Table },
              { key: 'columns' as const, label: 'Columns', icon: Function },
              { key: 'relations' as const, label: 'Relations', icon: LinkSimple },
              { key: 'values' as const, label: 'Values', icon: Database },
            ].filter(t => tabCounts[t.key] > 0).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-semibold transition-all", activeTab === tab.key ? "bg-foreground/5 text-foreground" : "text-muted-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.03]")}
              >
                <tab.icon className="w-3 h-3" weight="bold" />
                {tab.label}
                <span className="ml-1 text-[9px] opacity-60">{tabCounts[tab.key]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto">
          {/* History */}
          {!query && !loading && (
            <div className="py-3">
              <div className="px-5 py-1 flex items-center gap-2">
                <Clock className="w-3 h-3 text-muted-foreground/20" />
                <span className="text-[9px] font-bold text-muted-foreground/25 uppercase tracking-[0.15em]">Recent</span>
              </div>
              {history.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <MagnifyingGlass className="w-10 h-10 mx-auto mb-3 text-muted-foreground/5" />
                  <p className="text-[11px] text-muted-foreground/20 font-medium">Start typing to search your database</p>
                </div>
              ) : history.map(term => (
                <div key={term} onClick={() => setQuery(term)} className="group flex items-center gap-3 px-5 py-2 cursor-pointer hover:bg-foreground/[0.03] transition-colors">
                  <Clock className="w-3 h-3 text-muted-foreground/15" />
                  <span className="text-[12px] font-medium text-muted-foreground/50 flex-1">{term}</span>
                  <button onClick={e => { e.stopPropagation(); removeFromHistory(term); setHistory(getHistory()); }} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-secondary/30 rounded text-muted-foreground/20 hover:text-destructive transition-all"><X className="w-3 h-3" weight="bold" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && query && (
            <div className="py-3">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="w-8 h-8 rounded-lg bg-secondary/30 animate-pulse" />
                  <div className="flex-1">
                    <div className="h-3 bg-secondary/30 rounded animate-pulse mb-1.5" style={{ width: `${50 + i * 15}%` }} />
                    <div className="h-2 bg-secondary/20 rounded animate-pulse" style={{ width: `${30 + i * 10}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tables */}
          {!loading && results && activeTab === 'tables' && results.tables.length > 0 && (
            <div className="py-2">
              {results.tables.map((t, i) => {
                const idx = itemIdx++;
                const isActive = activeIndex === idx;
                return (
                  <div key={`${t.schema}.${t.name}`} data-index={idx} onClick={() => navigate(t.schema, t.name, t.type)} className={cn("group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors", isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]")}>
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", isActive ? "bg-secondary/40" : "bg-secondary/20")}>{getIcon(t.type, 'w-4 h-4')}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-foreground">{highlightMatch(t.name, query)}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30"><span>{highlightMatch(t.schema, query)}</span><span>·</span><span className="uppercase">{t.type}</span></div>
                    </div>
                    <CaretRight className="w-3 h-3 text-muted-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Columns */}
          {!loading && results && activeTab === 'columns' && results.columns.length > 0 && (
            <div className="py-2">
              {results.columns.map((c, i) => {
                const idx = itemIdx++;
                const isActive = activeIndex === idx;
                return (
                  <div key={`${c.schema}.${c.table}.${c.column}`} data-index={idx} onClick={() => navigate(c.schema, c.table)} className={cn("group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors", isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]")}>
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", isActive ? "bg-secondary/40" : "bg-secondary/20")}>
                      {c.is_fk ? <LinkSimple className="w-4 h-4 text-muted-foreground/30" /> : <span className="text-[10px] font-mono font-bold text-muted-foreground/25">Aa</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold text-foreground">{highlightMatch(c.column, query)}</span>
                        {c.is_fk && <span className="flex items-center gap-1 text-[9px] text-muted-foreground/30"><LinkSimple className="w-2.5 h-2.5" />→ {c.fk_ref}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30"><span>{highlightMatch(c.table, query)}</span><span>·</span><span className="font-mono">{c.type}</span></div>
                    </div>
                    <CaretRight className="w-3 h-3 text-muted-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Relations */}
          {!loading && results && activeTab === 'relations' && results.relationships.length > 0 && (
            <div className="py-2">
              {results.relationships.map((r, i) => {
                const idx = itemIdx++;
                const isActive = activeIndex === idx;
                return (
                  <div key={`${r.from.schema}.${r.from.table}.${r.from.column}`} data-index={idx} onClick={() => navigate(r.from.schema, r.from.table)} className={cn("group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors", isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]")}>
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", isActive ? "bg-secondary/40" : "bg-secondary/20")}><LinkSimple className="w-4 h-4 text-muted-foreground/30" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[12px]">
                        <span className="font-semibold text-foreground">{highlightMatch(r.from.table, query)}</span><span className="text-muted-foreground/20">.</span>
                        <span className="font-mono text-muted-foreground/50">{highlightMatch(r.from.column, query)}</span><span className="text-muted-foreground/20 mx-1">→</span>
                        <span className="font-semibold text-foreground">{r.to.table}</span><span className="text-muted-foreground/20">.</span>
                        <span className="font-mono text-muted-foreground/50">{r.to.column}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/30">Foreign key relationship</div>
                    </div>
                    <CaretRight className="w-3 h-3 text-muted-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Values - with grouped counts */}
          {!loading && results && activeTab === 'values' && results.values.length > 0 && (
            <div className="py-2">
              {results.valueCounts && results.valueCounts.length > 0 && (
                <div className="px-5 py-2 mb-1">
                  <div className="text-[9px] font-bold text-muted-foreground/25 uppercase tracking-[0.15em] mb-2">
                    {results.valueCounts.reduce((a, c) => a + c.count, 0)} total matches across {results.valueCounts.length} columns
                  </div>
                  {results.valueCounts.map((vc, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] text-muted-foreground/30 py-0.5">
                      <span className="font-mono">{vc.schema}.{vc.table}</span>
                      <span className="text-muted-foreground/15">·</span>
                      <span>{vc.column}</span>
                      <span className="text-muted-foreground/15">—</span>
                      <span className="text-foreground/50 font-medium">{vc.count} match{vc.count !== 1 ? 'es' : ''}</span>
                    </div>
                  ))}
                  <div className="h-px bg-border/10 my-2" />
                </div>
              )}
              {results.values.map((v, i) => {
                const idx = itemIdx++;
                const isActive = activeIndex === idx;
                return (
                  <div key={`${v.schema}.${v.table}.${v.column}.${i}`} data-index={idx} onClick={() => navigate(v.schema, v.table, 'table', v.column, v.value)} className={cn("group flex items-center gap-3 px-5 py-2.5 cursor-pointer transition-colors", isActive ? "bg-foreground/[0.05]" : "hover:bg-foreground/[0.03]")}>
                    <div className={cn("flex items-center justify-center w-8 h-8 rounded-lg", isActive ? "bg-secondary/40" : "bg-secondary/20")}><span className="text-[10px] font-bold text-muted-foreground/25">#</span></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-mono font-semibold text-foreground truncate">{highlightMatch(v.value, query)}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/30"><span>{v.schema}.{v.table}</span><span>·</span><span>{v.column}</span><span>·</span><span className="text-foreground/40">→ filter</span></div>
                    </div>
                    <CaretRight className="w-3 h-3 text-muted-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" weight="bold" />
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty */}
          {!loading && results && !hasResults && query && (
            <div className="py-16 text-center">
              <MagnifyingGlass className="w-12 h-12 mx-auto mb-4 text-muted-foreground/5" />
              <p className="text-[12px] text-muted-foreground/25 font-medium">No results for "{query}"</p>
              <p className="text-[10px] text-muted-foreground/15 mt-1">Try a different search term</p>
            </div>
          )}
        </div>

        {/* Footer */}
        {hasResults && !loading && (
          <div className="flex items-center justify-between px-5 py-2" style={{ borderTop: '1px solid hsl(var(--border) / 0.15)' }}>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-secondary/20 rounded text-[8px] font-mono text-muted-foreground/25">↑↓</kbd><span className="text-[9px] text-muted-foreground/20">navigate</span></div>
              <div className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-secondary/20 rounded text-[8px] font-mono text-muted-foreground/25">↵</kbd><span className="text-[9px] text-muted-foreground/20">open</span></div>
              <div className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-secondary/20 rounded text-[8px] font-mono text-muted-foreground/25">esc</kbd><span className="text-[9px] text-muted-foreground/20">close</span></div>
            </div>
            {results?.cachedAt && <span className="text-[8px] text-muted-foreground/15 font-mono">cached {Math.round((Date.now() - results.cachedAt) / 1000)}s ago</span>}
          </div>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 h-7 px-2.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground bg-secondary/30 hover:bg-secondary/50 rounded-md border border-border/20 transition-all duration-150 group">
        <MagnifyingGlass className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/50 transition-colors" />
        <span className="font-medium">Search</span>
        <div className="flex items-center gap-0.5 ml-2 opacity-40"><kbd className="px-1 py-0.5 bg-background/50 rounded text-[8px] font-mono">⌘</kbd><kbd className="px-1 py-0.5 bg-background/50 rounded text-[8px] font-mono">K</kbd></div>
      </button>
      {dialog}
    </>
  );
};
