import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface TokkoConfig {
  id: string;
  api_key: string;
  api_key_full?: string;
  ultima_sincronizacion: string | null;
  total_propiedades_sincronizadas: number;
  sincronizacion_en_progreso: boolean;
  sincronizacion_actual_id: string | null;
  etag_hash: string | null;
}

export interface TokkoStats {
  total: number;
  lastSync: string | null;
}

export interface SyncHistory {
  id: string;
  status: 'en_progreso' | 'completada' | 'error' | 'cancelada';
  propiedades_procesadas: number;
  propiedades_nuevas: number;
  propiedades_actualizadas: number;
  propiedades_sin_cambios: number;
  errores: number;
  total_publicadas: number;
  mensaje_error: string | null;
  errores_detalle: object[] | null;
  started_at: string;
  completed_at: string | null;
  duracion_segundos: number | null;
}

export interface SyncProgress {
  procesadas: number;
  total: number;
}

export type SyncState = 'idle' | 'syncing' | 'completed' | 'error';

interface TokkoBrokerState {
  apiKey: string;
  hasApiKey: boolean;
  config: TokkoConfig | null;
  stats: TokkoStats;
  history: SyncHistory[];
  syncState: SyncState;
  syncProgress: SyncProgress | null;
  currentSyncId: string | null;
  error: string | null;
  loading: boolean;
  channel: RealtimeChannel | null;
}

interface TokkoBrokerActions {
  loadInitialData: () => Promise<void>;
  saveApiKey: (apiKey: string) => Promise<boolean>;
  setApiKey: (apiKey: string) => void;
  startSync: (force?: boolean, testLimit?: number) => Promise<{ success: boolean; message?: string }>;
  resetApiKey: () => void;
  subscribeToSyncUpdates: () => () => void;
  cleanup: () => void;
  setError: (error: string | null) => void;
}

type TokkoBrokerStore = TokkoBrokerState & TokkoBrokerActions;

export const useTokkoBrokerStore = create<TokkoBrokerStore>((set, get) => ({
  apiKey: '',
  hasApiKey: false,
  config: null,
  stats: { total: 0, lastSync: null },
  history: [],
  syncState: 'idle',
  syncProgress: null,
  currentSyncId: null,
  error: null,
  loading: true,
  channel: null,

  loadInitialData: async () => {
    try {
      set({ loading: true, error: null });

      const { data: configData, error: configError } = await supabase.rpc(
        'obtener_config_tokkobroker'
      );

      if (configError) throw configError;

      const config = configData?.data;
      const hasApiKeySaved = configData?.data?.tiene_api_key === true;

      if (hasApiKeySaved && config) {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;

        let propiedadesCount = 0;
        if (userId) {
          const { data } = await supabase.rpc(
            'contar_propiedades_tokkobroker',
            { p_usuario_id: userId }
          );
          propiedadesCount = data || 0;
        }

        set({
          config,
          hasApiKey: true,
          apiKey: config.api_key_full || '',
          stats: {
            total: propiedadesCount,
            lastSync: config.ultima_sincronizacion || null,
          },
        });

        const { data: historyData, error: historyError } = await supabase.rpc(
          'obtener_historial_tokkobroker',
          { p_limit: 10 }
        );

        console.log('[TokkoStore] History RPC result:', JSON.stringify(historyData), 'error:', historyError);

        if (historyData) {
          const historyList = Array.isArray(historyData.data) ? historyData.data : [];
          console.log('[TokkoStore] Setting history:', historyList.length, 'items');
          set({ history: historyList });
        } else {
          console.log('[TokkoStore] No history data, setting empty array');
          set({ history: [] });
        }

        if (config.sincronizacion_en_progreso && config.sincronizacion_actual_id) {
          set({
            syncState: 'syncing',
            currentSyncId: config.sincronizacion_actual_id,
          });
          get().subscribeToSyncUpdates();
        }
      } else {
        set({ 
          hasApiKey: false, 
          config: null, 
          apiKey: '',
          stats: { total: 0, lastSync: null },
          history: [],
          loading: false 
        });
        return;
      }

      set({ loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  saveApiKey: async (apiKey: string) => {
    try {
      set({ loading: true, error: null });

      // Skip API key validation for now - accept all keys
      const { error: saveError } = await supabase.rpc('guardar_api_key_tokkobroker', {
        p_api_key: apiKey,
      });

      if (saveError) throw saveError;

      set({ apiKey, hasApiKey: true, loading: false });
      return true;
    } catch (error: any) {
      set({ error: error.message, loading: false });
      return false;
    }
  },

  setApiKey: (apiKey: string) => {
    set({ apiKey });
  },

  startSync: async (force = false, testLimit?: number) => {
    try {
      set({ syncState: 'syncing', error: null, syncProgress: null });

      // Si no tiene config guardada, guardar la API key primero
      if (!get().config) {
        const { error: saveError } = await supabase.rpc('guardar_api_key_tokkobroker', {
          p_api_key: get().apiKey,
        });
        if (saveError) throw saveError;
      }

      const { data: createData, error: createError } = await supabase.rpc(
        'crear_sincronizacion_tokkobroker'
      );

      if (createError) throw createError;
      if (!createData?.success) throw new Error(createData?.message || 'Error al crear sincronización');

      const syncId = createData.sync_id;
      set({ currentSyncId: syncId });

      const body: any = { sync_id: syncId, force };
      if (testLimit) {
        body.test_limit = testLimit;
      }

      const result = await supabase.functions.invoke('sincronizar-tokkobroker', {
        body,
      });

      if (result.error) {
        set({ syncState: 'error', error: result.error.message });
        return { success: false, message: result.error.message };
      }

      if (result.data?.error) {
        set({ syncState: 'error', error: result.data.error });
        return { success: false, message: result.data.error };
      }

      set({ syncState: 'completed', syncProgress: null });

      await get().loadInitialData();

      return { success: true };
    } catch (error: any) {
      set({ syncState: 'error', error: error.message });
      return { success: false, message: error.message };
    }
  },

  resetApiKey: () => {
    set({
      apiKey: '',
      hasApiKey: false,
      config: null,
      stats: { total: 0, lastSync: null },
      history: [],
      syncState: 'idle',
      syncProgress: null,
      currentSyncId: null,
      error: null,
    });
  },

  subscribeToSyncUpdates: () => {
    const { currentSyncId, channel } = get();
    if (channel) {
      channel.unsubscribe();
    }

    if (!currentSyncId) return () => {};

    const newChannel = supabase
      .channel(`tokko-sync-${currentSyncId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sincronizaciones_tokkobroker',
          filter: `id=eq.${currentSyncId}`,
        },
        (payload) => {
          const sync = payload.new as SyncHistory;
          if (sync.status === 'en_progreso') {
            set({
              syncState: 'syncing',
              syncProgress: {
                procesadas: sync.propiedades_procesadas || 0,
                total: sync.total_publicadas || 0,
              },
            });
          } else if (sync.status === 'completada') {
            set({
              syncState: 'completed',
              syncProgress: null,
              currentSyncId: null,
            });
          } else if (sync.status === 'error') {
            set({
              syncState: 'error',
              error: sync.mensaje_error || 'Error en sincronización',
              syncProgress: null,
              currentSyncId: null,
            });
          }
        }
      )
      .subscribe();

    set({ channel: newChannel });

    return () => {
      newChannel.unsubscribe();
      set({ channel: null });
    };
  },

  cleanup: () => {
    const { channel } = get();
    if (channel) {
      channel.unsubscribe();
    }
    set({
      apiKey: '',
      hasApiKey: false,
      config: null,
      stats: { total: 0, lastSync: null },
      history: [],
      syncState: 'idle',
      syncProgress: null,
      currentSyncId: null,
      error: null,
      loading: true,
      channel: null,
    });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
