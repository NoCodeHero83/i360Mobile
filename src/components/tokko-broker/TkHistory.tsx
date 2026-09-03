import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';
import type { SyncHistory } from '@/store/tokkoBrokerStore';

interface Props {
  history: SyncHistory[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
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
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function StatusDot({ status }: { status: SyncHistory['status'] }) {
  const colors = {
    completada: COLORS.success,
    en_progreso: COLORS.warning,
    error: COLORS.error,
    cancelada: COLORS.textSecondary,
  };

  return (
    <View style={[styles.dot, { backgroundColor: colors[status] }]} />
  );
}

function HistoryItem({ item }: { item: SyncHistory }) {
  console.log('[TkHistory] HistoryItem rendering:', item.id);
  const hasChanges = item.propiedades_nuevas > 0 || item.propiedades_actualizadas > 0;
  const isError = item.status === 'error';
  const isCompleted = item.status === 'completada';

  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <StatusDot status={item.status} />
        <Text style={styles.itemDate}>{formatDate(item.started_at)}</Text>
        {isCompleted && item.duracion_segundos !== null && (
          <View style={styles.durationBadge}>
            <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.durationText}>{formatDuration(item.duracion_segundos)}</Text>
          </View>
        )}
      </View>

      <View style={styles.itemContent}>
        {isError ? (
          <Text style={styles.errorText} numberOfLines={2}>
            {item.mensaje_error || 'Error en la sincronización'}
          </Text>
        ) : (
          <View style={styles.statsRow}>
            {item.propiedades_nuevas > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="add-circle" size={14} color={COLORS.success} />
                <Text style={styles.statBadgeText}>
                  {item.propiedades_nuevas} nuevas
                </Text>
              </View>
            )}
            {item.propiedades_actualizadas > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="refresh-circle" size={14} color={COLORS.primary} />
                <Text style={styles.statBadgeText}>
                  {item.propiedades_actualizadas} actualizadas
                </Text>
              </View>
            )}
            {item.propiedades_sin_cambios > 0 && (
              <View style={styles.statBadge}>
                <Ionicons name="checkmark-circle" size={14} color={COLORS.textSecondary} />
                <Text style={[styles.statBadgeText, styles.statBadgeMuted]}>
                  {item.propiedades_sin_cambios} sin cambios
                </Text>
              </View>
            )}
            {isCompleted && !hasChanges && item.propiedades_sin_cambios === 0 && (
              <Text style={styles.noChangesText}>Sin propiedades</Text>
            )}
          </View>
        )}

        {item.errores > 0 && (
          <View style={styles.errorBadge}>
            <Ionicons name="warning" size={14} color={COLORS.error} />
            <Text style={styles.errorBadgeText}>
              {item.errores} error{item.errores > 1 ? 'es' : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function TkHistory({ history }: Props) {
  console.log('[TkHistory] Rendering with history:', JSON.stringify(history));
  console.log('[TkHistory] history.length:', history?.length);

  if (!history || history.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="time-outline" size={32} color={COLORS.textSecondary} />
        <Text style={styles.emptyText}>Sin historial de sincronizaciones</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Historial</Text>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryItem item={item} />}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  item: {
    paddingVertical: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
    backgroundColor: COLORS.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontFamily: 'monospace',
  },
  itemDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  itemContent: {
    marginLeft: 16,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statBadgeText: {
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  statBadgeMuted: {
    color: COLORS.textSecondary,
  },
  noChangesText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  errorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  errorBadgeText: {
    fontSize: 12,
    color: COLORS.error,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: 8,
  },
  empty: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.white,
    borderRadius: 16,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});
