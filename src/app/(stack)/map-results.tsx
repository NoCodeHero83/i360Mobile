import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants";
import { useMapProperties, MapServerFilters } from "@/hooks/useMapProperties";
import { usePropertyFilters } from "@/hooks/usePropertyFilters";
import { useMapFeedItems } from "@/hooks/useMapFeedItems";
import { usePropertyFiltersStore } from "@/store/propertyFiltersStore";
import { usePropertyCacheStore } from "@/store/propertyCacheStore";
import { extractServerFilters } from "@/utils/mapServerFilters";
import { PropertyCard } from "@/components/cards";
import { CommentsBottomSheet } from "@/components/modals";
import { SaveSearchModal } from "@/components/map/SaveSearchModal";
import { SaveSearchSuccessSheet } from "@/components/map/SaveSearchSuccessSheet";
import { PublishSearchPostModal } from "@/components/map/PublishSearchPostModal";
import { useAuth } from "@/context/AuthContext";
import { FeedItem, User } from "@/types";

const PAGE_SIZE = 20;

// ── Resumen de filtros activos ────────────────────────────────────────────────
function SearchSummaryBar({ hasActiveFilters }: { hasActiveFilters: boolean }) {
  const { filters } = usePropertyFiltersStore();
  const pills: string[] = [];

  if (filters.operacion) {
    pills.push(filters.operacion.charAt(0).toUpperCase() + filters.operacion.slice(1));
  }
  if (filters.tipoPropiedad) {
    const t = filters.tipoPropiedad.charAt(0).toUpperCase() + filters.tipoPropiedad.slice(1);
    if (filters.subtipo?.length > 0) {
      pills.push(`${t}: ${filters.subtipo.join(", ")}`);
    } else {
      pills.push(t);
    }
  }
  if (filters.precioMin || filters.precioMax) {
    const min = filters.precioMin ? filters.precioMin : "0";
    const max = filters.precioMax ? filters.precioMax : "Max";
    pills.push(`${filters.moneda} ${min} – ${max}`);
  }

  const chars: string[] = [];
  if (filters.habitaciones && filters.habitaciones !== "No indicado") chars.push(`${filters.habitaciones} rec`);
  if (filters.banos && filters.banos !== "No indicado") chars.push(`${filters.banos} baños`);
  if (chars.length > 0) pills.push(chars.join(" • "));

  if (filters.m2TerrenoMin) pills.push(`≥ ${filters.m2TerrenoMin} m² terreno`);
  if (filters.m2ConstruccionMin) pills.push(`≥ ${filters.m2ConstruccionMin} m² const.`);
  if (filters.anchoTerrenoMin) pills.push(`≥ ${filters.anchoTerrenoMin} m frente`);
  if (filters.largoTerrenoMin) pills.push(`≥ ${filters.largoTerrenoMin} m fondo`);
  if (filters.comisionVentaMin) pills.push(`Comisión venta ≥ ${filters.comisionVentaMin}%`);
  if (filters.comisionRentaMin) pills.push(`Comisión renta ≥ ${filters.comisionRentaMin} mes`);

  // Ubicación base
  const loc = filters.locationFilter;
  if (loc?.municipio) pills.push(loc.municipio);
  else if (loc?.ciudad) pills.push(loc.ciudad);
  else if (loc?.estado) pills.push(loc.estado);

  // Location chips
  if (filters.locationChips?.length > 0) {
    filters.locationChips.forEach((c) => pills.push(c.label));
  }

  // Polígonos
  if (filters.polygons?.length > 0) {
    pills.push(filters.polygons.length === 1 ? "1 zona dibujada" : `${filters.polygons.length} zonas`);
  }

  // Filtros especializados
  const cf = filters.comercialFilters;
  const inf = filters.industrialFilters;
  const ag = filters.agricolaFilters;
  if (cf?.tipoUbicacion?.length) pills.push(cf.tipoUbicacion.join(", "));
  if (inf?.ubicacion?.length) pills.push(inf.ubicacion.join(", "));
  if (inf?.alturaLibre) pills.push(`Altura ${inf.alturaLibre}`);
  if (ag?.usoTerreno?.length) pills.push(ag.usoTerreno.join(", "));

  if (pills.length === 0 && !hasActiveFilters) return null;

  return (
    <View style={summaryStyles.container}>
      {pills.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={summaryStyles.pillsRow}
        >
          {pills.map((pill, i) => (
            <View key={i} style={summaryStyles.pill}>
              <Text style={summaryStyles.pillText}>{pill}</Text>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={summaryStyles.matchBanner}>
        <Ionicons name="notifications-outline" size={14} color={COLORS.primary} />
        <Text style={summaryStyles.matchText}>
          Haremos match automático cuando aparezca una propiedad con estos criterios
        </Text>
      </View>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    paddingBottom: 10,
  },
  pillsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  pill: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.primary,
  },
  matchBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  matchText: {
    fontSize: 12,
    color: COLORS.primary,
    flex: 1,
    lineHeight: 16,
  },
});

// ── Pantalla principal ────────────────────────────────────────────────────────
export default function MapResultsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const storeFilters = usePropertyFiltersStore((s) => s.filters);
  const [debouncedFilters, setDebouncedFilters] = useState<MapServerFilters>(
    () => extractServerFilters(storeFilters),
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedFilters(extractServerFilters(storeFilters));
    }, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [storeFilters]);

  const { data: allProperties = [] } = useMapProperties(debouncedFilters);
  const { filteredProperties, hasActiveFilters } = usePropertyFilters(allProperties, null);

  const [activeCommentItem, setActiveCommentItem] = useState<FeedItem | null>(null);
  const [offset, setOffset] = useState(0);
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [successSheetVisible, setSuccessSheetVisible] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [pendingPostMetadata, setPendingPostMetadata] = useState<any>(null);

  const propertyIds = filteredProperties.map((p) => p.id);
  const filterKey = propertyIds.join(",");
  const prevFilterKey = useRef(filterKey);

  // Reset cuando cambian los filtros
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      setOffset(0);
      setAllFeedItems([]);
    }
  }, [filterKey]);

  const pageIds = propertyIds.slice(offset, offset + PAGE_SIZE);
  const { data: pageFeedItems, isLoading, isFetching } = useMapFeedItems(pageIds);

  // Acumular páginas
  useEffect(() => {
    if (!pageFeedItems || pageFeedItems.length === 0) return;
    setAllFeedItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const newItems = pageFeedItems.filter((i) => !existingIds.has(i.id));
      return newItems.length > 0 ? [...prev, ...newItems] : prev;
    });
  }, [pageFeedItems]);

  const handleLoadMore = useCallback(() => {
    if (isFetching) return;
    const nextOffset = offset + PAGE_SIZE;
    if (nextOffset < propertyIds.length) {
      setOffset(nextOffset);
    }
  }, [offset, propertyIds.length, isFetching]);

  const handleOpenDetail = (item: FeedItem) => {
    if (item.propertyDetails?.id) {
      const cachedData = item.propertyDetails;
      usePropertyCacheStore.getState().setProperty(cachedData.id, cachedData);
      router.push({
        pathname: "/property/[id]",
        params: { id: cachedData.id },
      });
    }
  };

  const handleUserClick = (u: User) => {
    router.push({ pathname: "/(stack)/user/[id]", params: { id: u.id } });
  };

  const isInitialLoading = isLoading && allFeedItems.length === 0;
  const hasMore = offset + PAGE_SIZE < propertyIds.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={COLORS.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {filteredProperties.length} propiedad{filteredProperties.length !== 1 ? "es" : ""}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Resumen de filtros + banner de match */}
      <SearchSummaryBar hasActiveFilters={hasActiveFilters} />

      {/* Lista */}
      {isInitialLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlashList
          data={allFeedItems}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PropertyCard
              item={item}
              onClick={() => handleOpenDetail(item)}
              onCommentClick={() => setActiveCommentItem(item)}
              onUserClick={handleUserClick}
              currentUserId={user?.id}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            hasMore && isFetching ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={COLORS.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="home-outline" size={48} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>Sin propiedades</Text>
              <Text style={styles.emptySub}>
                Ajusta los filtros o el área del polígono
              </Text>
            </View>
          }
        />
      )}

      {/* Botón "Notifícame" — flotante */}
      <View style={[styles.saveBtnWrapper, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={styles.saveBtnBar} onPress={() => setShowSaveSearchModal(true)}>
          <Ionicons name="notifications-outline" size={22} color={COLORS.white} />
          <Text style={styles.saveBtnBarText}>Notifícame</Text>
        </Pressable>
      </View>

      <CommentsBottomSheet
        visible={activeCommentItem !== null}
        feedItemId={activeCommentItem?.id ?? ""}
        currentUserId={user?.id}
        onClose={() => setActiveCommentItem(null)}
      />

      <SaveSearchModal
        visible={showSaveSearchModal}
        onClose={() => setShowSaveSearchModal(false)}
        onSaveSuccessWithData={(metadata) => {
          setPendingPostMetadata(metadata ?? null);
          setSuccessSheetVisible(true);
        }}
        userId={user?.id}
      />

      <SaveSearchSuccessSheet
        visible={successSheetVisible}
        onPublish={() => {
          // Cerrar primero el bottom sheet y abrir el modal de publicar DESPUÉS
          // de que termine su animación de cierre. Apilar la transición de dos
          // Modales en el mismo commit provoca un bucle de render
          // ("Maximum update depth exceeded") al abrir "Publicar búsqueda".
          setSuccessSheetVisible(false);
          setTimeout(() => setPublishModalVisible(true), 320);
        }}
        onDismiss={() => setSuccessSheetVisible(false)}
      />

      <PublishSearchPostModal
        visible={publishModalVisible}
        initialMetadata={pendingPostMetadata}
        onClose={() => setPublishModalVisible(false)}
        onPublished={() => {
          setPublishModalVisible(false);
          setPendingPostMetadata(null);
          // Limpiar los filtros activos: si no, el feed (que oculta posts/reels
          // cuando hay filtros activos) saldría vacío al volver tras publicar.
          // Se pasa un locationFilter vacío explícito porque clearFilters() sin
          // argumento conserva el locationFilter actual.
          usePropertyFiltersStore.getState().clearFilters({
            estado: "",
            ciudad: "",
            municipio: "",
            colonia: "",
          });
          router.replace({
            pathname: "/(tabs)",
            params: { refresh: String(Date.now()) },
          });
        }}
        userId={user?.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  saveBtnWrapper: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  saveBtnBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingVertical: 15,
    borderRadius: 16,
    elevation: 6,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  saveBtnBarText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "700",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  emptySub: {
    fontSize: 14,
    color: COLORS.textTertiary,
    textAlign: "center",
    paddingHorizontal: 32,
  },
});
