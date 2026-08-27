import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HistorialBusqueda } from '@/types';

interface HistorySearchesProps {
  historial: HistorialBusqueda[];
  onSelect: (busqueda: HistorialBusqueda) => void;
  onRemove: (id: string) => void;
  isLoading?: boolean;
}

export const HistorySearches: React.FC<HistorySearchesProps> = ({
  historial,
  onSelect,
  onRemove,
  isLoading = false,
}) => {
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#666" />
      </View>
    );
  }

  if (historial.length === 0) {
    return null;
  }

  const displayedItems = showAll ? historial : historial.slice(0, 5);

  const formatPrice = (item: HistorialBusqueda): string => {
    if (!item.precio_min && !item.precio_max) return '';
    
    const formatNum = (n: number): string => {
      if (n >= 1000000) return `$${n / 1000000}M`;
      if (n >= 1000) return `$${n / 1000}K`;
      return `$${n}`;
    };
    
    if (item.precio_min && item.precio_max) {
      return `${formatNum(item.precio_min)}-${formatNum(item.precio_max)}`;
    }
    if (item.precio_min) return `Desde ${formatNum(item.precio_min)}`;
    if (item.precio_max) return `Hasta ${formatNum(item.precio_max)}`;
    return '';
  };

  const formatTimeAgo = (date: string): string => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return 'Hace un momento';
    if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} horas`;
    if (seconds < 604800) return `Hace ${Math.floor(seconds / 86400)} días`;
    
    const d = new Date(date);
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  };

  const getTitulo = (item: HistorialBusqueda): string => {
    if (item.resultado_titulo) return item.resultado_titulo;
    if (item.place_name) return item.place_name;
    if (item.query_original) return item.query_original;
    const parts = [item.colonia, item.municipio, item.estado].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Búsqueda sin título';
  };

  const getSubtitulo = (item: HistorialBusqueda): string | null => {
    if (item.resultado_subtitulo) return item.resultado_subtitulo;
    return null;
  };

  const getIcon = (item: HistorialBusqueda): string => {
    switch (item.tipo_busqueda) {
      case 'ubicacion':
        return 'location-outline';
      case 'usuario':
        return 'person-outline';
      case 'propiedad':
        return 'home-outline';
      case 'post':
        return 'document-text-outline';
      case 'reel':
        return 'play-circle-outline';
      case 'draft':
      default:
        return 'search-outline';
    }
  };

  const getFiltrosPreview = (item: HistorialBusqueda): string => {
    const parts: string[] = [];
    
    if (item.tipo_propiedad) parts.push(item.tipo_propiedad);
    if (item.tipo_operacion === 'venta') parts.push('Venta');
    else if (item.tipo_operacion === 'renta') parts.push('Renta');
    
    const price = formatPrice(item);
    if (price) parts.push(price);
    
    if (item.habitaciones) parts.push(`${item.habitaciones} rec`);
    if (item.banos) parts.push(`${item.banos} baños`);
    
    return parts.join(' · ');
  };

  const renderItem = ({ item }: { item: HistorialBusqueda }) => {
    const titulo = getTitulo(item);
    const subtitulo = getSubtitulo(item);
    const filtros = getFiltrosPreview(item);
    const iconName = getIcon(item);
    
    return (
      <Pressable
        style={styles.item}
        onPress={() => onSelect(item)}
        android_ripple={{ color: '#f0f0f0' }}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={iconName as any} size={18} color="#666" />
        </View>
        <View style={styles.content}>
          <Text style={styles.titulo} numberOfLines={1}>
            {titulo}
          </Text>
          {subtitulo && (
            <Text style={styles.subtitulo} numberOfLines={1}>
              {subtitulo}
            </Text>
          )}
          {filtros ? (
            <Text style={styles.filtros} numberOfLines={1}>
              {filtros}
            </Text>
          ) : null}
          <Text style={styles.time}>
            {formatTimeAgo(item.updated_at || item.created_at)}
          </Text>
        </View>
        <Pressable
          style={styles.removeBtn}
          onPress={() => onRemove(item.id)}
          hitSlop={8}
        >
          <Ionicons name="close" size={16} color="#999" />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Historial de búsquedas</Text>
      </View>

      <FlatList
        data={displayedItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {historial.length > 5 && !showAll && (
        <Pressable style={styles.verMas} onPress={() => setShowAll(true)}>
          <Text style={styles.verMasText}>Ver más...</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  clearAll: {
    fontSize: 14,
    color: '#007AFF',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingRight: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  titulo: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
    marginBottom: 1,
  },
  subtitulo: {
    fontSize: 13,
    color: '#888',
    marginBottom: 2,
  },
  filtros: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  time: {
    fontSize: 12,
    color: '#999',
  },
  removeBtn: {
    padding: 6,
    marginLeft: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 44,
  },
  verMas: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  verMasText: {
    fontSize: 14,
    color: '#007AFF',
  },
});
