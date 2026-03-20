import React, { useState } from 'react';
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
import { Plus, PencilSimple, Warning, X, CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  is_pk: boolean;
  is_fk: boolean;
}

interface DataTableModalProps {
  data: { rows: Record<string, any>[]; columns: ColumnInfo[]; total: number } | null;
  selectedObject: { schema: string; table: string } | null;
  primaryKey: string | null;
  fetchData: () => void;
}

export const DataTableModals = ({ data, selectedObject, primaryKey, fetchData }: DataTableModalProps) => {
  const [showInsertModal, setShowInsertModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);
  const [insertFormData, setInsertFormData] = useState<Record<string, string>>({});
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [crudLoading, setCrudLoading] = useState(false);
  const [crudError, setCrudError] = useState<string | null>(null);

  const getInputType = (dataType: string) => {
    if (['integer', 'bigint', 'smallint', 'numeric', 'decimal', 'real', 'double precision'].includes(dataType)) {
      return 'number';
    }
    return 'text';
  };

  const openInsertModal = () => {
    const initialData: Record<string, string> = {};
    data?.columns.forEach(col => {
      if (!col.is_pk || col.nullable) {
        initialData[col.name] = '';
      }
    });
    setInsertFormData(initialData);
    setCrudError(null);
    setShowInsertModal(true);
  };

  const handleInsert = async () => {
    if (!selectedObject) return;
    setCrudLoading(true);
    setCrudError(null);
    
    try {
      const currentActiveId = useConnectionStore.getState().activeConnectionId;
      if (!currentActiveId) return;
      
      const insertData: Record<string, any> = {};
      Object.entries(insertFormData).forEach(([key, value]) => {
        if (value !== '') {
          if (value === 'null') {
            insertData[key] = null;
          } else if (value === 'true') {
            insertData[key] = true;
          } else if (value === 'false') {
            insertData[key] = false;
          } else if (!isNaN(Number(value)) && value !== '') {
            insertData[key] = Number(value);
          } else {
            insertData[key] = value;
          }
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
      
      setShowInsertModal(false);
      fetchData();
    } catch (err: any) {
      setCrudError(err.message);
    } finally {
      setCrudLoading(false);
    }
  };

  const openEditModal = (row: Record<string, any>) => {
    const formData: Record<string, string> = {};
    data?.columns.forEach(col => {
      const value = row[col.name];
      if (value === null || value === undefined) {
        formData[col.name] = '';
      } else if (typeof value === 'object') {
        formData[col.name] = JSON.stringify(value);
      } else {
        formData[col.name] = String(value);
      }
    });
    setEditFormData(formData);
    setEditingRow(row);
    setCrudError(null);
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!selectedObject || !editingRow || !primaryKey) return;
    setCrudLoading(true);
    setCrudError(null);
    
    try {
      const currentActiveId = useConnectionStore.getState().activeConnectionId;
      if (!currentActiveId) return;
      
      const updateData: Record<string, any> = {};
      Object.entries(editFormData).forEach(([key, value]) => {
        if (value === '') {
          updateData[key] = null;
        } else if (value === 'null') {
          updateData[key] = null;
        } else if (value === 'true') {
          updateData[key] = true;
        } else if (value === 'false') {
          updateData[key] = false;
        } else if (!isNaN(Number(value)) && value !== '') {
          updateData[key] = Number(value);
        } else {
          updateData[key] = value;
        }
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
      
      setShowEditModal(false);
      setEditingRow(null);
      fetchData();
    } catch (err: any) {
      setCrudError(err.message);
    } finally {
      setCrudLoading(false);
    }
  };

  return (
    <>
      {/* Insert Modal */}
      <Dialog open={showInsertModal} onOpenChange={setShowInsertModal}>
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
                    value={insertFormData[col.name] || ''}
                    onChange={(e) => setInsertFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                    placeholder={col.nullable ? 'null' : `Enter ${col.type}...`}
                    className="flex-1 h-8 text-[11px] font-mono"
                  />
                  <span className="w-[100px] text-[9px] text-muted-foreground/30 font-mono truncate">{col.type}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          {crudError && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive font-medium">
              {crudError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowInsertModal(false)} className="h-8 text-[11px] font-medium">
              Cancel
            </Button>
            <Button onClick={handleInsert} disabled={crudLoading} className="h-8 text-[11px] font-medium">
              {crudLoading ? <CircleNotch className="w-4 h-4 animate-spin mr-2" /> : null}
              Insert Row
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => { if (!open) { setShowEditModal(false); setEditingRow(null); } }}>
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
                    value={editFormData[col.name] || ''}
                    onChange={(e) => setEditFormData(prev => ({ ...prev, [col.name]: e.target.value }))}
                    placeholder={col.nullable ? 'null' : `Enter ${col.type}...`}
                    className="flex-1 h-8 text-[11px] font-mono"
                    disabled={col.is_pk}
                  />
                  <span className="w-[100px] text-[9px] text-muted-foreground/30 font-mono truncate">{col.type}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
          {crudError && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-[11px] text-destructive font-medium">
              {crudError}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="ghost" onClick={() => { setShowEditModal(false); setEditingRow(null); }} className="h-8 text-[11px] font-medium">
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={crudLoading} className="h-8 text-[11px] font-medium">
              {crudLoading ? <CircleNotch className="w-4 h-4 animate-spin mr-2" /> : null}
              Update Row
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export modals for parent component */}
      <div data-modal-state hidden 
        data-open-insert={() => openInsertModal()} 
        data-open-edit={(row: Record<string, any>) => openEditModal(row)} 
      />
    </>
  );
};

export const openInsertModalFromParent = () => {
  const el = document.querySelector('[data-modal-state]') as any;
  if (el?.dataset?.openInsert) {
    eval(el.dataset.openInsert + '()');
  }
};

export const openEditModalFromParent = (row: Record<string, any>) => {
  const el = document.querySelector('[data-modal-state]') as any;
  if (el?.dataset?.openEdit) {
    eval(el.dataset.openEdit + `(${JSON.stringify(row)})`);
  }
};
