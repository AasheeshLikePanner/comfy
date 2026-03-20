import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { Database, X, ArrowRight, CircleNotch, Check, Desktop, Cube, CheckCircle, XCircle } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TestResult {
  success: boolean;
  host: string;
  port: number;
  database: string;
  latency?: number;
  serverInfo?: {
    version: string;
    user: string;
    database: string;
  };
  error?: string;
}

interface DetectResponse {
  type: 'local' | 'docker' | 'both' | 'error';
  local: TestResult;
  docker: TestResult;
  dockerContainer?: {
    name: string;
    port: string;
  };
}

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (connectionString: string, name?: string) => Promise<void>;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  open,
  onOpenChange,
  onConnect,
}) => {
  const [step, setStep] = useState<'input' | 'detecting' | 'select'>('input');
  const [connectionString, setConnectionString] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [localResult, setLocalResult] = useState<TestResult | null>(null);
  const [dockerResult, setDockerResult] = useState<TestResult | null>(null);
  const [dockerContainer, setDockerContainer] = useState<{ name: string; port: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDetect = async () => {
    if (!connectionString.trim()) return;

    setStep('detecting');
    setError(null);
    setLocalResult(null);
    setDockerResult(null);
    setDockerContainer(null);

    try {
      const response = await fetch('/api/connections/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionString }),
      });

      const data = await response.json();

      if (data.error || !response.ok) {
        setError(data.error || 'Detection failed');
        setStep('input');
        return;
      }

      const typedData = data as DetectResponse;
      
      setLocalResult(typedData.local);
      setDockerResult(typedData.docker);
      setDockerContainer(typedData.dockerContainer || null);

      if (typedData.type === 'docker' || typedData.dockerContainer) {
        await handleSelectConnection('docker', typedData.local, typedData.docker);
        return;
      } else if (typedData.type === 'local') {
        await handleSelectConnection('local', typedData.local, typedData.docker);
        return;
      }
      
      setStep('select');
    } catch (err: any) {
      console.error('[dbviz] Detect error:', err);
      setError(err.message);
      setStep('input');
    }
  };

  const handleSelectConnection = async (
    type: 'local' | 'docker',
    localRes: TestResult | null,
    dockerRes: TestResult | null
  ) => {
    const resultToUse = localRes;
    
    if (!resultToUse?.success) {
      setError('Connection failed - please try again');
      setStep('select');
      return;
    }

    setConnecting(true);
    
    try {
      await onConnect(connectionString, connectionName.trim() || undefined);
      onOpenChange(false);
      resetDialog();
    } catch (err: any) {
      setError(err.message);
      setStep('select');
    } finally {
      setConnecting(false);
    }
  };

  const resetDialog = () => {
    setStep('input');
    setConnectionString('');
    setConnectionName('');
    setLocalResult(null);
    setDockerResult(null);
    setError(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetDialog();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-[#121212] w-full max-w-[360px] border border-white/5 rounded-2xl overflow-hidden animate-in zoom-in-95 duration-300 shadow-2xl relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        {step === 'input' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                  <Plus className="w-4 h-4 text-white/60" weight="bold" />
                </div>
                <div>
                  <h2 className="text-[14px] font-bold text-white/90">New Connection</h2>
                  <p className="text-[10px] text-white/30 font-medium">Add a new database instance</p>
                </div>
              </div>
              <button onClick={handleClose} className="p-1.5 hover:bg-white/5 rounded-full text-white/20 hover:text-white/60 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
 
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-1">Connection Name</label>
                <Input
                  placeholder="e.g. Production DB, Local Dev..."
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="h-10 text-[13px] bg-white/[0.03] border-white/10 focus:border-primary/50 px-4 rounded-xl transition-all focus:ring-0"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-1">Connection URL</label>
                <Input
                  placeholder="postgresql://user:pass@host:port/db"
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  className="h-10 text-[13px] bg-white/[0.03] border-white/10 focus:border-primary/50 px-4 rounded-xl font-mono focus:ring-0 transition-all"
                />
              </div>
 
              {error && (
                <div className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/10 p-3 rounded-xl leading-relaxed animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}
 
              <div className="flex flex-col gap-2 pt-2">
                <Button 
                  onClick={handleDetect} 
                  disabled={!connectionString.trim()} 
                  className="h-11 w-full bg-white text-black hover:bg-white/90 font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg"
                >
                  {connecting ? <CircleNotch className="w-4 h-4 animate-spin" /> : 'Connect Database'}
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={handleClose} 
                  className="h-11 w-full font-semibold text-white/30 hover:text-white/90 hover:bg-white/5 rounded-xl text-[12px] transition-all" 
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'detecting' && (
          <div className="p-12 flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse" />
              <CircleNotch className="w-8 h-8 animate-spin text-primary relative z-10" weight="bold" />
            </div>
            <div className="text-center">
              <span className="text-[13px] font-bold text-white/80 block">Detecting connection...</span>
              <span className="text-[10px] text-white/20 font-medium">Testing local and container routes</span>
            </div>
          </div>
        )}

        {step === 'select' && (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-white/90">Select Route</h2>
                <p className="text-[10px] text-white/30 font-medium">Multiple paths found to your DB</p>
              </div>
              <button 
                onClick={() => setStep('input')}
                className="text-[11px] font-bold text-primary hover:text-primary/80 transition-colors bg-primary/10 px-3 py-1 rounded-full"
              >
                Back
              </button>
            </div>
 
            <div className="space-y-3">
              <ConnectionOption
                type="local"
                result={localResult}
                onSelect={(type) => handleSelectConnection(type, localResult, dockerResult)}
                disabled={connecting}
              />
              <div className="h-px bg-white/5 mx-2" />
              <ConnectionOption
                type="docker"
                result={dockerResult}
                onSelect={(type) => handleSelectConnection(type, localResult, dockerResult)}
                disabled={connecting}
                containerName={dockerContainer?.name}
              />
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

interface ConnectionOptionProps {
  type: 'local' | 'docker';
  result: TestResult | null;
  onSelect: (type: 'local' | 'docker') => void;
  disabled: boolean;
  containerName?: string;
}

const ConnectionOption: React.FC<ConnectionOptionProps> = ({
  type,
  result,
  onSelect,
  disabled,
  containerName,
}) => {
  const isSuccess = result?.success;
  const Icon = type === 'local' ? Desktop : Cube;
  const label = type === 'local' ? 'Local' : 'Docker';
  const description = type === 'docker' && containerName 
    ? `Docker: ${containerName}` 
    : type === 'local' ? 'localhost:5432' : 'host.docker.internal:5432';

  return (
    <button
      onClick={() => onSelect(type)}
      disabled={disabled || !isSuccess}
      className={cn(
        "relative p-3.5 rounded-lg border text-left transition-all group/opt",
        isSuccess 
          ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10 cursor-pointer' 
          : 'bg-black/10 border-white/[0.02] opacity-30 cursor-not-allowed'
      )}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className={cn(
          "w-8 h-8 rounded flex items-center justify-center transition-all",
          isSuccess ? "bg-white/5 group-hover/opt:bg-white/10" : "bg-white/[0.02]"
        )}>
          <Icon className="w-4 h-4 text-white/60" />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="text-[12px] font-semibold text-white/80 truncate">{label}</div>
          <div className="text-[10px] text-white/20 font-medium truncate">{description}</div>
        </div>
        {isSuccess && <CheckCircle className="w-4 h-4 text-white/10 group-hover/opt:text-white/40 transition-colors" weight="fill" />}
      </div>
      
      {isSuccess && result?.serverInfo && (
        <div className="pt-3 border-t border-white/5 flex items-center justify-between">
          <div className="text-[10px] font-mono text-white/40 truncate">{result.serverInfo.database}</div>
          <div className="text-[10px] font-medium text-white/20">
            {result.latency}ms
          </div>
        </div>
      )}

      {!isSuccess && result?.error && (
        <div className="text-[10px] text-red-500/60 truncate italic mt-2">
          {result.error}
        </div>
      )}
    </button>
  );
};

export default ConnectionDialog;