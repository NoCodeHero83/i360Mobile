/**
 * locationService.ts
 * Búsqueda de zonas geográficas via Google Places Autocomplete API.
 * Reemplaza la dependencia de Supabase Geo (search_locations_geo RPC).
 */

import {
  searchPlaces,
  getPlaceDetails,
  derivePlaceType,
  type GeoBounds,
} from "./geocodingService";
import type { CountryCode } from "./location/types";

export interface LocationSuggestion {
  placeId: string;
  name: string;             // Nombre principal (ej: "Polanco", "Guadalajara")
  secondaryText: string;    // Contexto (ej: "Miguel Hidalgo, CDMX")
  fullDescription: string;  // Descripción completa (ej: "Polanco, Miguel Hidalgo, CDMX, México")
  type: "estado" | "municipio" | "colonia";
}

/**
 * Busca ubicaciones que coincidan con un término de búsqueda.
 * Usa Google Places Autocomplete con restricción a México.
 *
 * @param searchTerm  Texto a buscar (ej. "Polanco", "Guadalajara", "Jalisco")
 * @param limit       Número máximo de resultados (default: 8)
 * @param sessionToken Token de sesión para agrupar llamadas de autocompletado
 * @param country     País al que acotar la búsqueda (default: México)
 * @param types       Filtro de tipos de Places (p. ej. "(regions)" para acotar a
 *                    zonas administrativas). Si se omite o es `undefined`, la API
 *                    devuelve TODO tipo de lugar (fraccionamientos, POIs, etc.),
 *                    útil para el buscador general. La decisión la toma el caller.
 *                    OJO: NO poner un valor por defecto aquí — un default haría que
 *                    el `undefined` explícito del store volviera a "(regions)"
 *                    (trampa del parámetro por defecto de JS).
 */
export async function searchLocations(
  searchTerm: string,
  limit: number = 8,
  sessionToken?: string,
  country?: CountryCode | string | null,
  types?: string,
  location?: { lat: number; lng: number },
  radius?: number,
): Promise<LocationSuggestion[]> {
  if (!searchTerm.trim()) return [];

  try {
    // "(regions)" acota a zonas geográficas (estado/municipio/colonia) y excluye
    // negocios/POIs y calles sueltas. Mejora la relevancia y hace que zonas reales
    // entren en las 5 predicciones que devuelve la API (límite de Autocomplete legacy).
    // Si `types` es undefined, la API devuelve todos los tipos (paridad con el
    // buscador de ubicaciones de los posts de búsqueda).
    const predictions = await searchPlaces(searchTerm, sessionToken, country, types, location, radius);
    return predictions.slice(0, limit).map((p) => ({
      placeId: p.placeId,
      name: p.mainText,
      secondaryText: p.secondaryText,
      fullDescription: p.description,
      type: derivePlaceType(p.types),
    }));
  } catch (e) {
    console.warn("[locationService] searchLocations error:", e);
    return [];
  }
}

/**
 * Obtiene los bounds geográficos de una sugerencia de lugar.
 * Llama a Place Details API con el placeId.
 *
 * @param placeId      ID de Google Places obtenido de searchLocations
 * @param sessionToken Token de sesión (debe coincidir con el de searchLocations)
 */
export async function getLocationBounds(
  placeId: string,
  sessionToken?: string,
): Promise<GeoBounds | null> {
  const details = await getPlaceDetails(placeId, sessionToken);
  return details?.bounds ?? null;
}

// Re-exportar GeoBounds para conveniencia
export type { GeoBounds };
