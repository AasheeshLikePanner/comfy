import React, { useState, useEffect } from 'react';
import { useConnectionStore } from '@/store/connection';
import { useNavigationStore } from '@/store/navigation';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk';
import { Database, Table, Eye, Function, Hash, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface SearchResult {
  name: string;
  type: 'table' | 'column' | 'view' | 'function';
  schema?: string;
  parent_table?: string;
}

export const GlobalSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const { activeConnectionId, connections } = useConnectionStore();
  const { selectObject } = useNavigationStore();

  const activeConnection = connections.find(c => c.id === activeConnectionId);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!activeConnectionId || !query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search/${activeConnectionId}?q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        setResults(data.results || []);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, activeConnectionId]);

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    setQuery('');

    if (result.type === 'table' && result.schema) {
      selectObject(result.schema, result.name, 'table');
    } else if (result.type === 'view' && result.schema) {
      selectObject(result.schema, result.name, 'view');
    } else if (result.type === 'column' && result.parent_table && result.schema) {
      selectObject(result.schema, result.parent_table, 'table');
    } else if (result.type === 'function' && result.schema) {
      selectObject(result.schema, result.name, 'function');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'table':
        return <Table className="h-4 w-4 text-green-500" />;
      case 'view':
        return <Eye className="h-4 w-4 text-purple-500" />;
      case 'function':
        return <Function className="w-4 h-4 text-yellow-500" />;
      case 'column':
        return <Hash className="h-4 w-4 text-blue-500" />;
      default:
        return <Database className="h-4 w-4" />;
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground bg-muted rounded-md hover:bg-muted/80 transition-colors"
      >
        <MagnifyingGlass className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
          <div 
            className="fixed inset-0 bg-black/50 -z-10"
            onClick={() => setOpen(false)}
          />
          <div className="w-full max-w-lg bg-background rounded-lg shadow-2xl border overflow-hidden">
            <CommandInput
              placeholder={`Search tables, views, columns, functions...`}
              value={query}
              onValueChange={setQuery}
              className="w-full"
            />
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <div className="py-6 text-center text-muted-foreground">
                    Searching...
                  </div>
                ) : query ? (
                  <div className="py-6 text-center text-muted-foreground">
                    No results found for "{query}"
                  </div>
                ) : (
                  <div className="py-6 text-center text-muted-foreground">
                    Start typing to search...
                  </div>
                )}
              </CommandEmpty>

              {results.length > 0 && (
                <CommandGroup heading="Results">
                  {results.map((result, index) => (
                    <CommandItem
                      key={`${result.type}:${result.schema}:${result.name}:${index}`}
                      value={`${result.schema || ''}:${result.name}`}
                      onSelect={() => handleSelect(result)}
                      className="flex items-center gap-2 py-2 px-3 cursor-pointer"
                    >
                      {getIcon(result.type)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{result.name}</span>
                          {result.schema && (
                            <span className="text-xs text-muted-foreground">
                              in {result.schema}
                            </span>
                          )}
                          {result.type === 'column' && result.parent_table && (
                            <span className="text-xs text-muted-foreground">
                              on {result.parent_table}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        {result.type}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </div>
        </div>
      </CommandDialog>
    </>
  );
};