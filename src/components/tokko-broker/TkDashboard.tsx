import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import TkStats from './TkStats';
import TkSyncStatus from './TkSyncStatus';
import TkHistory from './TkHistory';
import type { TokkoStats, SyncHistory, SyncProgress } from '@/store/tokkoBrokerStore';

interface Props {
  stats: TokkoStats;
  history: SyncHistory[];
  syncing: boolean;
  syncProgress: SyncProgress | null;
  onSync: () => void;
  onChangeApiKey: () => void;
}

export default function TkDashboard({
  stats,
  history,
  syncing,
  syncProgress,
  onSync,
  onChangeApiKey,
}: Props) {
  console.log('[TkDashboard] Rendering - history length:', history?.length);
  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.section}>
        <TkStats stats={stats} />
      </View>

      <View style={styles.section}>
        <TkSyncStatus syncing={syncing} syncProgress={syncProgress} onSync={onSync} />
      </View>

      <View style={styles.section}>
        <TkHistory history={history} />
      </View>

      <TouchableOpacity style={styles.changeKeyButton} onPress={onChangeApiKey}>
        <Ionicons name="key-outline" size={20} color={COLORS.textSecondary} />
        <Text style={styles.changeKeyText}>Cambiar API Key</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  changeKeyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  changeKeyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
