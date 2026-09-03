import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import type { TokkoStats } from '@/store/tokkoBrokerStore';

interface Props {
  stats: TokkoStats;
}

function formatLastSync(lastSync: string | null): string {
  if (!lastSync) return 'Nunca';

  const date = new Date(lastSync);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins}m`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
  });
}

export default function TkStats({ stats }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.mainStat}>
        <View style={styles.iconBoxLarge}>
          <Ionicons name="home" size={28} color={COLORS.primary} />
        </View>
        <View style={styles.mainStatContent}>
          <Text style={styles.mainStatValue}>{stats.total}</Text>
          <Text style={styles.mainStatLabel}>Propiedades sincronizadas</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.secondaryStat}>
        <View style={styles.iconBoxSmall}>
          <Ionicons name="time" size={16} color={COLORS.textSecondary} />
        </View>
        <View style={styles.secondaryStatContent}>
          <Text style={styles.secondaryStatValue}>{formatLastSync(stats.lastSync)}</Text>
          <Text style={styles.secondaryStatLabel}>Última sincronización</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  mainStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBoxLarge: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainStatContent: {
    flex: 1,
  },
  mainStatValue: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 36,
  },
  mainStatLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  secondaryStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBoxSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryStatContent: {
    flex: 1,
  },
  secondaryStatValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  secondaryStatLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});
