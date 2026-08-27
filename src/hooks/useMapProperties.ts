import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { Property, PropertyType, GeoBounds } from "@/types";
import { blockService } from "@/services/blockService";

/**
 * Filtros que se pueden aplicar directamente en Supabase.
 * La ubicación ahora se filtra por bounds geográficos (lat/lng BETWEEN)
 * en lugar de strings ilike, gracias a la migración a Google Places API.
 */
export interface MapServerFilters {
  tipoPropiedad?: string;
  subtipo?: string[];
  /**
   * Bounds geográficos para filtrar propiedades por área.
   * Tiene precedencia sobre estado/municipio/colonia.
   */
  bounds?: GeoBounds;
  /**
   * @deprecated Usar bounds cuando sea posible.
   * Se mantiene como fallback para el locationFilter base (texto libre).
   */
  estado?: string;
  municipio?: string;
  colonia?: string;
  habitacionesMin?: number;
  banosMin?: number;
  estacionamientosMin?: number;
  m2ConstruccionMin?: number;
  m2TerrenoMin?: number;
  anchoTerrenoMin?: number;
  largoTerrenoMin?: number;
  // Comercial
  tipoUbicacion?: string;
  frenteMin?: number;
  sobreAvenidaPrincipal?: boolean;
  enEsquina?: boolean;
  altaVisibilidad?: boolean;
  altoFlujoVehicular?: boolean;
  // Industrial
  ubicacionIndustrial?: string;
  alturaLibre?: string;
  energiaKva?: string[];
  areaOficinasMin?: number;
  patioManiobrasMin?: number;
  // Agrícola
  tiposAgua?: string[];
  concesionAgua?: boolean;
  usoTerreno?: string;
  tipoRiego?: string;
  infraElectricidad?: boolean;
  infraCaminoAcceso?: boolean;
  infraCercado?: boolean;
  accesoCarretera?: boolean;
  accesoCamiones?: boolean;
}

interface SupabaseOperacion {
  precio: number | null;
  moneda: string | null;
  tipo_operacion: string | null;
  comision_tipo?: string | null;
  comision_porcentaje?: number | null;
  comparte_comision?: boolean | null;
  porcentaje_comision_compartida?: number | null;
  comision_meses?: number | null;
}

interface SupabaseProperty {
  id: string;
  tipo: string | null;
  subtipo: string | null;
  municipio: string | null;
  descripcion: string | null;
  estado: string | null;
  ciudad: string | null;
  colonia: string | null;
  calle: string | null;
  numero_exterior: string | null;
  /** Tipo numeric en la BD — Supabase retorna number */
  latitud: number | null;
  /** Tipo numeric en la BD — Supabase retorna number */
  longitud: number | null;
  fotos: string[] | null;
  habitaciones: number | null;
  banos: number | null;
  medios_banos: number | null;
  metros_cuadrados_construccion: number | null;
  metros_cuadrados_terreno: number | null;
  ancho_terreno: number | null;
  largo_terreno: number | null;
  /** Relación embebida: propiedad_amenidades → catalogo_amenidades(nombre). */
  amenidades: { amenidad: { nombre: string } | null }[] | null;
  activo: boolean | null;
  deleted_at: string | null;
  operaciones_propiedad: SupabaseOperacion[] | null;
  created_by?: string | null;
  pais: string | null;
  status: string | null;
  antiguedad: number | null;
  pisos: number | null;
  estacionamientos: number | null;
  // Comercial
  tipo_ubicacion_comercial: string | null;
  frente_metros: number | null;
  nivel_piso: number | null;
  sobre_avenida_principal: boolean | null;
  en_esquina: boolean | null;
  alta_visibilidad: boolean | null;
  alto_flujo_vehicular: boolean | null;
  // Industrial
  ubicacion_industrial: string | null;
  altura_libre_m: string | null;
  tipo_energia_kva: string[] | null;
  area_oficinas_m2: number | null;
  patio_maniobras_m2: number | null;
  // Agrícola
  tipo_agua: string[] | null;
  concesion_agua: boolean | null;
  uso_terreno: string[] | null;
  tipo_riego: string[] | null;
  infra_electricidad: boolean | null;
  infra_camino_acceso: boolean | null;
  infra_cercado: boolean | null;
  acceso_carretera: boolean | null;
  acceso_camiones: boolean | null;
  [key: string]: unknown;
}

function mapProperty(p: SupabaseProperty): Property {
  const operacion = p.operaciones_propiedad?.[0];
  return {
    ...p,
    id: p.id,
    title: `${p.subtipo} en ${p.municipio}`,
    description: p.descripcion ?? undefined,
    price: operacion?.precio || 0,
    currency: (operacion?.moneda || "MXN") as "MXN" | "USD",
    location: {
      address: `${p.calle ?? ""} ${p.numero_exterior ?? ""}`.trim(),
      country: "México",
      state: p.estado || "",
      city: p.ciudad || "",
      colony: p.colonia || "",
      municipio: p.municipio || "",
    },
    coordinates:
      p.latitud != null && p.longitud != null
        ? { lat: Number(p.latitud), lng: Number(p.longitud) }
        : undefined,
    // Mantener campos directos para compatibilidad con PropertyCard / filters
    latitud: p.latitud != null ? Number(p.latitud) : undefined,
    longitud: p.longitud != null ? Number(p.longitud) : undefined,
    images: p.fotos || [],
    features: {
      beds: p.habitaciones || 0,
      baths: p.banos || 0,
      halfBaths: p.medios_banos || 0,
      parking: p.estacionamientos || 0,
      constructionSqft: p.metros_cuadrados_construccion || 0,
      landSqft: p.metros_cuadrados_terreno || 0,
      floors: p.pisos || undefined,
    },
    amenities: (p.amenidades ?? [])
      .map((a) => a.amenidad?.nombre)
      .filter((n): n is string => !!n),
    type: (p.tipo || "habitacional").toLowerCase() as PropertyType,
    subtype: (p.subtipo || "").toLowerCase(),
    operation: operacion?.tipo_operacion === "venta" ? "Sale" : "Rent",
    status: "Publicada",
    operations: p.operaciones_propiedad ?? undefined,
  } as Property;
}

function hasActiveServerFilters(f: MapServerFilters): boolean {
  return !!(
    f.tipoPropiedad ||
    (f.subtipo && f.subtipo.length > 0) ||
    f.bounds ||
    f.estado ||
    f.municipio ||
    f.colonia ||
    (f.habitacionesMin && f.habitacionesMin > 0) ||
    (f.banosMin && f.banosMin > 0) ||
    (f.estacionamientosMin && f.estacionamientosMin > 0) ||
    (f.m2ConstruccionMin && f.m2ConstruccionMin > 0) ||
    (f.m2TerrenoMin && f.m2TerrenoMin > 0) ||
    (f.anchoTerrenoMin && f.anchoTerrenoMin > 0) ||
    (f.largoTerrenoMin && f.largoTerrenoMin > 0) ||
    f.tipoUbicacion ||
    (f.frenteMin && f.frenteMin > 0) ||
    f.sobreAvenidaPrincipal ||
    f.enEsquina ||
    f.altaVisibilidad ||
    f.altoFlujoVehicular ||
    f.ubicacionIndustrial ||
    f.alturaLibre ||
    (f.energiaKva && f.energiaKva.length > 0) ||
    (f.areaOficinasMin && f.areaOficinasMin > 0) ||
    (f.patioManiobrasMin && f.patioManiobrasMin > 0) ||
    (f.tiposAgua && f.tiposAgua.length > 0) ||
    f.concesionAgua ||
    f.usoTerreno ||
    f.tipoRiego ||
    f.infraElectricidad ||
    f.infraCaminoAcceso ||
    f.infraCercado ||
    f.accesoCarretera ||
    f.accesoCamiones
  );
}

async function fetchMapProperties(
  serverFilters?: MapServerFilters,
  currentUserId?: string,
): Promise<Property[]> {
  const active = serverFilters ? hasActiveServerFilters(serverFilters) : false;
  const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);

  let query = supabase
    .from("propiedades")
    .select(
      `*, operaciones_propiedad (*), amenidades:propiedad_amenidades(amenidad:catalogo_amenidades(nombre))`,
    );

  // Las propiedades sin comisión se guardan con activo=false y quedan ocultas a
  // todos. Excepción: su creador SÍ debe verlas en el mapa y el buscador.
  if (currentUserId) {
    query = query.or(
      `activo.eq.true,and(sin_comision.eq.true,created_by.eq.${currentUserId})`,
    );
  } else {
    query = query.eq("activo", true);
  }

  query = query.is("deleted_at", null);

  if (blockedUserIds.length > 0) {
    query = query.not("created_by", "in", `(${blockedUserIds.join(",")})`);
  }

  if (serverFilters && active) {
    // ── Tipo de propiedad ──
    if (serverFilters.tipoPropiedad) {
      query = query.ilike("tipo", serverFilters.tipoPropiedad);
    }
    // El subtipo NO se filtra aquí: `.in()` es case-sensitive y descarta datos con
    // distinta capitalización (p.ej. "Casa en condominio" vs "Casa en Condominio").
    // Se filtra en cliente (usePropertyFilters), que compara en minúsculas. El subtipo
    // sigue contando como filtro activo en hasActiveServerFilters.

    // ── Ubicación por bounds (prioridad) ──
    if (serverFilters.bounds) {
      const b = serverFilters.bounds;
      query = query
        .gte("latitud", b.south)
        .lte("latitud", b.north)
        .gte("longitud", b.west)
        .lte("longitud", b.east);
    } else {
      // Fallback: filtrado por strings (locationFilter base)
      if (serverFilters.estado) {
        query = query.ilike("estado", `%${serverFilters.estado}%`);
      }
      if (serverFilters.municipio) {
        query = query.ilike("municipio", `%${serverFilters.municipio}%`);
      }
      if (serverFilters.colonia) {
        query = query.ilike("colonia", `%${serverFilters.colonia}%`);
      }
    }

    // ── Características mínimas ──
    if (serverFilters.habitacionesMin && serverFilters.habitacionesMin > 0) {
      query = query.gte("habitaciones", serverFilters.habitacionesMin);
    }
    if (serverFilters.banosMin && serverFilters.banosMin > 0) {
      query = query.gte("banos", serverFilters.banosMin);
    }
    if (serverFilters.estacionamientosMin && serverFilters.estacionamientosMin > 0) {
      query = query.gte("estacionamientos", serverFilters.estacionamientosMin);
    }
    if (serverFilters.m2ConstruccionMin && serverFilters.m2ConstruccionMin > 0) {
      query = query.gte("metros_cuadrados_construccion", serverFilters.m2ConstruccionMin);
    }
    if (serverFilters.m2TerrenoMin && serverFilters.m2TerrenoMin > 0) {
      query = query.gte("metros_cuadrados_terreno", serverFilters.m2TerrenoMin);
    }
    if (serverFilters.anchoTerrenoMin && serverFilters.anchoTerrenoMin > 0) {
      query = query.gte("ancho_terreno", serverFilters.anchoTerrenoMin);
    }
    if (serverFilters.largoTerrenoMin && serverFilters.largoTerrenoMin > 0) {
      query = query.gte("largo_terreno", serverFilters.largoTerrenoMin);
    }

    // ── Comercial ──
    if (serverFilters.tipoUbicacion) {
      query = query.eq("tipo_ubicacion_comercial", serverFilters.tipoUbicacion);
    }
    if (serverFilters.frenteMin && serverFilters.frenteMin > 0) {
      query = query.gte("frente_metros", serverFilters.frenteMin);
    }
    if (serverFilters.sobreAvenidaPrincipal) query = query.eq("sobre_avenida_principal", true);
    if (serverFilters.enEsquina) query = query.eq("en_esquina", true);
    if (serverFilters.altaVisibilidad) query = query.eq("alta_visibilidad", true);
    if (serverFilters.altoFlujoVehicular) query = query.eq("alto_flujo_vehicular", true);

    // ── Industrial ──
    if (serverFilters.ubicacionIndustrial) {
      query = query.eq("ubicacion_industrial", serverFilters.ubicacionIndustrial);
    }
    if (serverFilters.alturaLibre) {
      query = query.eq("altura_libre_m", serverFilters.alturaLibre);
    }
    if (serverFilters.energiaKva && serverFilters.energiaKva.length > 0) {
      query = query.overlaps("tipo_energia_kva", serverFilters.energiaKva);
    }
    if (serverFilters.areaOficinasMin && serverFilters.areaOficinasMin > 0) {
      query = query.gte("area_oficinas_m2", serverFilters.areaOficinasMin);
    }
    if (serverFilters.patioManiobrasMin && serverFilters.patioManiobrasMin > 0) {
      query = query.gte("patio_maniobras_m2", serverFilters.patioManiobrasMin);
    }

    // ── Agrícola ──
    if (serverFilters.tiposAgua && serverFilters.tiposAgua.length > 0) {
      query = query.overlaps("tipo_agua", serverFilters.tiposAgua);
    }
    if (serverFilters.concesionAgua) query = query.eq("concesion_agua", true);
    if (serverFilters.usoTerreno) query = query.contains("uso_terreno", [serverFilters.usoTerreno]);
    if (serverFilters.tipoRiego) query = query.contains("tipo_riego", [serverFilters.tipoRiego]);
    if (serverFilters.infraElectricidad) query = query.eq("infra_electricidad", true);
    if (serverFilters.infraCaminoAcceso) query = query.eq("infra_camino_acceso", true);
    if (serverFilters.infraCercado) query = query.eq("infra_cercado", true);
    if (serverFilters.accesoCarretera) query = query.eq("acceso_carretera", true);
    if (serverFilters.accesoCamiones) query = query.eq("acceso_camiones", true);

    query = query.limit(3000);
  } else {
    // Sin filtros: 500 más recientes para rendimiento de browsing
    query = query.limit(500).order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as SupabaseProperty[]).map(mapProperty);
}

const BASE_KEY = "map-properties";

export function useMapProperties(serverFilters?: MapServerFilters) {
  const { user } = useAuth();
  const currentUserId = user?.id;

  const filterKey =
    serverFilters && hasActiveServerFilters(serverFilters)
      ? JSON.stringify(serverFilters)
      : "default";

  return useQuery({
    queryKey: [BASE_KEY, filterKey, currentUserId ?? "anon"],
    queryFn: () => fetchMapProperties(serverFilters, currentUserId),
    staleTime: filterKey === "default" ? 5 * 60 * 1000 : 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useInvalidateMapProperties() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [BASE_KEY] });
}