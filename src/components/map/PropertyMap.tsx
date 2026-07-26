import React, { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { View, Text, StyleSheet, Platform, Pressable } from "react-native";
import * as Haptics from "expo-haptics";

import MapView, {
  Marker,
  Polygon,
  Polyline,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
} from "../shared/MapComponents";
import { Property } from "@/types";
import { COLORS } from "@/constants/colors";
import { Globe, MapIcon, Layers, Mountain, ChevronDown } from "lucide-react-native";
import { PolygonCoord } from "@/store/propertyFiltersStore";
import Supercluster from "supercluster";

/** Estable: cada nueva referencia reescribe la prop nativa de la Polyline. */
const DRAFT_DASH_PATTERN = [8, 4];

interface PropertyMapProps {
  properties: Property[];
  onMarkerPress: (propertyId: string, property: Property) => void;
  /** Se dispara cuando un pin/clúster representa VARIAS propiedades en la misma
      coordenada (que el zoom no puede separar). Recibe todos sus ids para que
      la pantalla ofrezca un selector; sin esto solo se abriría una de ellas. */
  onStackPress?: (propertyIds: string[]) => void;
  googleApiKey?: string;
  highlightedPropertyId?: string | null;
  focusRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  drawingMode?: boolean;
  draftPolygonPoints?: PolygonCoord[];
  confirmedPolygons?: PolygonCoord[][];
  onMapPress?: (coord: PolygonCoord) => void;
  onLongPressMap?: (coord: PolygonCoord) => void;
  /** Cierra el polígono al tocar su primer vértice. */
  onCloseDraftPolygon?: () => void;
  /** Pins clásicos en el punto exacto de cada ubicación buscada/agregada. */
  searchedLocationPins?: { key: string; latitude: number; longitude: number }[];
  /** Altura de una barra superior que tape el mapa (p. ej. SearchFiltersBar),
      para bajar el selector de tipo de mapa y que no quede oculto. */
  topOffset?: number;
}

export const PropertyMap: React.FC<PropertyMapProps> = ({
  properties,
  onMarkerPress,
  onStackPress,
  googleApiKey,
  highlightedPropertyId,
  focusRegion,
  drawingMode = false,
  draftPolygonPoints = [],
  confirmedPolygons = [],
  onMapPress,
  onLongPressMap,
  onCloseDraftPolygon,
  searchedLocationPins,
  topOffset = 0,
}) => {
  const mapRef = useRef<any>(null);
  const nativeMapRef = useRef<MapView>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // Cierre del polígono tocando el primer vértice (crítico en iOS): el onPress
  // se conecta desde que el vértice se crea (longitud 1) y se mantiene ESTABLE,
  // para que Apple Maps registre el manejador de toque antes de que el marcador
  // se congele (tracksViewChanges=false). Si se añadiera al llegar a 3 puntos,
  // el marcador ya estaría congelado y no tomaría el nuevo handler. El handler
  // no hace nada hasta que hay 3+ puntos; la longitud se lee por ref para no
  // cambiar la identidad del callback (que recrearía el marcador).
  const draftLenRef = useRef(draftPolygonPoints.length);
  draftLenRef.current = draftPolygonPoints.length;
  const onCloseRef = useRef(onCloseDraftPolygon);
  onCloseRef.current = onCloseDraftPolygon;
  const handleFirstVertexPress = useCallback(() => {
    if (draftLenRef.current >= 3) onCloseRef.current?.();
  }, []);
  const [overlayPositions, setOverlayPositions] = useState<{
    [key: string]: { x: number; y: number };
  }>({});
  const [clusterOverlayPositions, setClusterOverlayPositions] = useState<{
    [key: string]: { x: number; y: number };
  }>({});
  // Posición en pantalla del primer vértice del borrador (píxeles). Se usa para
  // dibujar un botón de cierre de RN encima; ver nota en el JSX del overlay.
  const [firstVertexScreenPos, setFirstVertexScreenPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // "hybrid" por defecto (satélite + etiquetas de calles/colonias): en
  // "satellite" puro no había nombres y era difícil orientarse en el mapa.
  const [mapTypeId, setMapTypeId] = useState<
    "standard" | "satellite" | "hybrid" | "terrain"
  >("hybrid");
  const [mapTypeMenuOpen, setMapTypeMenuOpen] = useState(false);

  const [currentRegion, setCurrentRegion] = useState({
    latitude: 25.6866,
    longitude: -100.3161,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });

  // Fast lookup map for properties
  const propertyMap = useMemo(() => {
    const map = new Map<string, Property>();
    properties.forEach((p) => map.set(p.id, p));
    return map;
  }, [properties]);

  // Clave de coincidencia por coordenada (~1 m con 5 decimales). Varias
  // propiedades pueden compartir exactamente la misma coordenada (p. ej.
  // EasyBroker asigna a menudo el centro de la colonia, no la casa concreta):
  // sus marcadores quedan encimados y, sin agrupar, solo se abriría una.
  const coincidenceKey = (lat: number, lng: number) =>
    `${lat.toFixed(5)},${lng.toFixed(5)}`;

  const coincidentGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    properties.forEach((p) => {
      const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
      const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
      if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;
      const key = coincidenceKey(lat, lng);
      const arr = groups.get(key);
      if (arr) arr.push(p.id);
      else groups.set(key, [p.id]);
    });
    return groups;
  }, [properties]);

  const superclusterRef = useRef<Supercluster | null>(null);

  const superclusterIndex = useMemo(() => {
    const sc = new Supercluster({ radius: 50, maxZoom: 14 });
    const points = properties
      .map((p) => {
        const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
        const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
        if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lng, lat] },
          properties: { propertyId: p.id },
        };
      })
      .filter(Boolean) as any[];
    console.log(`[MapDebug] supercluster: ${points.length} puntos con coords (de ${properties.length} props totales)`);
    sc.load(points);
    superclusterRef.current = sc;
    return sc;
  }, [properties]);

  const latDeltaToZoom = (delta: number) =>
    Math.round(Math.log(360 / delta) / Math.LN2);

  const clusters = useMemo(() => {
    if (Platform.OS === "web") return [];
    const zoom = latDeltaToZoom(currentRegion.latitudeDelta);
    const { latitude, longitude, latitudeDelta, longitudeDelta } = currentRegion;
    const bbox: [number, number, number, number] = [
      longitude - longitudeDelta,
      latitude - latitudeDelta,
      longitude + longitudeDelta,
      latitude + latitudeDelta,
    ];
    const result = superclusterIndex.getClusters(bbox, zoom);
    const isCluster = result.filter((c: any) => c.properties.cluster).length;
    const isPoint = result.filter((c: any) => !c.properties.cluster).length;
    console.log(`[MapDebug] clusters: ${result.length} (${isCluster} agrupados, ${isPoint} individuales) | zoom: ${zoom} | latDelta: ${latitudeDelta.toFixed(3)} | center: ${latitude.toFixed(3)},${longitude.toFixed(3)}`);
    return result;
  }, [superclusterIndex, currentRegion]);

  const individualPropertyIds = useMemo(
    () =>
      new Set(
        clusters
          .filter((c: any) => !c.properties.cluster)
          .map((c: any) => c.properties.propertyId as string),
      ),
    [clusters],
  );

  const handleClusterPress = (clusterId: number) => {
    const leaves = superclusterIndex.getLeaves(clusterId, Infinity);
    // Con una lista vacía, MapKit calcula un MKMapRect nulo y aborta.
    if (leaves.length === 0) return;
    const coords = leaves.map((l: any) => ({
      latitude: l.geometry.coordinates[1],
      longitude: l.geometry.coordinates[0],
    }));
    // Si TODAS las hojas están (casi) en el mismo punto, el zoom nunca separará
    // el clúster: ofrecemos un selector con todas las propiedades en su lugar.
    const first = coords[0];
    const allSamePoint = coords.every(
      (c) =>
        Math.abs(c.latitude - first.latitude) < 1e-5 &&
        Math.abs(c.longitude - first.longitude) < 1e-5,
    );
    if (allSamePoint && onStackPress) {
      onStackPress(leaves.map((l: any) => l.properties.propertyId as string));
      return;
    }
    nativeMapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
      animated: true,
    });
  };

  const lastUpdateRef = useRef<number>(0);
  const regionRef = useRef<any>(null);
  const isCalculatingRef = useRef(false);
  const drawingModeRef = useRef(drawingMode);
  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);
  const focusRegionRef = useRef(focusRegion);
  useEffect(() => { focusRegionRef.current = focusRegion; }, [focusRegion]);

  // Optimized function to calculate positions only for visible elements
  const updateOverlayPositions = async (region?: any) => {
    if (
      Platform.OS === "web" ||
      !nativeMapRef.current ||
      !mapReady
    )
      return;

    // Use the passed region or the last known one
    const activeRegion = region || regionRef.current;
    if (!activeRegion) return;

    // Throttle: avoid overlapping calculations
    if (isCalculatingRef.current) return;

    const now = Date.now();
    // Only update every ~32ms during motion to keep bridge clear (30fps)
    if (region && now - lastUpdateRef.current < 32) return;

    isCalculatingRef.current = true;
    lastUpdateRef.current = now;

    try {
      // ── Posiciones de precio (propiedades individuales) ──
      const { latitude, longitude, latitudeDelta, longitudeDelta } = activeRegion;
      const latBuffer = latitudeDelta * 0.5;
      const lngBuffer = longitudeDelta * 0.5;
      const minLat = latitude - latitudeDelta - latBuffer;
      const maxLat = latitude + latitudeDelta + latBuffer;
      const minLng = longitude - longitudeDelta - lngBuffer;
      const maxLng = longitude + longitudeDelta + lngBuffer;

      const visibleProps = properties.filter((p) => {
        const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
        const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
        if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return false;
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });

      const limitedProps = visibleProps.slice(0, 500);
      const newPositions: any = {};
      const propPromises = limitedProps.map(async (p) => {
        const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
        const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
        try {
          if (!nativeMapRef.current) return;
          const point = await nativeMapRef.current.pointForCoordinate({
            latitude: Number(lat),
            longitude: Number(lng),
          });
          newPositions[p.id] = point;
        } catch (e) { /* ignore */ }
      });
      await Promise.all(propPromises);

      // ── Posiciones de clusters ──
      const currentClusters = superclusterRef.current?.getClusters(
        [minLng, minLat, maxLng, maxLat],
        latDeltaToZoom(latitudeDelta),
      ) ?? [];
      const clusterFeatures = currentClusters.filter((c: any) => c.properties.cluster);
      const newClusterPositions: any = {};
      const clusterPromises = clusterFeatures.map(async (c: any) => {
        const [lng, lat] = c.geometry.coordinates;
        try {
          if (!nativeMapRef.current) return;
          const point = await nativeMapRef.current.pointForCoordinate({
            latitude: lat,
            longitude: lng,
          });
          newClusterPositions[`cluster-${c.id}`] = {
            x: point.x,
            y: point.y,
            count: c.properties.point_count as number,
            clusterId: c.id,
          };
        } catch (e) { /* ignore */ }
      });
      await Promise.all(clusterPromises);

      // ── Posición del primer vértice del borrador (botón de cierre) ──
      let firstVertexPos: { x: number; y: number } | null = null;
      if (
        drawingMode &&
        draftPolygonPoints.length >= 3 &&
        nativeMapRef.current
      ) {
        try {
          const fp = await nativeMapRef.current.pointForCoordinate({
            latitude: draftPolygonPoints[0].latitude,
            longitude: draftPolygonPoints[0].longitude,
          });
          firstVertexPos = { x: fp.x, y: fp.y };
        } catch (e) { /* ignore */ }
      }

      requestAnimationFrame(() => {
        setOverlayPositions(newPositions);
        setClusterOverlayPositions(newClusterPositions);
        setFirstVertexScreenPos(firstVertexPos);
      });
    } finally {
      isCalculatingRef.current = false;
    }
  };

  useEffect(() => {
    if (mapReady) {
      updateOverlayPositions();
    }
  }, [properties.length, mapReady, currentRegion]);

  // Recalcular la posición del primer vértice al añadir/quitar puntos o al
  // entrar/salir del modo dibujo (esas acciones no disparan onRegionChange).
  useEffect(() => {
    if (mapReady) updateOverlayPositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPolygonPoints.length, drawingMode, mapReady]);

  const formatPrice = (
    price: number,
    currency: "USD" | "MXN" = "MXN",
  ): string => {
    const symbol = currency === "USD" ? "USD" : "MXN";
    if (price === 0) return `${symbol} 0`;
    if (price >= 1000000) {
      return `${symbol} ${(price / 1000000).toFixed(1)}M`;
    } else if (price >= 1000) {
      return `${symbol} ${Math.round(price / 1000)}k`;
    }
    return `${symbol} ${price}`;
  };

  const calculateRegionWithPadding = () => {
    if (properties.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;

    properties.forEach((p) => {
      const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
      const lng = p.coordinates?.lng ?? p.longitud ?? undefined;

      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
    });

    if (minLat === Infinity) return null;

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Calcular deltas base
    let latDelta = maxLat - minLat;
    let lngDelta = maxLng - minLng;

    // Si las propiedades están muy cerca, establecer un mínimo
    latDelta = Math.max(latDelta, 0.02);
    lngDelta = Math.max(lngDelta, 0.02);

    // Multiplicar por 3 para dar MUCHO espacio a los marcadores
    latDelta *= 3;
    lngDelta *= 3;

    return {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  // Sincronizar currentRegion con focusRegion inmediatamente (para el bbox de Supercluster)
  useEffect(() => {
    if (focusRegion) {
      setCurrentRegion(focusRegion);
      regionRef.current = focusRegion;
    }
  }, [focusRegion]);

  // Animar la cámara solo cuando cambia focusRegion (navegación explícita)
  useEffect(() => {
    if (Platform.OS === "web" || !nativeMapRef.current || !mapReady) return;
    if (!focusRegion) return;
    nativeMapRef.current?.animateToRegion(focusRegion, 700);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [focusRegion, mapReady]);

  // Auto-fit inicial solo cuando no hay focusRegion (carga sin ubicación seleccionada)
  const hasAutoFitRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web" || !nativeMapRef.current || !mapReady) return;
    if (focusRegion) { hasAutoFitRef.current = true; return; }
    if (hasAutoFitRef.current) return;
    if (properties.length === 0) return;
    const region = calculateRegionWithPadding();
    if (region) {
      hasAutoFitRef.current = true;
      setCurrentRegion(region);
      setTimeout(() => {
        if (focusRegionRef.current) return;
        nativeMapRef.current?.animateToRegion(region, 1000);
      }, 700);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, mapReady]);

  // Re-centrar cuando hay propiedades filtradas pero están fuera del focusRegion
  // (ej: búsqueda por texto encuentra propiedades con colonias coincidentes
  //  pero en coordenadas distintas a la ubicación seleccionada en Google)
  const hasFitFilteredRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web" || !nativeMapRef.current || !mapReady) return;
    if (!focusRegion) return;
    if (properties.length === 0) return;
    if (hasFitFilteredRef.current) return;
    const region = calculateRegionWithPadding();
    if (!region) return;
    const isOutside = Math.abs(region.latitude - focusRegion.latitude) > focusRegion.latitudeDelta * 0.8
      || Math.abs(region.longitude - focusRegion.longitude) > focusRegion.longitudeDelta * 0.8;
    if (!isOutside) return;
    hasFitFilteredRef.current = true;
    const combined = {
      latitude: (region.latitude + focusRegion.latitude) / 2,
      longitude: (region.longitude + focusRegion.longitude) / 2,
      latitudeDelta: Math.max(region.latitudeDelta, focusRegion.latitudeDelta) * 1.3,
      longitudeDelta: Math.max(region.longitudeDelta, focusRegion.longitudeDelta) * 1.3,
    };
    nativeMapRef.current?.animateToRegion(combined, 700);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties, focusRegion, mapReady]);

  useEffect(() => {
    if (Platform.OS !== "web" || !mapInstanceRef.current) return;
    if (focusRegion) {
      const gmaps = (window as any).google?.maps;
      if (!gmaps) return;
      mapInstanceRef.current.setCenter({
        lat: focusRegion.latitude,
        lng: focusRegion.longitude,
      });
      const d = focusRegion.latitudeDelta;
      const zoom =
        d <= 0.02 ? 13 : d <= 0.04 ? 12 : d <= 0.06 ? 11 : d <= 0.1 ? 10 : 9;
      mapInstanceRef.current.setZoom(zoom);
      return;
    }
    if (properties.length === 0) return;

    const bounds = new (window as any).google.maps.LatLngBounds();

    properties.forEach((p) => {
      const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
      const lng = p.coordinates?.lng ?? p.longitud ?? undefined;

      if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
        bounds.extend({ lat, lng });
      }
    });

    if (!bounds.isEmpty()) {
      mapInstanceRef.current.fitBounds(bounds, {
        padding: { top: 150, right: 150, bottom: 150, left: 150 },
      });
    }
  }, [properties]);

  useEffect(() => {
    if (Platform.OS !== "web" || !googleApiKey) return;

    const initMap = () => {
      if (!mapRef.current || !(window as any).google?.maps) return;

      const map = new (window as any).google.maps.Map(mapRef.current, {
        center: { lat: 25.6866, lng: -100.3161 },
        zoom: 11,
        disableDefaultUI: true,
      });

      mapInstanceRef.current = map;
    };

    const existing = document.querySelector(
      "script[data-google-maps]",
    ) as HTMLScriptElement | null;

    if (existing && (window as any).google?.maps) {
      initMap();
      return;
    }

    if (!existing) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${googleApiKey}`;
      script.async = true;
      script.defer = true;
      script.dataset.googleMaps = "true";
      script.onload = initMap;
      document.head.appendChild(script);
    }
  }, [googleApiKey]);

  useEffect(() => {
    if (Platform.OS !== "web" || !mapInstanceRef.current) return;

    const gmaps = (window as any).google?.maps;
    if (!gmaps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    properties.forEach((p) => {
      const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
      const lng = p.coordinates?.lng ?? p.longitud ?? undefined;

      if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;

      const priceText = formatPrice(p.price || 0, p.currency);
      const isHighlighted = p.id === highlightedPropertyId;
      const markerColor = isHighlighted ? COLORS.warning : COLORS.primary;

      const svgMarker = `
        <svg xmlns="http://www.w3.org/2000/svg" width="90" height="45" viewBox="0 0 90 45">
          <rect x="8" y="4" width="74" height="30" rx="15" fill="${markerColor}" stroke="white" stroke-width="2.5" />
          <text x="45" y="23" font-family="Arial" font-size="13" fill="white" text-anchor="middle" font-weight="bold">${priceText}</text>
          <path d="M 40 34 L 45 42 L 50 34 Z" fill="${markerColor}" stroke="white" stroke-width="2" />
        </svg>
      `;

      const marker = new gmaps.Marker({
        position: { lat: Number(lat), lng: Number(lng) },
        map: mapInstanceRef.current,
        icon: {
          url:
            "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svgMarker),
          scaledSize: new gmaps.Size(90, 45),
          anchor: new gmaps.Point(45, 42),
        },
        optimized: false,
      });

      marker.addListener("click", () => onMarkerPress(p.id, p));
      markersRef.current.push(marker);
    });
  }, [properties, highlightedPropertyId]);

  const initialRegion = useMemo(() => {
    const region = calculateRegionWithPadding();
    return (
      region || {
        latitude: 25.6866,
        longitude: -100.3161,
        latitudeDelta: 0.5,
        longitudeDelta: 0.5,
      }
    );
  }, []);

  const makeFocusRegion = (lat: number, lng: number) => {
    const baseDelta = 0.06;
    const latDelta = baseDelta;
    const lngDelta = baseDelta;
    const verticalOffset = latDelta * 0.6;
    return {
      latitude: lat + verticalOffset,
      longitude: lng,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  };

  useEffect(() => {
    if (Platform.OS === "web" || !nativeMapRef.current) return;
    if (!highlightedPropertyId) return;
    const target = properties.find((p) => p.id === highlightedPropertyId);
    if (!target) return;
    const lat = target.coordinates?.lat ?? target.latitud ?? undefined;
    const lng = target.coordinates?.lng ?? target.longitud ?? undefined;
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return;
    const region = makeFocusRegion(Number(lat), Number(lng));
    nativeMapRef.current?.animateToRegion(region, 600);
  }, [highlightedPropertyId]);

  if (Platform.OS === "web" && googleApiKey) {
    return (
      <View style={styles.container}>
        <View ref={mapRef as any} style={styles.mapWeb} />
        {properties.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              No hay propiedades para mostrar
            </Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={nativeMapRef}
        style={styles.mapNative}
        mapType={mapTypeId}
        provider={
          Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT
        }
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        onRegionChange={(region) => {
          regionRef.current = region;
          updateOverlayPositions(region);
        }}
        onRegionChangeComplete={(region) => {
          regionRef.current = region;
          setCurrentRegion(region);
          updateOverlayPositions(region);
          console.log(`[MapDebug] onRegionChangeComplete: latDelta=${region.latitudeDelta.toFixed(3)} center=${region.latitude.toFixed(3)},${region.longitude.toFixed(3)}`);
        }}
        // Dibujando, un toque simple añade punto. Antes solo servía el long
        // press: en iOS se perdía en cuanto el dedo se movía un poco, y de ahí
        // la sensación de que "a veces el punto no se marca".
        onPress={(e) => {
          if (drawingMode && onMapPress) {
            onMapPress(e.nativeEvent.coordinate);
          }
        }}
        onLongPress={(e) => {
          const coord = e.nativeEvent.coordinate;
          if (drawingMode && onMapPress) {
            onMapPress(coord);
          } else if (!drawingMode && onLongPressMap) {
            onLongPressMap(coord);
          }
        }}
        scrollEnabled={true}
        zoomEnabled={true}

        moveOnMarkerPress={false}
      >
        {/* Polígonos confirmados (múltiples) */}
        {confirmedPolygons.map((polygon, i) =>
          polygon.length >= 3 ? (
            <Polygon
              key={`confirmed-polygon-${i}`}
              coordinates={polygon}
              fillColor="rgba(69,160,165,0.18)"
              strokeColor={COLORS.primary}
              strokeWidth={2}
            />
          ) : null,
        )}

        {/* Polígono en borrador */}
        {draftPolygonPoints.length >= 2 && (
          <Polyline
            coordinates={draftPolygonPoints}
            strokeColor={COLORS.primary}
            strokeWidth={2.5}
            lineDashPattern={DRAFT_DASH_PATTERN}
          />
        )}
        {draftPolygonPoints.length >= 3 && (
          <Polygon
            coordinates={draftPolygonPoints}
            fillColor="rgba(69,160,165,0.12)"
            strokeColor="transparent"
            strokeWidth={0}
          />
        )}

        {/* Vértices del borrador. El primero cierra el polígono al tocarlo:
            en iOS el marker intercepta el toque y nunca llegaba al MapView,
            así que el "presiona el primer punto para cerrar" no funcionaba. */}
        {draftPolygonPoints.map((pt, idx) => (
          <DraftVertex
            key={`vertex-${idx}`}
            coord={pt}
            isFirst={idx === 0}
            // El primer vértice lleva onPress SIEMPRE (estable) para que iOS lo
            // registre al crearse; no hace nada hasta que hay 3+ puntos.
            onPress={idx === 0 ? handleFirstVertexPress : undefined}
          />
        ))}
        {/* Invisible cluster touch targets */}
        {clusters
          .filter((c: any) => c.properties.cluster)
          .map((cluster: any) => {
            const [lng, lat] = cluster.geometry.coordinates;
            return (
              <Marker
                key={`cluster-touch-${cluster.id}`}
                coordinate={{ latitude: lat, longitude: lng }}
                onPress={() => handleClusterPress(cluster.id)}
                tracksViewChanges={false}
                anchor={{ x: 0.5, y: 0.5 }}
                opacity={0}
              />
            );
          })}

        {/* Markers individuales — invisibles (detectan toque), solo para props no agrupadas */}
        {clusters
          .filter((c: any) => !c.properties.cluster)
          .map((point: any) => {
            const propertyId = point.properties.propertyId as string;
            const p = propertyMap.get(propertyId);
            if (!p) return null;
            const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
            const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
            if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) return null;
            return (
              <Marker
                key={p.id}
                coordinate={{ latitude: Number(lat), longitude: Number(lng) }}
                onPress={() => {
                  // Si en esta misma coordenada hay varias propiedades (zoom
                  // cercano, sin agrupar), abrir el selector en vez de una sola.
                  const group = coincidentGroups.get(
                    coincidenceKey(Number(lat), Number(lng)),
                  );
                  if (group && group.length > 1 && onStackPress) {
                    if (Platform.OS !== "web") Haptics.selectionAsync();
                    onStackPress(group);
                    return;
                  }
                  const r = makeFocusRegion(Number(lat), Number(lng));
                  nativeMapRef.current?.animateToRegion(r, 600);
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  onMarkerPress(p.id, p);
                }}
                opacity={0}
                tracksViewChanges={false}
              />
            );
          })}

        {/* Pins clásicos de las ubicaciones buscadas (color distinto al de las propiedades) */}
        {searchedLocationPins?.map((pin) => (
          <Marker
            key={`searched-pin-${pin.key}`}
            coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
            pinColor={COLORS.error}
            title="Ubicación buscada"
            zIndex={9999}
            tracksViewChanges={false}
          />
        ))}
      </MapView>

      {/* Overlay absoluto para los precios (Inmune a los recortes de Android).
          Cuando varias propiedades comparten coordenada exacta (típico de
          EasyBroker, que fija el centro de la colonia) sus badges quedaban
          EXACTAMENTE encimados y parecía uno solo. Aquí dibujamos UN solo badge
          por coordenada y le añadimos un contador "N" para dejar claro que hay
          varias; el toque ya abre el selector (CoincidentPropertiesSheet). */}
      {Platform.OS !== "web" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {(() => {
            const drawnCoincidentKeys = new Set<string>();
            return Object.entries(overlayPositions).map(([id, pos]) => {
              const p = propertyMap.get(id);
              if (!p) return null;
              if (!individualPropertyIds.has(id)) return null;

              // Conteo de propiedades en la MISMA coordenada; si ya dibujamos un
              // badge para esta coordenada, omitimos los duplicados encimados.
              const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
              const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
              const coincKey =
                lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)
                  ? coincidenceKey(lat, lng)
                  : null;
              const stackCount = coincKey
                ? coincidentGroups.get(coincKey)?.length ?? 1
                : 1;
              if (coincKey && stackCount > 1) {
                if (drawnCoincidentKeys.has(coincKey)) return null;
                drawnCoincidentKeys.add(coincKey);
              }

              const isHighlighted = p.id === highlightedPropertyId;
              const priceText = formatPrice(p.price || 0, p.currency);
              const bgColor = isHighlighted ? COLORS.warning : COLORS.primary;

              return (
                <View
                  key={`price-${p.id}`}
                  style={{
                    position: "absolute",
                    left: Math.max(6, (pos as any).x - 35),
                    top: Math.max(6, (pos as any).y - 35),
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: bgColor,
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      borderWidth: 1.5,
                      borderColor: "white",
                      elevation: 5,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.3,
                      shadowRadius: 2,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    >
                      {priceText}
                    </Text>
                  </View>
                  <View
                    style={{
                      width: 0,
                      height: 0,
                      borderLeftWidth: 5,
                      borderRightWidth: 5,
                      borderTopWidth: 7,
                      borderLeftColor: "transparent",
                      borderRightColor: "transparent",
                      borderTopColor: bgColor,
                      marginTop: -1,
                    }}
                  />
                  {stackCount > 1 && (
                    <View
                      style={{
                        position: "absolute",
                        top: -8,
                        right: -10,
                        minWidth: 20,
                        height: 20,
                        paddingHorizontal: 4,
                        borderRadius: 10,
                        backgroundColor: COLORS.error,
                        borderWidth: 1.5,
                        borderColor: "white",
                        alignItems: "center",
                        justifyContent: "center",
                        elevation: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 10,
                          fontWeight: "bold",
                        }}
                      >
                        {stackCount > 99 ? "99+" : stackCount}
                      </Text>
                    </View>
                  )}
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* Cluster bubbles overlay — rendered outside MapView para garantizar visibilidad en Android */}
      {Platform.OS !== "web" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {Object.entries(clusterOverlayPositions).map(([key, data]: [string, any]) => {
            const count = data.count as number;
            const size = count < 10 ? 44 : count < 50 ? 56 : 68;
            const bg =
              count < 10 ? COLORS.primary : count < 50 ? "#E07B00" : COLORS.error;
            return (
              <View
                key={key}
                style={{
                  position: "absolute",
                  left: data.x - size / 2,
                  top: data.y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: bg + "30",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: size * 0.7,
                    height: size * 0.7,
                    borderRadius: (size * 0.7) / 2,
                    backgroundColor: bg,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 2,
                    borderColor: "white",
                  }}
                >
                  <Text style={styles.clusterCount}>
                    {count > 999 ? "999+" : count}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Botón de cierre del polígono: overlay REAL de RN sobre el primer
          vértice. En iOS el onPress del Marker nativo exigía doble toque (la
          anotación de Apple Maps se "selecciona" en el primer toque y solo
          dispara el onPress en el segundo). Un Pressable de RN por encima del
          mapa captura el toque de forma fiable al primer intento en ambas
          plataformas; su posición se calcula con pointForCoordinate. El anillo
          resaltado indica "toca aquí para cerrar". */}
      {Platform.OS !== "web" &&
        drawingMode &&
        firstVertexScreenPos &&
        draftPolygonPoints.length >= 3 && (
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onCloseDraftPolygon?.();
              }}
              hitSlop={10}
              style={{
                position: "absolute",
                left: firstVertexScreenPos.x - 26,
                top: firstVertexScreenPos.y - 26,
                width: 52,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View style={vertexStyles.closeRing} />
            </Pressable>
          </View>
        )}

      {properties.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No hay propiedades para mostrar</Text>
        </View>
      )}

      {/* Selector de tipo de mapa — renderizado AL FINAL (después del MapView)
          para garantizar visibilidad sobre el MapView nativo en Android */}
      {(() => {
        const activeOption =
          MAP_TYPE_OPTIONS.find((o) => o.id === mapTypeId) ??
          MAP_TYPE_OPTIONS[0];
        const ActiveIcon = activeOption.Icon;
        // Deja libre el hint "Mantén presionado el mapa..." que se muestra
        // en topOffset + 12; se baja de más para evitar cualquier solape.
        const buttonTop = topOffset + 96;
        return (
          <>
            {mapTypeMenuOpen && (
              <Pressable
                style={styles.mapTypeBackdrop}
                onPress={() => setMapTypeMenuOpen(false)}
              />
            )}
            <Pressable
              style={[styles.mapTypeButton, { top: buttonTop }]}
              onPress={() => setMapTypeMenuOpen((v) => !v)}
            >
              <View style={styles.mapTypeButtonIcon}>
                <ActiveIcon size={10} />
                <Text style={styles.mapTypeButtonText}>
                  {activeOption.label}
                </Text>
                <ChevronDown size={10} />
              </View>
            </Pressable>
            {mapTypeMenuOpen && (
              <View style={[styles.mapTypeMenu, { top: buttonTop + 44 }]}>
                {MAP_TYPE_OPTIONS.filter(
                  (o) => o.id !== "terrain" || Platform.OS === "android",
                ).map((option) => {
                  const OptionIcon = option.Icon;
                  const isActive = option.id === mapTypeId;
                  return (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.mapTypeMenuItem,
                        isActive && styles.mapTypeMenuItemActive,
                      ]}
                      onPress={() => {
                        setMapTypeId(option.id);
                        setMapTypeMenuOpen(false);
                        if (Platform.OS !== "web") Haptics.selectionAsync();
                      }}
                    >
                      <OptionIcon size={14} />
                      <Text style={styles.mapTypeMenuItemText}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        );
      })()}
    </View>
  );
};

const MAP_TYPE_OPTIONS = [
  { id: "standard", label: "Mapa", Icon: MapIcon },
  { id: "satellite", label: "Satélite", Icon: Globe },
  { id: "hybrid", label: "Híbrido", Icon: Layers },
  { id: "terrain", label: "Terreno", Icon: Mountain }, // se filtra fuera de Android
] as const;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  markerWrapper: {
    display: "none",
  },
  markerContainer: {
    display: "none",
  },
  markerText: {
    display: "none",
  },
  mapWeb: {
    width: "100%",
    height: "100%",
  },
  mapNative: {
    width: "100%",
    height: "100%",
  },
  emptyState: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: [{ translateX: -100 }, { translateY: -20 }],
    backgroundColor: COLORS.white,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 3,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
  mapTypeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 3,
    padding: 8,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    elevation: 3,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  mapTypeButtonIcon: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mapTypeButtonText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  mapTypeBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  mapTypeMenu: {
    position: "absolute",
    top: 56,
    right: 16,
    zIndex: 3,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    elevation: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    minWidth: 130,
  },
  mapTypeMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  mapTypeMenuItemActive: {
    backgroundColor: COLORS.primary + "22",
  },
  mapTypeMenuItemText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  clusterOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  clusterInner: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  clusterCount: {
    color: "white",
    fontSize: 13,
    fontWeight: "bold",
  },
});

const vertexStyles = StyleSheet.create({
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.white,
    borderWidth: 2.5,
    borderColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  dotFirst: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
  },
  // Área tocable transparente alrededor del primer vértice: agranda el objetivo
  // del toque de cierre sin cambiar el tamaño visible del puntito.
  firstHitbox: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // Anillo resaltado del botón de cierre (overlay de RN sobre el primer vértice).
  closeRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: COLORS.primary,
    backgroundColor: "rgba(69,160,165,0.22)",
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primary,
  },
});

/**
 * Vértice del polígono en borrador.
 * Inicia con tracksViewChanges activo para que react-native-maps capture el
 * contenido del marker (si arranca en false, el primer punto queda invisible),
 * y lo desactiva tras el primer layout para no penalizar el rendimiento.
 */
function DraftVertex({
  coord,
  isFirst = false,
  onPress,
}: {
  coord: PolygonCoord;
  isFirst?: boolean;
  onPress?: () => void;
}) {
  const [track, setTrack] = useState(true);
  const handleLayout = () => {
    if (track) setTrack(false);
  };
  return (
    <Marker
      coordinate={coord}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={track}
      onPress={onPress}
      // Sin esto, el toque sobre el vértice también llega al MapView y añade
      // un punto encima del primero en vez de cerrar el polígono.
      stopPropagation={Boolean(onPress)}
    >
      {/* El primer vértice es el objetivo del toque de cierre: se le da un área
          tocable amplia y transparente (44px, mínimo de Apple) alrededor del
          puntito visible, para poder atinarle con el dedo en iOS. El puntito es
          siempre mayor que el resto. El aspecto no puede depender de `onPress`
          porque, con tracksViewChanges ya en false, iOS no repintaría. */}
      {isFirst ? (
        <View style={vertexStyles.firstHitbox} onLayout={handleLayout}>
          <View style={[vertexStyles.dot, vertexStyles.dotFirst]}>
            <View style={vertexStyles.dotInner} />
          </View>
        </View>
      ) : (
        <View style={vertexStyles.dot} onLayout={handleLayout}>
          <View style={vertexStyles.dotInner} />
        </View>
      )}
    </Marker>
  );
}
