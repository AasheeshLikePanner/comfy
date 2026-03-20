import React, { useState, useEffect } from 'react';
import { useNavigationStore } from '@/store/navigation';
import { useConnectionStore } from '@/store/connection';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  Key,
  Hash,
  List,
  Link as LinkIcon,
  Lightning,
  ChartBar,
  ArrowRight,
  CircleNotch,
} from '@phosphor-icons/react';
import { formatNumber, formatTimestamp } from '@/lib/utils';

interface SchemaData {
  columns: Column[];
  indexes: Index[];
  constraints: Constraint[];
  triggers: Trigger[];
}

interface Column {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string;
  pk_column: string;
  is_generated: string;
}

interface Index {
  index_name: string;
  index_type: string;
  is_unique: boolean;
  is_primary: boolean;
  columns: string[];
  partial_condition: string;
  index_size: string;
  scan_count: number;
}

interface Constraint {
  constraint_name: string;
  constraint_type: string;
  definition: string;
  columns: string[];
  referenced_table?: string;
  referenced_columns?: string[];
  on_delete?: string;
  on_update?: string;
}

interface Trigger {
  trigger_name: string;
  timing: string;
  events: string;
  level: string;
  function_name: string;
  condition?: string;
  is_enabled: boolean;
}

interface TableStats {
  sequential_scans: number;
  index_scans: number;
  rows_inserted: number;
  rows_updated: number;
  rows_deleted: number;
  live_row_count: number;
  dead_row_count: number;
  last_vacuum?: string;
  last_autovacuum?: string;
  last_analyze?: string;
  total_size: string;
  table_size: string;
  indexes_size: string;
}

interface ForeignKeys {
  outgoing: Constraint[];
  incoming: Constraint[];
}

const SchemaInspector = () => {
  const { selectedObject, schemaTab, setSchemaTab } = useNavigationStore();
  const { activeConnectionId } = useConnectionStore();

  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [stats, setStats] = useState<TableStats | null>(null);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeys | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedObject && activeConnectionId) {
      fetchSchema();
      fetchStats();
      fetchForeignKeys();
    }
  }, [selectedObject, activeConnectionId]);

  const fetchSchema = async () => {
    if (!selectedObject || !activeConnectionId) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/tables/${activeConnectionId}/${selectedObject.schema}/${selectedObject.table}/schema`
      );
      const data = await response.json();
      setSchemaData(data);
    } catch (err) {
      console.error('Failed to fetch schema:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!selectedObject || !activeConnectionId) return;
    try {
      const response = await fetch(
        `/api/tables/${activeConnectionId}/${selectedObject.schema}/${selectedObject.table}/stats`
      );
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchForeignKeys = async () => {
    if (!selectedObject || !activeConnectionId) return;
    try {
      const response = await fetch(
        `/api/tables/${activeConnectionId}/${selectedObject.schema}/${selectedObject.table}/foreign-keys`
      );
      const data = await response.json();
      setForeignKeys(data);
    } catch (err) {
      console.error('Failed to fetch foreign keys:', err);
    }
  };

  if (!selectedObject) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a table to view its schema
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">
          {selectedObject.schema}.{selectedObject.table} — Schema
        </h2>
      </div>

      <Tabs value={schemaTab} onValueChange={(v) => setSchemaTab(v as any)} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="mx-4 mt-2">
          <TabsTrigger value="columns">
            <Hash className="h-4 w-4 mr-1" />
            Columns
          </TabsTrigger>
<TabsTrigger value="indexes">
            <List className="w-4 h-4 mr-1" />
            Indexes
          </TabsTrigger>
          <TabsTrigger value="constraints">
            <Key className="w-4 h-4 mr-1" />
            Constraints
          </TabsTrigger>
          <TabsTrigger value="foreignKeys">
            <LinkIcon className="w-4 h-4 mr-1" />
            Foreign Keys
          </TabsTrigger>
          <TabsTrigger value="triggers">
            <Lightning className="w-4 h-4 mr-1" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="stats">
            <ChartBar className="w-4 h-4 mr-1" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="constraints">
            <Key className="h-4 w-4 mr-1" />
            Constraints
          </TabsTrigger>
          <TabsTrigger value="foreignKeys">
            <LinkIcon className="w-4 h-4 mr-1" />
            Foreign Keys
          </TabsTrigger>
          <TabsTrigger value="triggers">
            <Lightning className="w-4 h-4 mr-1" />
            Triggers
          </TabsTrigger>
          <TabsTrigger value="stats">
            <ChartBar className="w-4 h-4 mr-1" />
            Stats
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <CircleNotch className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <TabsContent value="columns" className="mt-0">
              <ColumnsTab columns={schemaData?.columns || []} />
            </TabsContent>

            <TabsContent value="indexes" className="mt-0">
              <IndexesTab indexes={schemaData?.indexes || []} />
            </TabsContent>

            <TabsContent value="constraints" className="mt-0">
              <ConstraintsTab constraints={schemaData?.constraints || []} />
            </TabsContent>

            <TabsContent value="foreignKeys" className="mt-0">
              <ForeignKeysTab foreignKeys={foreignKeys} />
            </TabsContent>

            <TabsContent value="triggers" className="mt-0">
              <TriggersTab triggers={schemaData?.triggers || []} />
            </TabsContent>

            <TabsContent value="stats" className="mt-0">
              <StatsTab stats={stats} />
            </TabsContent>
          </div>
        )}
      </Tabs>
    </div>
  );
};

const ColumnsTab = ({ columns }: { columns: Column[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>#</TableHead>
        <TableHead>Name</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Nullable</TableHead>
        <TableHead>Default</TableHead>
        <TableHead>Key</TableHead>
        <TableHead>Generated</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {columns.map((col, index) => (
        <TableRow key={col.column_name}>
          <TableCell className="text-muted-foreground">{index + 1}</TableCell>
          <TableCell className="font-medium">
            {col.pk_column && <span className="text-yellow-500 mr-1">🔑</span>}
            {col.column_name}
          </TableCell>
          <TableCell>
            <Badge variant="secondary">{col.data_type}</Badge>
          </TableCell>
          <TableCell>{col.is_nullable === 'YES' ? '✓' : ''}</TableCell>
          <TableCell className="text-muted-foreground text-xs">
            {col.column_default || '—'}
          </TableCell>
          <TableCell>
            {col.pk_column && <Badge variant="warning">PK</Badge>}
          </TableCell>
          <TableCell>
            {col.is_generated === 'ALWAYS' && <Badge>Generated</Badge>}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const IndexesTab = ({ indexes }: { indexes: Index[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Columns</TableHead>
        <TableHead>Unique</TableHead>
        <TableHead>Primary</TableHead>
        <TableHead>Size</TableHead>
        <TableHead>Scans</TableHead>
        <TableHead>Condition</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {indexes.length === 0 ? (
        <TableRow>
          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
            No indexes found
          </TableCell>
        </TableRow>
      ) : (
        indexes.map((idx) => (
          <TableRow key={idx.index_name}>
            <TableCell className="font-medium">{idx.index_name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{idx.index_type}</Badge>
            </TableCell>
            <TableCell className="text-sm">
              {idx.columns?.join(', ') || '—'}
            </TableCell>
            <TableCell>{idx.is_unique ? '✓' : ''}</TableCell>
            <TableCell>{idx.is_primary ? '✓' : ''}</TableCell>
            <TableCell>{idx.index_size}</TableCell>
            <TableCell>{formatNumber(idx.scan_count || 0)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {idx.partial_condition || '—'}
            </TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  </Table>
);

const ConstraintsTab = ({ constraints }: { constraints: Constraint[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Type</TableHead>
        <TableHead>Definition</TableHead>
        <TableHead>Columns</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {constraints.length === 0 ? (
        <TableRow>
          <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
            No constraints found
          </TableCell>
        </TableRow>
      ) : (
        constraints.map((con) => (
          <TableRow key={con.constraint_name}>
            <TableCell className="font-medium">{con.constraint_name}</TableCell>
            <TableCell>
              <Badge
                variant={
                  con.constraint_type === 'p' ? 'default' :
                  con.constraint_type === 'f' ? 'secondary' :
                  con.constraint_type === 'u' ? 'warning' :
                  'outline'
                }
              >
                {con.constraint_type === 'p' ? 'PRIMARY KEY' :
                 con.constraint_type === 'f' ? 'FOREIGN KEY' :
                 con.constraint_type === 'u' ? 'UNIQUE' :
                 con.constraint_type === 'c' ? 'CHECK' : con.constraint_type}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {con.definition}
            </TableCell>
            <TableCell>{con.columns?.join(', ')}</TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  </Table>
);

const ForeignKeysTab = ({ foreignKeys }: { foreignKeys: ForeignKeys | null }) => {
  if (!foreignKeys) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium mb-2">References ({foreignKeys.outgoing?.length || 0})</h3>
        {foreignKeys.outgoing?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outgoing foreign keys</p>
        ) : (
          <div className="space-y-2">
            {foreignKeys.outgoing.map((fk) => (
              <div key={fk.constraint_name} className="flex items-center gap-2 p-2 bg-muted rounded">
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{fk.columns?.join(', ')}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">{fk.referenced_table}</Badge>
                  <span className="text-muted-foreground">({fk.referenced_columns?.join(', ')})</span>
                </div>
                <span className="text-xs text-muted-foreground ml-auto">
                  ON DELETE: {fk.on_delete} / ON UPDATE: {fk.on_update}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="font-medium mb-2">Referenced By ({foreignKeys.incoming?.length || 0})</h3>
        {foreignKeys.incoming?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incoming foreign keys</p>
        ) : (
          <div className="space-y-2">
            {foreignKeys.incoming.map((fk) => (
              <div key={fk.constraint_name} className="flex items-center gap-2 p-2 bg-muted rounded">
                <div className="flex items-center gap-1">
                  <Badge variant="outline">{fk.referenced_table}</Badge>
                  <span className="text-muted-foreground">({fk.referenced_columns?.join(', ')})</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{fk.columns?.join(', ')}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TriggersTab = ({ triggers }: { triggers: Trigger[] }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Timing</TableHead>
        <TableHead>Events</TableHead>
        <TableHead>Level</TableHead>
        <TableHead>Function</TableHead>
        <TableHead>Enabled</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {triggers.length === 0 ? (
        <TableRow>
          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
            No triggers found
          </TableCell>
        </TableRow>
      ) : (
        triggers.map((trigger) => (
          <TableRow key={trigger.trigger_name}>
            <TableCell className="font-medium">{trigger.trigger_name}</TableCell>
            <TableCell>
              <Badge variant="secondary">{trigger.timing}</Badge>
            </TableCell>
            <TableCell>{trigger.events}</TableCell>
            <TableCell>{trigger.level}</TableCell>
            <TableCell className="text-xs">
              {trigger.function_name}
            </TableCell>
            <TableCell>{trigger.is_enabled ? '✓' : '✗'}</TableCell>
          </TableRow>
        ))
      )}
    </TableBody>
  </Table>
);

const StatsTab = ({ stats }: { stats: TableStats | null }) => {
  if (!stats) {
    return (
      <div className="flex items-center justify-center py-8">
        <CircleNotch className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <h3 className="font-medium">Size</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span>{stats.total_size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Table</span>
            <span>{stats.table_size}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Indexes</span>
            <span>{stats.indexes_size}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Row Counts</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Live Rows</span>
            <span>{formatNumber(stats.live_row_count || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dead Rows</span>
            <span className={stats.dead_row_count > 1000 ? 'text-destructive' : ''}>
              {formatNumber(stats.dead_row_count || 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Scans</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sequential</span>
            <span>{formatNumber(stats.sequential_scans || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Index</span>
            <span>{formatNumber(stats.index_scans || 0)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Operations</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Inserted</span>
            <span>{formatNumber(stats.rows_inserted || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Updated</span>
            <span>{formatNumber(stats.rows_updated || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Deleted</span>
            <span>{formatNumber(stats.rows_deleted || 0)}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2 col-span-2">
        <h3 className="font-medium">Last Operations</h3>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vacuum</span>
            <span>{stats.last_vacuum ? formatTimestamp(stats.last_vacuum) : 'Never'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">AutoVacuum</span>
            <span>{stats.last_autovacuum ? formatTimestamp(stats.last_autovacuum) : 'Never'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Analyze</span>
            <span>{stats.last_analyze ? formatTimestamp(stats.last_analyze) : 'Never'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export { SchemaInspector };