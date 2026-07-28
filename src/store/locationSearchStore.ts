/**
 * locationSearchStore.ts
 * Store Zustand para la búsqueda de zonas geográficas en el mapa.
 * Usa Google Places Autocomplete via locationService.
 */

import { create } from "zustand";
import {
  searchLocations,
  type LocationSuggestion,
} from "../lib/locationService";
import { getCountryConfig, DEFAULT_COUNTRY } from "../lib/location/registry";
import type { CountryCode } from "../lib/location/types";
import { supabase } from "../lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("locationSearchStore");

/** Sugerencia de ubicación enriquecida para mostrar en la UI */
export interface LocationSuggestionWithCount extends LocationSuggestion {
  /** Conteo de propiedades (no calculado en la nueva versión) */
  propertyCount?: number;
  /**
   * Compatibilidad con UI de HomeHeader / useSearch que leen estas propiedades.
   * Se derivan del secondaryText de Google Places.
   */
  municipio_nombre?: string;
  estado_nombre?: string;
  /**
   * @deprecated Era el ID en Supabase Geo. Se mantiene como 0 para compat.
   */
  estado_id?: number;
}

interface LocationSearchState {
  suggestions: LocationSuggestionWithCount[];
  isLoading: boolean;
  /** Token de sesión para agrupar requests de Places API y reducir costos */
  sessionToken: string;
  searchLocations: (
    searchTerm: string,
    country?: CountryCode,
    opts?: { restrictToRegions?: boolean; withCounts?: boolean; estado?: string },
  ) => Promise<void>;
  clearSuggestions: () => void;
  refreshSessionToken: () => void;
}

function generateToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Parsea el texto secundario de Google para extraer los dos niveles superiores
 * (nivel 2 = municipio, nivel 1 = estado) para la UI, según el país.
 */
function extractMunicipioEstado(
  suggestion: LocationSuggestion,
  country: CountryCode = DEFAULT_COUNTRY,
): {
  municipio_nombre?: string;
  estado_nombre?: string;
} {
  // secondaryText puede tener un número variable de segmentos, p. ej.:
  //   "Miguel Hidalgo, Ciudad de México, México"            → [municipio, estado]
  //   "Polanco, Miguel Hidalgo, Ciudad de México, México"   → [colonia, municipio, estado]
  //   "Jalisco, México"                                      → [estado]
  // Criterio robusto (igual que el fallback de CascadeLocationSelector):
  // el estado es SIEMPRE el último componente y el municipio el penúltimo.
  const config = getCountryConfig(country);
  let secondary = suggestion.secondaryText.trim();
  // Quitar el sufijo del país al final (", México", ", Mexico", ...).
  for (const suffix of config.countrySuffixes) {
    secondary = secondary.replace(
      new RegExp(`,\\s*${suffix}\\s*$`, "i"),
      "",
    );
  }
  const parts = secondary
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) return {};

  // Para un nivel 1 (estado), el `name` ya es ese nivel: no se necesita subtítulo.
  if (suggestion.type === "estado") return {};

  const estado_nombre = parts[parts.length - 1];

  if (suggestion.type === "municipio") {
    const municipio_nombre =
      parts.length >= 2 ? parts[parts.length - 2] : undefined;
    return { municipio_nombre, estado_nombre };
  }

  // colonia (nivel 3)
  const municipio_nombre =
    parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return { municipio_nombre, estado_nombre };
}

export const useLocationSearchStore = create<LocationSearchState>((set, get) => ({
  suggestions: [],
  isLoading: false,
  sessionToken: generateToken(),

  clearSuggestions: () => set({ suggestions: [] }),

  refreshSessionToken: () => set({ sessionToken: generateToken() }),

  searchLocations: async (
    searchTerm: string,
    country: CountryCode = DEFAULT_COUNTRY,
    opts?: { restrictToRegions?: boolean; withCounts?: boolean; estado?: string },
  ) => {
    if (!searchTerm.trim()) {
      set({ suggestions: [] });
      return;
    }

    set({ isLoading: true });

    // El buscador general pide `restrictToRegions: false` para encontrar todo
    // (fraccionamientos, POIs…), igual que el buscador de los posts de búsqueda.
    // El buscador del mapa usa el default ("(regions)") y conserva su contador.
    const types = opts?.restrictToRegions === false ? undefined : "(regions)";
    const withCounts = opts?.withCounts !== false;

    // Location bias: si el caller proporciona el estado del usuario, resolver sus
    // coordenadas centrales para sesgar los resultados de Google Places hacia esa zona.
    const config = getCountryConfig(country);
    const biasCoords = opts?.estado ? config.level1Coords[opts.estado] : undefined;

    try {
      const { sessionToken } = get();
      const results = await searchLocations(
        searchTerm, 10, sessionToken, country, types,
        biasCoords ?? undefined,
        biasCoords ? 100000 : undefined,
      );

      const enriched: LocationSuggestionWithCount[] = results.map((loc) => ({
        ...loc,
        ...extractMunicipioEstado(loc, country),
      }));

      // Re-rank + fallback geográfico:
      // 1) Google Places bias (location+radius) es insuficiente: ciudades grandes
      //    de otros estados aparecen primero. El re-rank sube resultados locales.
      // 2) Fallback: si hay menos de 2 sugerencias del estado del usuario, Google
      //    no incluyó resultados locales menos prominentes (ej. "San Nicolás Premier").
      //    Se hace una segunda búsqueda con "{query}, {estado}" y se fusionan.
      const userEstado = opts?.estado;
      let combined = enriched;
      if (userEstado) {
        const localCount = enriched.filter(
          (s) => s.estado_nombre?.toLowerCase() === userEstado.toLowerCase(),
        ).length;
        if (localCount < 2) {
          const fallbackSearchTerm = `${searchTerm}, ${userEstado}`;
          const fallbackResults = await searchLocations(
            fallbackSearchTerm, 5, sessionToken, country, "(regions)",
          );
          const fallbackEnriched = fallbackResults.map((loc) => ({
            ...loc,
            ...extractMunicipioEstado(loc, country),
          }));
          const firstIds = new Set(enriched.map((s) => s.placeId));
          const nonDuplicated = fallbackEnriched.filter((s) => !firstIds.has(s.placeId));
          combined = [...enriched, ...nonDuplicated];
        }
      }
      const ranked = userEstado
        ? [
            ...combined.filter(
              (s) => s.estado_nombre?.toLowerCase() === userEstado.toLowerCase(),
            ),
            ...combined.filter(
              (s) => s.estado_nombre?.toLowerCase() !== userEstado.toLowerCase(),
            ),
          ]
        : combined;

      // Mostrar las sugerencias de inmediato (y quitar el spinner); el conteo
      // se rellena después sin bloquear la UI.
      set({ suggestions: ranked, isLoading: false });

      // Conteo de propiedades por zona (diferido, no bloquea la UI).
      // Se cuenta usando la JERARQUÍA de la sugerencia (nombre + municipio +
      // estado) para evitar falsos positivos por nombres repetidos en distintas
      // regiones (p. ej. "Centro" existe en muchas ciudades).
      // Se omite si el caller no muestra el conteo (p. ej. buscador general).
      if (withCounts && ranked.length > 0) {
        const keyOf = (
          tipo?: string | null,
          nombre?: string | null,
          municipio?: string | null,
          estado?: string | null,
        ) => `${tipo ?? ""}|${nombre ?? ""}|${municipio ?? ""}|${estado ?? ""}`;
        try {
          const zonas = ranked.map((s) => ({
            tipo: s.type,
            nombre: s.name,
            municipio: s.municipio_nombre ?? null,
            estado: s.estado_nombre ?? null,
          }));
          const { data: counts } = await supabase.rpc(
            "contar_propiedades_zonas",
            { p_zonas: zonas, p_pais: country },
          );
          if (Array.isArray(counts) && counts.length > 0) {
            const countMap = new Map<string, number>(
              counts.map((c: {
                tipo: string;
                nombre: string;
                municipio: string | null;
                estado: string | null;
                total: number;
              }) => [keyOf(c.tipo, c.nombre, c.municipio, c.estado), Number(c.total) || 0]),
            );
            // Emparejar por (tipo, nombre, municipio, estado); seguro ante concurrencia.
            set((state) => ({
              suggestions: state.suggestions.map((s) => {
                const total = countMap.get(
                  keyOf(s.type, s.name, s.municipio_nombre, s.estado_nombre),
                );
                return total != null ? { ...s, propertyCount: total } : s;
              }),
            }));
          }
        } catch (e) {
          log.warn("Error contando propiedades por zona:", e);
        }
      }
    } catch (error) {
      log.error("Error fetching location suggestions:", error);
      set({ suggestions: [] });
    } finally {
      set({ isLoading: false });
    }
  },
}));
