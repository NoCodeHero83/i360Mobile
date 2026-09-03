import { useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useTokkoBrokerStore } from '@/store/tokkoBrokerStore';

export function useTokkoBroker() {
  const { user } = useAuth();
  const store = useTokkoBrokerStore();

  useEffect(() => {
    if (user?.id) {
      store.loadInitialData();
    }
    return () => {
      store.cleanup();
    };
  }, [user?.id]);

  const handleSaveAndSync = useCallback(async () => {
    if (!store.apiKey?.trim()) {
      store.setError('Ingresa una API Key válida');
      return false;
    }
    const saved = await store.saveApiKey(store.apiKey);
    if (saved) {
      await store.startSync();
    }
    return saved;
  }, [store.apiKey]);

  const handleSync = useCallback(async () => {
    await store.startSync();
  }, []);

  const handleTestSync = useCallback(async () => {
    await store.startSync(false, 2);
  }, []);

  const handleChangeApiKey = useCallback(() => {
    store.resetApiKey();
  }, []);

  return {
    apiKey: store.apiKey || '',
    setApiKey: store.setApiKey,
    hasApiKey: store.hasApiKey,
    loading: store.loading,
    syncing: store.syncState === 'syncing',
    syncProgress: store.syncProgress,
    stats: store.stats,
    history: store.history,
    error: store.error,
    handleSaveAndSync,
    handleSync,
    handleTestSync,
    changeApiKey: handleChangeApiKey,
    clearError: () => store.setError(null),
  };
}

export default useTokkoBroker;
