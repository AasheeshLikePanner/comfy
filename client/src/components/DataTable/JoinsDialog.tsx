import React, { useState, useEffect } from 'react';
import { useConnectionStore } from '@/store/connection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  TableHead as TH,
} from '@/components/ui/table';
import { CircleNotch, Link, Plus, Trash, Play, ArrowRight, Database } from '@phosphor-icons/react';

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
}

interface TableData {
  rows: Record<string, any>[];
  columns: { name: string; type: string }[];
  total: number;
}

interface JoinConfig {
  id: string;
  schema: string;
  table: string;
  localColumn: string;
  referencedColumn: string;
  joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
}

interface JoinableTable {
  referenced_schema: string;
  referenced_table: string;
  direction: string;
  local_columns: string[];
  referenced_columns: string[];
  constraint_name: string;
}

interface JoinsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedObject: { schema: string; table: string } | null;
}

export function JoinsDialog({ open, onOpenChange, selectedObject }: JoinsDialogProps) {
  const { activeConnectionId } = useConnectionStore();
  const [joinables, setJoinables] = useState<{ outgoing: JoinableTable[]; incoming: JoinableTable[] }>({ outgoing: [], incoming: [] });
  const [joins, setJoins] = useState<JoinConfig[]>([]);
  const [results, setResults] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    if (open && selectedObject && activeConnectionId) {
      fetchJoinables();
    }
  }, [open, selectedObject, activeConnectionId]);

  const fetchJoinables = async () => {
    if (!selectedObject || !activeConnectionId) return;
    
    try {
      const res = await fetch(`/api/joins/${activeConnectionId}/${selectedObject.schema}/${selectedObject.table}`);
      const data = await res.json();
      setJoinables(data);
      setJoins([]);
      setResults(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addJoin = (joinable: JoinableTable) => {
    const newJoin: JoinConfig = {
      id: `${Date.now()}`,
      schema: joinable.referenced_schema,
      table: joinable.referenced_table,
      localColumn: joinable.local_columns[0],
      referencedColumn: joinable.referenced_columns[0],
      joinType: 'LEFT',
    };
    setJoins([...joins, newJoin]);
  };

  const removeJoin = (id: string) => {
    setJoins(joins.filter(j => j.id !== id));
  };

  const updateJoin = (id: string, updates: Partial<JoinConfig>) => {
    setJoins(joins.map(j => j.id === id ? { ...j, ...updates } : j));
  };

  const executeJoins = async () => {
    if (!selectedObject || !activeConnectionId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/joins/${activeConnectionId}/${selectedObject.schema}/${selectedObject.table}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joins, limit }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute joins');
      }
      
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedObject) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold flex items-center gap-2">
            <Link className="w-4 h-4" /> 
            Joins - {selectedObject.schema}.{selectedObject.table}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 flex-1 min-h-0">
          {/* Left Panel - Available Joins */}
          <div className="w-1/3 border rounded-lg overflow-hidden flex flex-col">
            <div className="bg-secondary/30 px-3 py-2 border-b">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70">Available Joins</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {joinables.outgoing.length > 0 && (
                  <div>
                    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase px-2 mb-1">Outgoing FK</p>
                    {joinables.outgoing.map((j, i) => (
                      <div key={`out-${i}`} className="flex items-center justify-between p-2 rounded-md bg-card border border-border/10 hover:border-border/30 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{j.referenced_table}</p>
                          <p className="text-[9px] text-muted-foreground/50 truncate">
                            {j.local_columns[0]} → {j.referenced_columns[0]}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => addJoin(j)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {joinables.incoming.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[9px] font-bold text-muted-foreground/50 uppercase px-2 mb-1">Incoming FK</p>
                    {joinables.incoming.map((j, i) => (
                      <div key={`in-${i}`} className="flex items-center justify-between p-2 rounded-md bg-card border border-border/10 hover:border-border/30 transition-colors group">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium truncate">{j.referenced_table}</p>
                          <p className="text-[9px] text-muted-foreground/50 truncate">
                            {j.local_columns[0]} → {j.referenced_columns[0]}
                          </p>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => addJoin(j)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {joinables.outgoing.length === 0 && joinables.incoming.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-8">No relationships found</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Middle Panel - Active Joins */}
          <div className="w-1/3 border rounded-lg overflow-hidden flex flex-col">
            <div className="bg-secondary/30 px-3 py-2 border-b flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70">Active Joins</h3>
              <Button size="sm" onClick={executeJoins} disabled={loading || joins.length === 0} className="h-6 text-[10px]">
                {loading ? <CircleNotch className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                Execute
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                <div className="p-2 rounded-md bg-secondary/20 border border-border/10">
                  <div className="flex items-center gap-2">
                    <Database className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-[11px] font-medium">{selectedObject.table}</span>
                    <span className="text-[9px] text-muted-foreground/40">(base)</span>
                  </div>
                </div>
                {joins.map((join, i) => (
                  <div key={join.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-px bg-border/30" />
                      <Select value={join.joinType} onValueChange={(v) => updateJoin(join.id, { joinType: v as any })}>
                        <SelectTrigger className="w-[80px] h-6 text-[10px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="text-[10px]">
                          <SelectItem value="INNER">INNER</SelectItem>
                          <SelectItem value="LEFT">LEFT</SelectItem>
                          <SelectItem value="RIGHT">RIGHT</SelectItem>
                          <SelectItem value="FULL">FULL</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-[9px] text-muted-foreground/50">JOIN</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-md bg-card border border-border/10 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{join.schema}.{join.table}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] text-muted-foreground/50 bg-secondary/30 px-1 rounded">{join.localColumn}</span>
                          <ArrowRight className="w-2 h-2 text-muted-foreground/30" />
                          <span className="text-[9px] text-muted-foreground/50 bg-secondary/30 px-1 rounded">{join.referencedColumn}</span>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => removeJoin(join.id)}>
                        <Trash className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {joins.length === 0 && (
                  <p className="text-[11px] text-muted-foreground/40 text-center py-8">Click + on available joins to add</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right Panel - Results */}
          <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
            <div className="bg-secondary/30 px-3 py-2 border-b flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-muted-foreground/70">
                Results {results ? `(${results.rows.length} rows)` : ''}
              </h3>
              {results && (
                <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                  <SelectTrigger className="w-[100px] h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-[10px]">
                    <SelectItem value="25">25 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                    <SelectItem value="500">500 rows</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <ScrollArea className="flex-1">
              {error && (
                <div className="p-4">
                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive">
                    {error}
                  </div>
                </div>
              )}
              {results && (
                <div className="overflow-auto">
                  <Table className="border-collapse">
                    <TableHeader>
                      <TableRow className="bg-secondary/40">
                        {results.columns.map(col => (
                          <TableHead key={col.name} className="text-[10px] font-semibold whitespace-nowrap border-r border-border/10">
                            <div className="flex flex-col gap-0.5">
                              <span>{col.name}</span>
                              <span className="font-normal text-muted-foreground/40">{col.type}</span>
                            </div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.rows.map((row, i) => (
                        <TableRow key={i} className="hover:bg-secondary/10">
                          {results.columns.map(col => (
                            <TableCell key={col.name} className="text-[10px] font-mono border-r border-border/5 max-w-[200px] truncate">
                              {row[col.name] === null ? (
                                <span className="text-muted-foreground/30 italic">null</span>
                              ) : typeof row[col.name] === 'object' ? (
                                JSON.stringify(row[col.name])
                              ) : (
                                String(row[col.name])
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {!results && !error && (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[11px] text-muted-foreground/40">Execute joins to see results</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
