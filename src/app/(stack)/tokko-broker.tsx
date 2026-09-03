import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useModal } from '@/context/ModalContext';
import { useTokkoBroker } from '@/hooks/useTokkoBroker';
import { COLORS } from '@/constants/colors';
import { AppHeader } from '@/components/AppHeader';
import { ScreenWrapper } from '@/screens/ScreenWrapper';
import TkOnboarding from '@/components/tokko-broker/TkOnboarding';
import TkDashboard from '@/components/tokko-broker/TkDashboard';

export default function TokkoBrokerScreen() {
  const router = useRouter();
  const { showModal } = useModal();
  const {
    apiKey,
    setApiKey,
    hasApiKey,
    loading,
    syncing,
    syncProgress,
    stats,
    history,
    error,
    handleSaveAndSync,
    handleSync,
    changeApiKey,
    clearError,
  } = useTokkoBroker();

  useEffect(() => {
    if (error) {
      showModal({
        title: 'Error',
        message: error,
        confirmText: 'Entendido',
        onConfirm: clearError,
      });
    }
  }, [error]);

  useEffect(() => {
    if (syncing && syncProgress === null) {
      showModal({
        title: 'Sincronizando...',
        message: 'La sincronización con Toko Broker está en progreso.',
        confirmText: 'Ok',
      });
    }
  }, [syncing, syncProgress]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  if (loading) {
    return (
      <ScreenWrapper withHeader={false} style={styles.container}>
        <AppHeader title="Toko Broker" showBackButton onBack={handleBack} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper withHeader={false} style={styles.container}>
      <AppHeader title="Toko Broker" showBackButton onBack={handleBack} />
      {!hasApiKey ? (
        <TkOnboarding
          apiKey={apiKey}
          setApiKey={setApiKey}
          onSave={handleSaveAndSync}
          loading={loading}
        />
      ) : (
        <TkDashboard
          stats={stats}
          history={history}
          syncing={syncing}
          syncProgress={syncProgress}
          onSync={handleSync}
          onChangeApiKey={changeApiKey}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
