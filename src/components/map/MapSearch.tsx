import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  FlatList,
  Platform,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Property } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { SearchFiltersBar } from "./SearchFiltersBar";
import { PropertyMap } from "./PropertyMap";
import { CoincidentPropertiesSheet } from "./CoincidentPropertiesSheet";
import { SearchFiltersModal } from "./SearchFiltersModal";
import PolygonDrawingOverlay from "./PolygonDrawingOverlay";
import {
  usePropertyFilters,
} from "@/hooks/usePropertyFilters";
import { router } from "expo-router";
import {
  PolygonCoord,
  LocationChip,
  usePropertyFiltersStore,
} from "@/store/propertyFiltersStore";
import {
  useLocationSearchStore,
  LocationSuggestionWithCount,
} from "@/store/locationSearchStore";
import { COLORS } from "@/constants/colors";
import { logger } from "@/utils/logger";
import { getPlaceDetails, boundsToRegion } from "@/lib/geocodingService";

const log = logger.scoped("MapSearch");

interface MapSearchProps {
  properties: Property[];
  onSaveSearch: (name: string, leadName?: string, leadPhone?: string) => void;
}

const MapSearch: React.FC<MapSearchProps> = ({ properties, onSaveSearch }) => {
  const { user, profile } = useAuth();
  const { selectedLocation } = useApp();
  const insets = useSafeAreaInsets();

  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [highlightedPropertyId, setHighlightedPropertyId] = useState<string | null>(null);
  // Propiedades que comparten una misma coordenada (selector de "N en este punto").
  const [stackPropertyIds, setStackPropertyIds] = useState<string[] | null>(null);

  // Altura de la SearchFiltersBar para posicionar la instrucción de polígonos debajo de ella
  const [searchBarHeight, setSearchBarHeight] = useState(64);

  // ── Polígonos (múltiples) ──
  const [drawingMode, setDrawingMode] = useState(false);
  const [draftPoints, setDraftPoints] = useState<PolygonCoord[]>([]);
  // Vaciado progresivo del borrador (ver `drainDraftPoints`).
  const [draining, setDraining] = useState(false);
  const onDrainedRef = useRef<(() => void) | null>(null);

  // ── Búsqueda de zonas ──
  const [isZoneSearchOpen, setIsZoneSearchOpen] = useState(false);
  const [zoneQuery, setZoneQuery] = useState("");
  const zoneInputRef = useRef<TextInput>(null);
  const { suggestions, isLoading, searchLocations, clearSuggestions } =
    useLocationSearchStore();

  const googleApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  // Token de sesión para Places API (se reutiliza entre búsqueda y selección)
  const sessionTokenRef = useRef<string>(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const [focusRegion, setFocusRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  // Evita re-agregar el chip de la ubicación elegida en el buscador de inicio.
  const addedSelectedChipRef = useRef<string | null>(null);

  const {
    filteredProperties,
    addPolygon,
    removePolygon,
    addLocationChip,
    removeLocationChip,
    clearFilters,
    hasActiveFilters,
    filters,
  } = usePropertyFilters(properties, null);

  // PINs de las ubicaciones seleccionadas: un marcador en el centro de cada chip
  // (tanto la del buscador de inicio como las agregadas dentro del mapa).
  const locationPins = useMemo(() => {
    const pins: { key: string; latitude: number; longitude: number }[] = [];
    for (const chip of filters.locationChips) {
      if (chip.bounds) {
        pins.push({
          key: chip.id,
          latitude: (chip.bounds.north + chip.bounds.south) / 2,
          longitude: (chip.bounds.east + chip.bounds.west) / 2,
        });
      }
    }
    return pins;
  }, [filters.locationChips]);

  // ── Geocodificar selectedLocation para navegación inicial del mapa ──
  // selectedLocation viene del contexto (home page). Si tiene placeId, usa Place Details
  // directamente para obtener los bounds. Si no, usa Geocoding API como fallback.
  useEffect(() => {
    const cancelledRef = { current: false };

    if (!selectedLocation) {
      setFocusRegion(null);
      addedSelectedChipRef.current = null;
      return;
    }

    const sel = selectedLocation as any;
    const selKey = `${sel.type}-${sel.name}`;
    addedSelectedChipRef.current = null;

    // Agrega la ubicación elegida en el buscador de inicio como chip seleccionado
    // (filtro activo), igual que al elegir una zona dentro del mapa.
    const addSelectedAsChip = (
      bounds?: { north: number; south: number; east: number; west: number },
    ) => {
      if (addedSelectedChipRef.current === selKey) return;
      addedSelectedChipRef.current = selKey;
      const chipId = `selected-${selKey}`;
      const existing = usePropertyFiltersStore.getState().filters.locationChips;
      if (existing.some((c) => c.id === chipId)) return;
      const chip: LocationChip = {
        id: chipId,
        label: sel.name,
        type: (sel.type ?? "colonia") as "estado" | "municipio" | "colonia",
        bounds,
        locationFilter: {
          estado: sel.estado_nombre || (sel.type === "estado" ? sel.name : ""),
          ciudad: "",
          municipio: sel.municipio_nombre || (sel.type === "municipio" ? sel.name : ""),
          colonia: sel.type === "colonia" ? sel.name : "",
        },
      };
      addLocationChip(chip);
    };

    const geocode = async () => {
      if (cancelledRef.current) return;
      try {
        if (!googleApiKey) return;

        // Intentar con Place Details si hay placeId
        const placeId = sel.placeId;
        if (placeId) {
          const details = await getPlaceDetails(placeId);
          if (cancelledRef.current) return;
          if (details?.bounds) {
            setFocusRegion(boundsToRegion(details.bounds, selectedLocation.type));
            addSelectedAsChip(details.bounds);
            return;
          }
          if (details?.location) {
            const type = selectedLocation.type;
            const fallbackDelta = type === "colonia" ? 0.03 : type === "municipio" ? 0.06 : 0.05;
            setFocusRegion({
              latitude: details.location.lat,
              longitude: details.location.lng,
              latitudeDelta: fallbackDelta,
              longitudeDelta: fallbackDelta,
            });
            addSelectedAsChip(undefined);
            return;
          }
        }

        // Fallback: Geocoding API con el nombre del lugar
        const q = encodeURIComponent(`${selectedLocation.name}, Mexico`);
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${q}&region=mx&key=${googleApiKey}`;
        const res = await fetch(url);
        if (cancelledRef.current) return;
        const json = await res.json();
        if (cancelledRef.current) return;
        const result = json.results?.[0];
        if (result?.geometry) {
          const { location, bounds, viewport } = result.geometry;
          const b = bounds || viewport;
          if (b) {
            const gb = {
              north: b.northeast.lat,
              south: b.southwest.lat,
              east: b.northeast.lng,
              west: b.southwest.lng,
            };
            setFocusRegion(boundsToRegion(gb, selectedLocation.type));
            addSelectedAsChip(gb);
          } else if (location) {
            const type = selectedLocation.type;
            const fallbackDelta = type === "colonia" ? 0.03 : type === "municipio" ? 0.06 : 0.05;
            setFocusRegion({
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: fallbackDelta,
              longitudeDelta: fallbackDelta,
            });
            addSelectedAsChip(undefined);
          }
        }
      } catch (e) {
        log.warn("Error geocoding location", e);
      }
    };
    geocode();

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  // ── Debounce búsqueda de zonas ──
  useEffect(() => {
    if (!isZoneSearchOpen) return;
    const timer = setTimeout(() => {
      if (zoneQuery.trim().length >= 2) {
        // Mismo comportamiento que el buscador general: sin "(regions)" para
        // encontrar TODO (fraccionamientos, POIs como "Loretta") y sin contador
        // de propiedades por zona.
        searchLocations(zoneQuery.trim(), undefined, {
          restrictToRegions: false,
          withCounts: false,
          estado: profile?.estado,
        });
      } else {
        clearSuggestions();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [zoneQuery, isZoneSearchOpen, profile?.estado]);

  const openZoneSearch = () => {
    setIsZoneSearchOpen(true);
    setTimeout(() => zoneInputRef.current?.focus(), 100);
  };

  const closeZoneSearch = () => {
    Keyboard.dismiss();
    setIsZoneSearchOpen(false);
    setZoneQuery("");
    clearSuggestions();
  };

  const handleAddLocationChip = async (loc: LocationSuggestionWithCount) => {
    if (!mountedRef.current) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    closeZoneSearch();

    // Obtener bounds del lugar via Place Details API
    let bounds = undefined;
    try {
      if (loc.placeId) {
        const details = await getPlaceDetails(loc.placeId, sessionTokenRef.current);
        if (!mountedRef.current) return;
        // Refrescar token después de completar la sesión
        sessionTokenRef.current = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        if (details?.bounds) {
          bounds = details.bounds;
          // Centrar el mapa en la zona seleccionada
          setFocusRegion(boundsToRegion(bounds, loc.type));
        }
      }
    } catch (e) {
      log.warn("Error obteniendo bounds del chip:", e);
    }

    const chip: LocationChip = {
      id: `${loc.type}-${loc.name}-${Date.now()}`,
      label: loc.name,
      type: loc.type as "estado" | "municipio" | "colonia",
      bounds,
      // locationFilter legacy (fallback si no hay bounds)
      locationFilter: {
        estado: loc.estado_nombre || (loc.type === "estado" ? loc.name : ""),
        ciudad: "",
        municipio: loc.municipio_nombre || (loc.type === "municipio" ? loc.name : ""),
        colonia: loc.type === "colonia" ? loc.name : "",
      },
    };
    addLocationChip(chip);
  };

  // ── Handlers de marker ──
  const handleMarkerPress = (propertyId: string, _property: Property) => {
    setHighlightedPropertyId(propertyId);
    setTimeout(() => {
      setHighlightedPropertyId(null);
      router.push({ pathname: "/property/[id]", params: { id: propertyId } });
    }, 1000);
  };

  // Varias propiedades en la misma coordenada: abrir el selector para elegir.
  const handleStackPress = (propertyIds: string[]) => {
    if (propertyIds.length === 1) {
      handleMarkerPress(propertyIds[0], undefined as any);
      return;
    }
    setStackPropertyIds(propertyIds);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const stackProperties = useMemo(() => {
    if (!stackPropertyIds) return null;
    const byId = new Map(properties.map((p) => [p.id, p]));
    return stackPropertyIds
      .map((id) => byId.get(id))
      .filter((p): p is Property => !!p);
  }, [stackPropertyIds, properties]);

  // ── Handlers de polígono ──

  // Umbral de proximidad para cerrar el polígono tocando cerca del primer punto.
  // ~0.0004° ≈ 40 m, funciona bien a zoom de barrio/ciudad.
  const POLYGON_CLOSE_THRESHOLD = 0.0004;

  const handleLongPressMap = (coord: PolygonCoord) => {
    if (drawingMode) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setDrawingMode(true);
    setDraftPoints([coord]);
  };

  const handleMapPress = (coord: PolygonCoord) => {
    if (!drawingMode || draining) return;

    // Auto-cerrar polígono si el usuario presiona cerca del primer punto (3+ pts)
    if (draftPoints.length >= 3) {
      const first = draftPoints[0];
      if (
        Math.abs(coord.latitude - first.latitude) < POLYGON_CLOSE_THRESHOLD &&
        Math.abs(coord.longitude - first.longitude) < POLYGON_CLOSE_THRESHOLD
      ) {
        handleConfirmPolygon();
        return;
      }
    }

    // Vibración leve por cada nuevo punto
    if (Platform.OS !== "web") Haptics.selectionAsync();
    setDraftPoints((prev) => [...prev, coord]);
  };

  /**
   * Vacía el borrador quitando un punto por frame, en vez de golpe.
   *
   * En iOS, `setDraftPoints([])` desmontaba la Polyline, el Polygon y todos los
   * Markers en un mismo commit. react-native-maps 1.20 no tiene implementación
   * Fabric en iOS, así que RN pasa por el shim legacy, que elimina los hijos
   * *por posición* contra el array que `AIRMap` mantiene a mano: cada borrado lo
   * encoge y el siguiente índice apunta a otro elemento. De ahí el cierre de la
   * app al pulsar "Limpiar" (y no al pulsar "Deshacer", que quita un solo hijo).
   */
  const drainDraftPoints = useCallback((onDone?: () => void) => {
    onDrainedRef.current = onDone ?? null;
    setDraining(true);
  }, []);

  useEffect(() => {
    if (!draining) return;

    if (draftPoints.length === 0) {
      setDraining(false);
      const done = onDrainedRef.current;
      onDrainedRef.current = null;
      done?.();
      return;
    }

    const frame = requestAnimationFrame(() =>
      setDraftPoints((prev) => prev.slice(0, -1)),
    );
    return () => cancelAnimationFrame(frame);
  }, [draining, draftPoints.length]);

  const handleCancelDrawing = () => {
    drainDraftPoints(() => setDrawingMode(false));
  };

  const handleUndoPoint = () => setDraftPoints((prev) => prev.slice(0, -1));
  const handleClearDraft = () => drainDraftPoints();

  const handleConfirmPolygon = () => {
    if (draftPoints.length < 3) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Se captura el borrador y se confirma solo tras vaciarlo, para no montar el
    // polígono definitivo en el mismo commit en que se desmontan los vértices.
    const coords = draftPoints;
    drainDraftPoints(() => {
      addPolygon(coords);
      setDrawingMode(false);
    });
  };

  // ── Limpiar todo ──
  const handleClearAll = () => {
    drainDraftPoints(() => {
      clearFilters();
      setDrawingMode(false);
    });
  };

  const locationChips = filters.locationChips;
  const polygonChips = filters.polygons.map((_, i) => ({
    index: i,
    label: `Zona ${i + 1}`,
  }));

  return (
    <View style={styles.container}>
      {/* ── Mapa — renderizado PRIMERO, llena TODO el contenedor ── */}
      <View style={styles.mapContainer}>
        <PropertyMap
          properties={filteredProperties}
          onMarkerPress={drawingMode ? () => {} : handleMarkerPress}
          onStackPress={drawingMode ? undefined : handleStackPress}
          googleApiKey={googleApiKey}
          highlightedPropertyId={highlightedPropertyId}
          focusRegion={focusRegion}
          searchedLocationPins={locationPins}
          drawingMode={drawingMode}
          draftPolygonPoints={draftPoints}
          confirmedPolygons={filters.polygons}
          onMapPress={handleMapPress}
          onLongPressMap={handleLongPressMap}
          onCloseDraftPolygon={handleConfirmPolygon}
          topOffset={searchBarHeight}
        />
        <PolygonDrawingOverlay
          drawingMode={drawingMode}
          draftPoints={draftPoints}
          onCancel={handleCancelDrawing}
          onUndo={handleUndoPoint}
          onClear={handleClearDraft}
          topOffset={searchBarHeight}
          hasZones={filters.polygons.length > 0}
        />
      </View>

      {/* Selector cuando un pin agrupa varias propiedades en la misma coordenada */}
      <CoincidentPropertiesSheet
        properties={stackProperties}
        onClose={() => setStackPropertyIds(null)}
        onSelect={(p) => {
          setStackPropertyIds(null);
          router.push({ pathname: "/property/[id]", params: { id: p.id } });
        }}
      />

      {/* Barra inferior — SIEMPRE en el DOM para evitar que el mapa cambie de tamaño.
          En modo dibujo se oculta visualmente pero mantiene su espacio en el layout. */}
      <View
        style={[styles.bottomBar, { paddingBottom: 12 + insets.bottom }, drawingMode && styles.hidden]}
        pointerEvents={drawingMode ? "none" : "auto"}
      >
        <TouchableOpacity
          style={styles.refineSearchBtn}
          onPress={() => setShowFiltersModal(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="options-outline" size={22} color={COLORS.primary} />
          <View style={styles.refineSearchTextWrap}>
            <Text style={styles.refineSearchTitle}>Agregar filtros</Text>
            <Text style={styles.refineSearchSubtitle}>Precio y características</Text>
          </View>
          {hasActiveFilters && <View style={styles.activeFilterDot} />}
          <Ionicons name="chevron-forward" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Overlay de búsqueda de zonas (zIndex: 50 — encima de la barra) ── */}
      {isZoneSearchOpen && (
        <View style={styles.zoneSearchOverlay}>
          <View style={styles.zoneSearchInputRow}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} style={styles.zoneSearchIcon} />
            <TextInput
              ref={zoneInputRef}
              style={styles.zoneSearchInput}
              value={zoneQuery}
              onChangeText={setZoneQuery}
              placeholder="Buscar colonia, municipio, estado..."
              placeholderTextColor={COLORS.textTertiary}
              autoFocus
              returnKeyType="search"
            />
            <TouchableOpacity onPress={closeZoneSearch} hitSlop={8}>
              <Ionicons name="close" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {isLoading && (
            <View style={styles.zoneSearchLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}

          <FlatList
            data={suggestions}
            keyExtractor={(item, index) => `${item.type}-${item.name}-${item.municipio_nombre ?? ""}-${item.estado_nombre ?? ""}-${index}`}
            keyboardShouldPersistTaps="handled"
            style={styles.zoneSearchList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.zoneSearchItem}
                onPress={() => handleAddLocationChip(item)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    item.type === "estado"
                      ? "map-outline"
                      : item.type === "municipio"
                        ? "business-outline"
                        : "location-outline"
                  }
                  size={16}
                  color={COLORS.primary}
                  style={styles.zoneSearchItemIcon}
                />
                <View style={styles.zoneSearchItemText}>
                  <Text style={styles.zoneSearchItemName} numberOfLines={2}>
                    {item.fullDescription || item.name}
                  </Text>
                  {item.propertyCount != null && item.propertyCount > 0 && (
                    <Text style={styles.zoneSearchItemSub}>
                      {item.propertyCount} props
                    </Text>
                  )}
                </View>
                <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !isLoading && zoneQuery.length >= 2 ? (
                <Text style={styles.zoneSearchEmpty}>Sin resultados para "{zoneQuery}"</Text>
              ) : null
            }
          />
        </View>
      )}

      {/* ── SearchFiltersBar — renderizada AL FINAL para estar delante del MapView nativo en Android ── */}
      <View
        style={styles.searchBarWrapper}
        onLayout={(e) => setSearchBarHeight(e.nativeEvent.layout.height)}
      >
        <SearchFiltersBar
          hasActiveFilters={hasActiveFilters}
          onClearFilters={handleClearAll}
          locationChips={locationChips}
          polygonChips={polygonChips}
          onAddZone={openZoneSearch}
          onRemoveChip={removeLocationChip}
          onRemovePolygon={removePolygon}
          onBack={() => {
            if (isZoneSearchOpen) { closeZoneSearch(); return; }
            router.back();
          }}
        />
      </View>

      <SearchFiltersModal
        visible={showFiltersModal}
        onClose={() => setShowFiltersModal(false)}
        onViewResults={() => {
          setShowFiltersModal(false);
          router.push({ pathname: "/map-results" } as any);
        }}
        filteredPropertiesCount={filteredProperties.length}
        userId={user?.id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  mapContainer: {
    flex: 1,
  },
  // Wrapper de SearchFiltersBar — position absolute para que se renderice
  // ENCIMA del MapView nativo de Android (al estar al final del JSX)
  searchBarWrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.background,
    zIndex: 10,
    elevation: 10,
  },
  // Usado para ocultar visualmente el bottomBar en modo dibujo sin desmontarlo
  hidden: {
    opacity: 0,
  },
  refineSearchBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    position: "relative",
  },
  refineSearchTextWrap: {
    flex: 1,
    alignItems: "flex-start",
  },
  refineSearchTitle: {
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "700",
  },
  refineSearchSubtitle: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: "400",
    marginTop: 1,
  },
  activeFilterDot: {
    position: "absolute",
    top: 8,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warning,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  // Overlay de búsqueda de zonas
  zoneSearchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    maxHeight: 380,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  zoneSearchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
  },
  zoneSearchIcon: {
    flexShrink: 0,
  },
  zoneSearchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    paddingVertical: 0,
  },
  zoneSearchLoading: {
    paddingVertical: 12,
    alignItems: "center",
  },
  zoneSearchList: {
    maxHeight: 280,
  },
  zoneSearchItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
    gap: 10,
  },
  zoneSearchItemIcon: {
    flexShrink: 0,
  },
  zoneSearchItemText: {
    flex: 1,
  },
  zoneSearchItemName: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  zoneSearchItemSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  zoneSearchEmpty: {
    padding: 16,
    fontSize: 14,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
});

export default MapSearch;
