import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

interface Props {
  syncing: boolean;
  syncProgress: any;
  onSync: () => void;
}

export default function TkSyncStatus({ syncing, onSync }: Props) {
  return (
    <View style={styles.buttonContainer}>
      <TouchableOpacity
        style={[styles.syncButton, syncing && styles.syncButtonDisabled]}
        onPress={onSync}
        activeOpacity={0.7}
        disabled={syncing}
      >
        <View style={styles.syncButtonContent}>
          <View style={[styles.syncIconContainer, syncing && styles.syncIconContainerActive]}>
            <Ionicons 
              name={syncing ? "sync" : "cloud-download-outline"} 
              size={24} 
              color={COLORS.white} 
            />
          </View>
          <View style={styles.syncTextContainer}>
            <Text style={styles.syncButtonTitle}>
              {syncing ? 'Sincronizando...' : 'Sincronizar ahora'}
            </Text>
            <Text style={styles.syncButtonSubtitle}>
              {syncing ? 'Importando propiedades...' : 'Importar propiedades de Toko Broker'}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.6)" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  syncButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 16,
  },
  syncButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
  },
  syncButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  syncIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncIconContainerActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  syncTextContainer: {
    gap: 2,
  },
  syncButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  syncButtonSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
});
