import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useLocationSearchStore } from "@/store/locationSearchStore";
import { usePropertyFiltersStore } from "@/store/propertyFiltersStore";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { logger } from "@/utils/logger";
import { router } from "expo-router";
import { blockService } from "@/services/blockService";

const log = logger.scoped("useSearch");

export interface SearchUser {
  id: string;
  name: string;
  avatar?: string;
  ocupacion?: string;
  rating?: number;
}

export interface SearchPost {
  id: string;
  feed_item_id: string;
  img?: string;
  tipo?: string;
  fecha_hora?: string;
  ubicacion?: string;
  foto_propiedad?: string;
  busquedas_json?: any;
  antiguedad?: number;
  nombre_asesor?: string;
  foto_perfil_usuario?: string;
  status?: string;
}

export interface SearchReel {
  id: string;
  feed_item_id: string;
  img?: string;
  views?: string;
}

export interface SearchLocation {
  id: string;
  name: string;
  count: number;
  type?: "estado" | "municipio" | "colonia";
  municipio?: string;
  estado?: string;
  estadoId?: number;
  /** Descripción completa de Google Places (ej. "Polanco, Miguel Hidalgo, CDMX, México") */
  fullDescription?: string;
  /** placeId de Google Places: identifica unívocamente el lugar para centrar el mapa exacto */
  placeId?: string;
}

export interface SearchProperty {
  id: string;
  codigo_propiedad: string;
  fotos: string[] | null;
  precio: number | null;
  moneda: string | null;
  colonia: string | null;
  municipio: string | null;
  estado: string | null;
  habitaciones: number | null;
  banos: number | null;
  metros_cuadrados_construccion: number | null;
  metros_cuadrados_terreno: number | null;
}

export interface SearchResults {
  users: SearchUser[];
  posts: SearchPost[];
  reels: SearchReel[];
  locations: SearchLocation[];
  properties: SearchProperty[];
}

const EMPTY_RESULTS: SearchResults = {
  users: [],
  posts: [],
  reels: [],
  locations: [],
  properties: [],
};

const isNotBlocked = (id: string | null | undefined, blockedIds: string[]) =>
  !id || !blockedIds.includes(id);

async function fetchUsers(
  q: string,
  blockedUserIds: string[],
): Promise<SearchUser[]> {
  // RPC `buscar_perfiles`: normaliza acentos/espacios y exige que TODAS las
  // palabras del término estén presentes (AND) sobre el nombre completo armado
  // de las partes. Reemplaza el `.or(...ilike...)` que fallaba con acentos
  // ("Gutierrez" ≠ "Gutiérrez"), con apellidos parciales ("Alejandro G") y con
  // datos que traían dobles espacios. Ver supabase/buscar_perfiles.sql.
  const { data } = await supabase.rpc("buscar_perfiles", { q, lim: 10 });

  return ((data as any[]) ?? [])
    .filter((p) => isNotBlocked(p.id, blockedUserIds))
    .map((p) => ({
      id: p.id,
      name: p.nombre_completo || [p.nombre, p.apellido_paterno].filter(Boolean).join(" ") || "Usuario",
      avatar: p.foto || undefined,
      ocupacion: p.ocupacion || undefined,
      rating: p.calificacion_promedio ? parseFloat(p.calificacion_promedio) : undefined,
    }));
}

async function fetchPosts(q: string, blockedUserIds: string[]): Promise<SearchPost[]> {
  const FIELDS = "id, publicado_por, tipo, imagenes, fecha_hora, ubicacion, foto_propiedad, busquedas_json, antiguedad, nombre_asesor, foto_perfil_usuario, status";
  const base = () => supabase.from("posts").select(FIELDS).is("deleted_at", null).limit(9);

  const [{ data: byContenido }, { data: byUbicacion }, { data: byTipo }] = await Promise.all([
    base().ilike("contenido", `%${q}%`),
    base().ilike("ubicacion", `%${q}%`),
    base().ilike("tipo", `%${q}%`),
  ]);

  const seen = new Set<string>();
  const posts: any[] = [];
  for (const row of [...(byContenido ?? []), ...(byUbicacion ?? []), ...(byTipo ?? [])]) {
    if (!seen.has(row.id) && isNotBlocked(row.publicado_por, blockedUserIds)) {
      seen.add(row.id);
      posts.push(row);
    }
  }
  if (!posts.length) return [];

  const postIds = posts.map((p) => p.id);
  const { data: feedItems } = await supabase
    .from("feed_items")
    .select("id, contenido_id, estado_moderacion")
    .eq("tipo_contenido", "post")
    .eq("estado_moderacion", "activo")
    .in("contenido_id", postIds);

  const feedMap = new Map((feedItems ?? []).map((f) => [f.contenido_id, f]));

  return posts
    .map((p) => {
      const fi = feedMap.get(p.id);
      if (!fi) return null;
      const img = Array.isArray(p.imagenes) ? p.imagenes[0] : undefined;
      return {
        id: p.id,
        feed_item_id: fi.id,
        img,
        tipo: p.tipo,
        fecha_hora: p.fecha_hora ?? undefined,
        ubicacion: p.ubicacion ?? undefined,
        busquedas_json: p.busquedas_json ?? undefined,
        antiguedad: p.antiguedad ?? undefined,
        nombre_asesor: p.nombre_asesor ?? undefined,
        foto_propiedad: p.foto_propiedad ?? undefined,
        foto_perfil_usuario: p.foto_perfil_usuario ?? undefined,
        status: p.status ?? undefined,
      };
    })
    .filter(Boolean) as SearchPost[];
}

async function fetchReels(q: string, blockedUserIds: string[]): Promise<SearchReel[]> {
  const { data: reels } = await supabase
    .from("reels")
    .select("id, publicado_por, thumbnail_url")
    .ilike("descripcion", `%${q}%`)
    .is("deleted_at", null)
    .limit(6);

  const visibleReels = (reels ?? []).filter((r) =>
    isNotBlocked(r.publicado_por, blockedUserIds),
  );

  if (!visibleReels.length) return [];

  const reelIds = visibleReels.map((r) => r.id);
  const { data: feedItems } = await supabase
    .from("feed_items")
    .select("id, contenido_id, vistas_count")
    .eq("tipo_contenido", "reel")
    .eq("estado_moderacion", "activo")
    .in("contenido_id", reelIds);

  const feedMap = new Map((feedItems ?? []).map((f) => [f.contenido_id, f]));

  return visibleReels
    .map((r) => {
      const fi = feedMap.get(r.id);
      if (!fi) return null;
      const views = fi.vistas_count ?? 0;
      const viewsStr =
        views >= 1000 ? `${(views / 1000).toFixed(1)}K` : String(views);
      return {
        id: r.id,
        feed_item_id: fi.id,
        img: r.thumbnail_url || undefined,
        views: views > 0 ? viewsStr : undefined,
      };
    })
    .filter(Boolean) as SearchReel[];
}

async function fetchProperties(
  q: string,
  blockedUserIds: string[],
): Promise<SearchProperty[]> {
  const plain = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let query = supabase
    .from("propiedades")
    .select("id, created_by, codigo_propiedad, fotos, colonia, municipio, estado, habitaciones, banos, metros_cuadrados_construccion, metros_cuadrados_terreno, operaciones_propiedad(precio, moneda)")
    .or(`codigo_propiedad.ilike.%${plain}%,unaccent(colonia).ilike.%${plain}%,unaccent(municipio).ilike.%${plain}%`)
    .is("deleted_at", null)
    .limit(20);

  if (blockedUserIds.length > 0) {
    query = query.not("created_by", "in", `(${blockedUserIds.join(",")})`);
  }

  const { data } = await query;

  return (data ?? []).map((p) => {
    const op = Array.isArray(p.operaciones_propiedad) ? p.operaciones_propiedad[0] : null;
    return {
      id: p.id,
      codigo_propiedad: p.codigo_propiedad,
      fotos: p.fotos ?? null,
      precio: op?.precio ?? null,
      moneda: op?.moneda ?? null,
      colonia: p.colonia ?? null,
      municipio: p.municipio ?? null,
      estado: p.estado ?? null,
      habitaciones: p.habitaciones ?? null,
      banos: p.banos ?? null,
      metros_cuadrados_construccion: p.metros_cuadrados_construccion ?? null,
      metros_cuadrados_terreno: p.metros_cuadrados_terreno ?? null,
    };
  });
}

export function useSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const { profile, user } = useAuth();
  const { searchLocations, suggestions, isLoading: locLoading } = useLocationSearchStore();
  const { clearFilters, setPendingOpenMap } = usePropertyFiltersStore();
  const { setSelectedLocation } = useApp();

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults(EMPTY_RESULTS);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const blockedUserIds = await blockService.getBlockedUserIds(user?.id);
        const [users, posts, reels, properties] = await Promise.all([
          fetchUsers(trimmed, blockedUserIds),
          fetchPosts(trimmed, blockedUserIds),
          fetchReels(trimmed, blockedUserIds),
          fetchProperties(trimmed, blockedUserIds),
        ]);
        if (!mountedRef.current) return;
        searchLocations(trimmed, undefined, {
          restrictToRegions: false,
          withCounts: false,
          estado: profile?.estado,
        });
        if (!mountedRef.current) return;
        setResults({ users, posts, reels, locations: [], properties });
      } catch (err) {
        log.warn("Error en búsqueda:", err);
        if (mountedRef.current) setResults(EMPTY_RESULTS);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, profile?.estado, user?.id]);

  // Sync location suggestions from store into results
  useEffect(() => {
    const locations: SearchLocation[] = suggestions.map((s, i) => ({
      id: `${s.type}-${i}`,
      // `name` queda solo con la zona (se usa al seleccionar); la fila muestra
      // `fullDescription` completa separada por comas, estilo Google.
      name: s.name,
      count: s.propertyCount ?? 0,
      type: s.type,
      municipio: s.municipio_nombre,
      estado: s.estado_nombre,
      estadoId: s.estado_id,
      fullDescription: s.fullDescription,
      placeId: s.placeId,
    }));
    setResults((prev) => ({ ...prev, locations }));
  }, [suggestions]);

  const selectLocation = useCallback(
    (loc: SearchLocation) => {
      const baseName = loc.name.split(",")[0].trim();
      clearFilters({ estado: "", ciudad: "", municipio: "", colonia: "" });
      setSelectedLocation({
        type: loc.type ?? "colonia",
        name: baseName,
        estado_id: loc.estadoId ?? 0,
        municipio_nombre: loc.municipio,
        estado_nombre: loc.estado,
        // El placeId centra el mapa en el lugar EXACTO (vía Place Details),
        // evitando que se geocodifique otra zona con el mismo nombre.
        placeId: loc.placeId,
      });
      setPendingOpenMap(true);
    },
    [clearFilters, setSelectedLocation, setPendingOpenMap],
  );

  const navigateToUser = useCallback((userId: string) => {
    router.push(`/(stack)/user/${userId}`);
  }, []);

  const navigateToPost = useCallback((feedItemId: string) => {
    router.push(`/(stack)/post/${feedItemId}`);
  }, []);

  const navigateToReel = useCallback((feedItemId: string) => {
    router.push(`/(stack)/reel/${feedItemId}`);
  }, []);

  const navigateToProperty = useCallback((propertyId: string) => {
    router.push(`/(stack)/property/${propertyId}`);
  }, []);

  return {
    query,
    setQuery,
    loading: loading || locLoading,
    results,
    selectLocation,
    navigateToUser,
    navigateToPost,
    navigateToReel,
    navigateToProperty,
  };
}