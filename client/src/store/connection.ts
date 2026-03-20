import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Connection {
  id: string;
  name: string;
  maskedUrl: string;
  status: 'connecting' | 'connected' | 'error' | 'disconnected';
  error?: string;
  serverInfo?: {
    version: string;
    user: string;
    database: string;
  };
  latency?: number;
}

interface ConnectionState {
  connections: Connection[];
  activeConnectionId: string | null;
  addConnection: (conn: { name: string; maskedUrl: string }) => Promise<void>;
  completeConnection: (connectionString: string, name?: string) => Promise<void>;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  updateConnection: (id: string, updates: Partial<Connection>) => void;
  fetchConnections: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set, get) => ({
      connections: [],
      activeConnectionId: null,

      addConnection: async (conn) => {
        await get().completeConnection(conn.name);
      },

      completeConnection: async (connectionString: string, name?: string) => {
        const maskedUrl = connectionString.replace(/\/\/([^:@]+):([^@]+)@/, '//$1:****@');
        const displayName = name || maskedUrl;
        const tempId = 'connecting';
        
        set(state => ({
          connections: [
            ...state.connections,
            { 
              id: tempId, 
              name: displayName, 
              maskedUrl, 
              status: 'connecting' as const 
            }
          ],
          activeConnectionId: state.activeConnectionId || tempId
        }));

        try {
          const response = await fetch('/api/connections/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connectionString, name: displayName }),
          });

          const data = await response.json();
          
          if (data.error || !response.ok) {
            set(state => ({
              connections: state.connections.map(c =>
                c.id === tempId ? { ...c, status: 'error' as const, error: data.error } : c
              )
            }));
          } else {
            set(state => ({
              connections: state.connections.map(c =>
                c.id === tempId ? { 
                  id: data.id,
                  ...c, 
                  status: 'connected' as const, 
                  serverInfo: data.serverInfo,
                  latency: data.latency,
                } : c
              ),
              activeConnectionId: data.id,
            }));
          }
        } catch (err: any) {
          set(state => ({
            connections: state.connections.map(c =>
              c.id === tempId ? { ...c, status: 'error' as const, error: err.message } : c
            )
          }));
        }
      },

      removeConnection: async (id) => {
        await fetch(`/api/connections/${id}`, { method: 'DELETE' });
        set(state => {
          const newConnections = state.connections.filter(c => c.id !== id);
          const newActiveId = state.activeConnectionId === id 
            ? newConnections[0]?.id || null 
            : state.activeConnectionId;
          return { 
            connections: newConnections, 
            activeConnectionId: newActiveId 
          };
        });
      },

      setActiveConnection: (id) => {
        set({ activeConnectionId: id });
      },

      updateConnection: (id, updates) => {
        set(state => ({
          connections: state.connections.map(c =>
            c.id === id ? { ...c, ...updates } : c
          )
        }));
      },

      fetchConnections: async () => {
        try {
          const response = await fetch('/api/connections');
          const connections = await response.json();
          set({ connections });
        } catch (err) {
          console.error('Failed to fetch connections:', err);
        }
      },
    }),
    {
      name: 'dbviz-connections',
      storage: createJSONStorage(() => localStorage),
    }
  )
);