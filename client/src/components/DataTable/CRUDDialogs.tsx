import React, { useState } from 'react';
import { useConnectionStore } from '@/store/connection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, PencilSimple, Warning, Trash, CircleNotch } from '@phosphor-icons/react';

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
}

interface TableData {
  rows: Record<string, any>[];
  columns: ColumnInfo[];
  total: number;
}

interface TableObject {
  schema: string;
  table: string;
}

interface InsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TableData | null;
  selectedObject: TableObject | null;
  onSuccess: () => void;
}

export function InsertDialog({ open, onOpenChange, data, selectedObject, onSuccess }: InsertDialogProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open && data) {
      const initial: Record<string, string> = {};
      data.columns.forEach(col => {
        if (!col.is_pk || col.nullable) {
          initial[col.name] = '';
        }
      });
      setFormData(initial);
      setError(null);
    }
  }, [open, data]);

  const getInputType = (dataType: string) => {
    if (['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
      return 'number';
    }
    return 'text';
  };

  const handleSubmit = async () => {
    if (!selectedObject) return;
    setLoading(true);
    setError(null);
    
    try {
      const currentActiveId = useConnectionStore.getState().activeConnectionId;
      if (!currentActiveId) return;
      
      const insertData: Record<string, any> = {};
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== '') {
          if (value === 'null') insertData[key] = null;
          else if (value === 'true') insertData[key] = true;
          else if (value === 'false') insertData[key] = false;
          else if (!isNaN(Number(value))) insertData[key] = Number(value);
          else insertData[key] = value;
        }
      });
      
      const res = await fetch(`/api/tables/${currentActiveId}/${selectedObject.schema}/${selectedObject.table}/rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insertData),
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || result.detail || 'Failed to insert row');
      }
      
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold flex items-center gap-2">
            <Plus className="w-4 h-4" /> Insert New Row
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {data?.columns.map(col => (
              <div key={col.name} className="flex items-center gap-3">
                <label className="w-[180px] text-[11px] font-medium text-muted-foreground/70 flex items-center gap-1.5">
                  {col.name}
                  {col.is_pk && <span className="text-[8px] font-bold text-amber-500/60 uppercase">PK</span>}
                  {col.nullable && <span className="text-[8px] text-muted-foreground/40">(nullable)</span>}
                </label>
                <Input
                  type={getInputType(col.type)}
                  value={formData[col.name] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                  placeholder={col.nullable ? 'null' : `Enter ${col.type}...`}
                  className="flex-1 h-8 text-[11px] font-mono"
                />
                <span className="w-[100px] text-[9px] text-muted-foreground/30 font-mono truncate">{col.type}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive font-medium">
            {error}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-8 text-[11px] font-medium">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="h-8 text-[11px] font-medium">
            {loading ? <CircleNotch className="w-4 h-4 animate-spin mr-2" /> : null}
            Insert Row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TableData | null;
  selectedObject: TableObject | null;
  primaryKey: string | null;
  editingRow: Record<string, any> | null;
  onSuccess: () => void;
}

export function EditDialog({ open, onOpenChange, data, selectedObject, primaryKey, editingRow, onSuccess }: EditDialogProps) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open && data && editingRow) {
      const initial: Record<string, string> = {};
      data.columns.forEach(col => {
        const value = editingRow[col.name];
        if (value === null || value === undefined) initial[col.name] = '';
        else if (typeof value === 'object') initial[col.name] = JSON.stringify(value);
        else initial[col.name] = String(value);
      });
      setFormData(initial);
      setError(null);
    }
  }, [open, data, editingRow]);

  const getInputType = (dataType: string) => {
    if (['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
      return 'number';
    }
    return 'text';
  };

  const handleSubmit = async () => {
    if (!selectedObject || !editingRow || !primaryKey) return;
    setLoading(true);
    setError(null);
    
    try {
      const currentActiveId = useConnectionStore.getState().activeConnectionId;
      if (!currentActiveId) return;
      
      const updateData: Record<string, any> = {};
      Object.entries(formData).forEach(([key, value]) => {
        if (value === '' || value === 'null') updateData[key] = null;
        else if (value === 'true') updateData[key] = true;
        else if (value === 'false') updateData[key] = false;
        else if (!isNaN(Number(value)) && value !== '') updateData[key] = Number(value);
        else updateData[key] = value;
      });
      
      const res = await fetch(`/api/tables/${currentActiveId}/${selectedObject.schema}/${selectedObject.table}/rows`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryKey: { column: primaryKey, value: editingRow[primaryKey] },
          data: updateData,
        }),
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || result.detail || 'Failed to update row');
      }
      
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold flex items-center gap-2">
            <PencilSimple className="w-4 h-4" /> Edit Row
            {primaryKey && editingRow && (
              <span className="text-[10px] font-normal text-muted-foreground/50">
                {primaryKey} = {String(editingRow[primaryKey])}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-3 py-2">
            {data?.columns.map(col => (
              <div key={col.name} className="flex items-center gap-3">
                <label className="w-[180px] text-[11px] font-medium text-muted-foreground/70 flex items-center gap-1.5">
                  {col.name}
                  {col.is_pk && <span className="text-[8px] font-bold text-amber-500/60 uppercase">PK</span>}
                  {col.nullable && <span className="text-[8px] text-muted-foreground/40">(nullable)</span>}
                </label>
                <Input
                  type={getInputType(col.type)}
                  value={formData[col.name] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                  placeholder={col.nullable ? 'null' : `Enter ${col.type}...`}
                  className="flex-1 h-8 text-[11px] font-mono"
                  disabled={col.is_pk}
                />
                <span className="w-[100px] text-[9px] text-muted-foreground/30 font-mono truncate">{col.type}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive font-medium">
            {error}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-8 text-[11px] font-medium">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} className="h-8 text-[11px] font-medium">
            {loading ? <CircleNotch className="w-4 h-4 animate-spin mr-2" /> : null}
            Update Row
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: TableData | null;
  selectedObject: TableObject | null;
  primaryKey: string | null;
  selectedRowIds: Set<string | number>;
  onSuccess: () => void;
}

export function DeleteDialog({ open, onOpenChange, data, selectedObject, primaryKey, selectedRowIds, onSuccess }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (selectedRowIds.size === 0 || !primaryKey || !data || !selectedObject) return;
    setLoading(true);
    setError(null);
    
    try {
      const currentActiveId = useConnectionStore.getState().activeConnectionId;
      if (!currentActiveId) return;
      
      const primaryKeys = Array.from(selectedRowIds).map(rowIndex => {
        const row = data.rows[Number(rowIndex)];
        return { column: primaryKey, value: row[primaryKey] };
      });
      
      const res = await fetch(`/api/tables/${currentActiveId}/${selectedObject.schema}/${selectedObject.table}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryKeys),
      });
      
      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || result.detail || 'Failed to delete rows');
      }
      
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[14px] font-semibold flex items-center gap-2">
            <Warning className="w-4 h-4 text-red-500" /> Confirm Deletion
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-[12px] text-muted-foreground/70">
            Are you sure you want to delete <span className="font-semibold text-foreground">{selectedRowIds.size}</span> selected row{selectedRowIds.size > 1 ? 's' : ''}? This action cannot be undone.
          </p>
          {primaryKey && data && (
            <p className="text-[10px] text-muted-foreground/40 mt-2 font-mono">
              Deleting by {primaryKey}: {Array.from(selectedRowIds).map(idx => {
                const row = data.rows[Number(idx)];
                return row ? String(row[primaryKey]) : '';
              }).filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive font-medium">
            {error}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="h-8 text-[11px] font-medium">
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading} className="h-8 text-[11px] font-medium bg-red-500 hover:bg-red-600">
            {loading ? <CircleNotch className="w-4 h-4 animate-spin mr-2" /> : <Trash className="w-3.5 h-3.5 mr-2" />}
            Delete {selectedRowIds.size} Row{selectedRowIds.size > 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
