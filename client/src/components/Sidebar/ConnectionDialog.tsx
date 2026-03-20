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
  onConnect: (connectionString: string) => Promise<void>;
}

export const ConnectionDialog: React.FC<ConnectionDialogProps> = ({
  open,
  onOpenChange,
  onConnect,
}) => {
  const [step, setStep] = useState<'input' | 'detecting' | 'select'>('input');
  const [connectionString, setConnectionString] = useState('');
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
      
      // Set state for UI display
      setLocalResult(typedData.local);
      setDockerResult(typedData.docker);
      setDockerContainer(typedData.dockerContainer || null);

      // Use typedData directly, not state (state is async)
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
    // For Docker Desktop, use localhost which is forwarded from Docker
    const resultToUse = localRes;
    
    if (!resultToUse?.success) {
      setError('Connection failed - please try again');
      setStep('select');
      return;
    }

    setConnecting(true);
    
    try {
      await onConnect(connectionString);
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
    <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#161616] w-full max-w-[320px] border border-white/10 rounded-3xl overflow-hidden animate-in zoom-in-95 duration-200 ring-1 ring-white/5">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        {step === 'input' && (
          <div className="p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-white/40" weight="duotone" />
                <h2 className="text-[13px] font-semibold text-white/60">Connect</h2>
              </div>
              <button onClick={handleClose} className="p-1 hover:bg-white/5 rounded text-white/20 transition-all">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
 
            <div className="space-y-4 flex flex-col items-center">
              <div className="w-60">
                <Input
                  placeholder="Connection URL..."
                  value={connectionString}
                  onChange={(e) => setConnectionString(e.target.value)}
                  className="h-10 text-[13px] bg-white/[0.02] border-white/5 focus:border-white/20 px-4 rounded-full font-mono focus:ring-0"
                  autoFocus
                />
              </div>
 
              {error && (
                <div className="text-[11px] text-red-500/60 px-1 leading-relaxed">
                  {error}
                </div>
              )}
 
              <div className="flex flex-col items-center gap-2 pt-2 w-60">
                <Button 
                  onClick={handleDetect} 
                  disabled={!connectionString.trim()} 
                  className="h-10 w-full bg-white text-black hover:bg-white/90 font-bold rounded-full transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]"
                >
                  Connect
                </Button>
                <Button 
                  variant="ghost" 
                  onClick={handleClose} 
                  className="h-10 w-full font-medium text-white/40 hover:text-white/80 border border-white/10 hover:border-white/20 rounded-full text-[12px] transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] "
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 'detecting' && (
          <div className="p-8 flex flex-col items-center justify-center gap-4">
            <CircleNotch className="w-6 h-6 animate-spin text-white/20" />
            <span className="text-[12px] font-medium text-white/40">Detecting...</span>
          </div>
        )}

        {step === 'select' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-white/20 uppercase tracking-widest">Select Route</span>
              <button 
                onClick={() => setStep('input')}
                className="text-[10px] font-medium text-white/40 hover:text-white/80"
              >
                Back
              </button>
            </div>
 
            <div className="space-y-2">
              <ConnectionOption
                type="local"
                result={localResult}
                onSelect={(type) => handleSelectConnection(type, localResult, dockerResult)}
                disabled={connecting}
              />
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