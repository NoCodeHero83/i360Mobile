/**
 * geocodingService.ts
 * Servicio centralizado para todas las llamadas a Google Maps APIs:
 *  - Places Autocomplete (búsqueda de zonas)
 *  - Place Details (obtener bounds de un lugar)
 *  - Geocoding / Reverse Geocoding (dirección ↔ lat/lng)
 *
 * Parametrizado por país a través de la capa `./location` (default: México).
 */

import {
  getCountryConfig,
  detectCountryFromPlace,
} from "./location/registry";
import type { CountryCode, GoogleAddressComponent } from "./location/types";

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const BASE_AUTOCOMPLETE = "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const BASE_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";
const BASE_GEOCODING = "https://maps.googleapis.com/maps/api/geocode/json";

/** Bounding box geográfica (norte/sur/este/oeste en decimal degrees) */
export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Resultado crudo de un ítem de autocompletado */
export interface PlaceSuggestion {
  placeId: string;
  description: string;         // Descripción completa: "Polanco, Miguel Hidalgo, CDMX, México"
  mainText: string;            // Parte principal: "Polanco"
  secondaryText: string;       // Contexto: "Miguel Hidalgo, CDMX, México"
  types: string[];             // Tipos de Google: ["sublocality","political",...]
}

/** Detalles completos de un lugar incluyendo geometría */
export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  bounds?: GeoBounds;          // Bounds precisos del lugar (polygon bounds o viewport)
}

/** Componentes de dirección parseados */
export interface AddressComponents {
  estado: string;
  municipio: string;
  ciudad: string;
  colonia: string;
  pais: string;
  codigoPostal?: string;
}

// ---------------------------------------------------------------------------
// Derivar tipo de lugar a partir de los types de Google
// ---------------------------------------------------------------------------
export function derivePlaceType(
  types: string[],
): "estado" | "municipio" | "colonia" {
  if (types.includes("administrative_area_level_1")) return "estado";
  if (
    types.includes("locality") ||
    types.includes("administrative_area_level_2") ||
    types.includes("administrative_area_level_3")
  )
    return "municipio";
  return "colonia";
}

// ---------------------------------------------------------------------------
// Validar que un punto (PIN) caiga dentro del área de un lugar
// ---------------------------------------------------------------------------

/**
 * Indica si el PIN (lat/lng) cae dentro de los `bounds` del lugar elegido,
 * expandidos con un buffer de tolerancia. Espeja la lógica de matching del
 * servidor (`punto_en_area_busqueda`): si el PIN entra aquí, una búsqueda de
 * esa misma zona encontrará la propiedad.
 *
 * El buffer evita falsos positivos cuando Google entrega un área pequeña
 * (típico de colonias): un PIN al borde de la colonia sigue siendo válido.
 *
 * @returns `true` también cuando no hay bounds (no se puede validar ⇒ no se bloquea).
 */
export function pinDentroDeZona(
  lat: number | null | undefined,
  lng: number | null | undefined,
  bounds: GeoBounds | null | undefined,
): boolean {
  // Sin coordenadas o sin área de referencia: no validamos (no bloquear).
  if (lat == null || lng == null) return true;
  if (!bounds) return true;

  const { north, south, east, west } = bounds;
  if ([north, south, east, west].some((v) => typeof v !== "number")) return true;

  // Buffer por eje: el mayor entre el 50% del tamaño del área y ~0.02° (≈ 2 km).
  // Áreas chicas (colonias) ⇒ domina el mínimo; áreas grandes (estado) ⇒ el factor.
  const MIN_PAD = 0.02;
  const latPad = Math.max((north - south) * 0.5, MIN_PAD);
  const lngPad = Math.max((east - west) * 0.5, MIN_PAD);

  return (
    lat >= south - latPad &&
    lat <= north + latPad &&
    lng >= west - lngPad &&
    lng <= east + lngPad
  );
}

// ---------------------------------------------------------------------------
// Places Autocomplete
// ---------------------------------------------------------------------------

/**
 * Busca sugerencias de lugares usando la Places Autocomplete API, acotado al país.
 * @param query   Texto de búsqueda (ej. "Polanco", "Guadalajara")
 * @param token   Session token opcional para agrupar llamadas y reducir costos
 * @param country País al que acotar la búsqueda (default: México)
 * @param types   Filtro de tipos de Places (ej. "(regions)" para acotar a zonas
 *                geográficas y excluir negocios/POIs y calles sueltas). Si se omite,
 *                la API devuelve todo tipo de lugares (direcciones, negocios, zonas).
 */
export async function searchPlaces(
  query: string,
  token?: string,
  country?: CountryCode | string | null,
  types?: string,
  location?: { lat: number; lng: number },
  radius?: number,
): Promise<PlaceSuggestion[]> {
  if (!GOOGLE_API_KEY || !query.trim()) return [];
  try {
    const config = getCountryConfig(country);
    const params = new URLSearchParams({
      input: query,
      components: config.placesComponents,
      language: "es",
      key: GOOGLE_API_KEY,
      ...(token ? { sessiontoken: token } : {}),
      ...(types ? { types } : {}),
      ...(location ? { location: `${location.lat},${location.lng}` } : {}),
      ...(radius ? { radius: String(radius) } : {}),
    });
    const res = await fetch(`${BASE_AUTOCOMPLETE}?${params}`);
    const json = await res.json();
    if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
      console.warn("[geocodingService] Autocomplete error:", json.status, json.error_message);
    }
    return (json.predictions ?? []).map((p: any) => ({
      placeId: p.place_id,
      description: p.description,
      mainText: p.structured_formatting?.main_text ?? p.description,
      secondaryText: p.structured_formatting?.secondary_text ?? "",
      types: p.types ?? [],
    }));
  } catch (e) {
    console.warn("[geocodingService] searchPlaces error:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Place Details (bounds + dirección completa)
// ---------------------------------------------------------------------------

/**
 * Obtiene los detalles de un lugar por su placeId, incluyendo bounds geográficos.
 * @param placeId  ID de Google Places
 * @param token    Session token (mismo que el usado en searchPlaces)
 */
export async function getPlaceDetails(
  placeId: string,
  token?: string,
): Promise<PlaceDetails | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const params = new URLSearchParams({
      place_id: placeId,
      fields: "geometry,name,formatted_address,address_components",
      language: "es",
      key: GOOGLE_API_KEY,
      ...(token ? { sessiontoken: token } : {}),
    });
    const res = await fetch(`${BASE_DETAILS}?${params}`);
    const json = await res.json();
    if (json.status !== "OK") {
      console.warn("[geocodingService] Place Details error:", json.status);
      return null;
    }
    const result = json.result;
    const geo = result.geometry;
    const rawBounds = geo.bounds ?? geo.viewport;
    const bounds: GeoBounds | undefined = rawBounds
      ? {
          north: rawBounds.northeast.lat,
          south: rawBounds.southwest.lat,
          east: rawBounds.northeast.lng,
          west: rawBounds.southwest.lng,
        }
      : undefined;
    return {
      placeId,
      name: result.name ?? "",
      formattedAddress: result.formatted_address ?? "",
      location: { lat: geo.location.lat, lng: geo.location.lng },
      bounds,
    };
  } catch (e) {
    console.warn("[geocodingService] getPlaceDetails error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reverse Geocoding (coordenadas → componentes de dirección)
// ---------------------------------------------------------------------------

/**
 * Convierte coordenadas lat/lng en componentes de dirección (estado, municipio, colonia).
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
  country?: CountryCode | string | null,
): Promise<{
  components: AddressComponents;
  formattedAddress: string;
  country: CountryCode;
} | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const config = getCountryConfig(country);
    const params = new URLSearchParams({
      latlng: `${lat},${lng}`,
      language: "es",
      region: config.region,
      key: GOOGLE_API_KEY,
    });
    const res = await fetch(`${BASE_GEOCODING}?${params}`);
    const json = await res.json();
    if (json.status !== "OK" || !json.results?.length) return null;
    const result = json.results[0];
    const comps = (result.address_components ?? []) as GoogleAddressComponent[];
    // Si no se especifica país, detectarlo de los propios componentes devueltos.
    const cc = detectCountryFromPlace(comps);
    return {
      components: parseAddressComponents(comps, country ?? cc),
      formattedAddress: result.formatted_address ?? "",
      country: cc,
    };
  } catch (e) {
    console.warn("[geocodingService] reverseGeocode error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Geocoding (dirección → coordenadas + bounds)
// ---------------------------------------------------------------------------

/**
 * Geocodifica un nombre de lugar y retorna su geometría (center + bounds).
 * Ya existe lógica similar en MapSearch.tsx — esta función la centraliza.
 */
export async function geocodeAddress(
  address: string,
  country?: CountryCode | string | null,
): Promise<{
  location: { lat: number; lng: number };
  bounds?: GeoBounds;
} | null> {
  if (!GOOGLE_API_KEY) return null;
  try {
    const config = getCountryConfig(country);
    const params = new URLSearchParams({
      address: `${address}, ${config.name}`,
      region: config.region,
      language: "es",
      key: GOOGLE_API_KEY,
    });
    const res = await fetch(`${BASE_GEOCODING}?${params}`);
    const json = await res.json();
    if (json.status !== "OK" || !json.results?.length) return null;
    const geo = json.results[0].geometry;
    const rawBounds = geo.bounds ?? geo.viewport;
    return {
      location: { lat: geo.location.lat, lng: geo.location.lng },
      bounds: rawBounds
        ? {
            north: rawBounds.northeast.lat,
            south: rawBounds.southwest.lat,
            east: rawBounds.northeast.lng,
            west: rawBounds.southwest.lng,
          }
        : undefined,
    };
  } catch (e) {
    console.warn("[geocodingService] geocodeAddress error:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parseo de address_components de Google
// ---------------------------------------------------------------------------

/**
 * Parsea el array de address_components de Google en un objeto estructurado,
 * usando el mapeo de niveles administrativos del país indicado (default: México).
 */
export function parseAddressComponents(
  components: Array<{ types: string[]; long_name: string; short_name: string }>,
  country?: CountryCode | string | null,
): AddressComponents {
  const config = getCountryConfig(country);
  const mapped = config.mapGoogleComponents(components as GoogleAddressComponent[]);

  const countryComp = components.find((c) => c.types.includes("country"));
  const pais = countryComp?.long_name ?? config.name;

  return {
    estado: mapped.level1,
    municipio: mapped.level2,
    ciudad: mapped.city ?? "",
    colonia: mapped.level3,
    pais,
    codigoPostal: mapped.postalCode ?? "",
  };
}

// ---------------------------------------------------------------------------
// Calcular focusRegion para react-native-maps a partir de GeoBounds
// ---------------------------------------------------------------------------

/**
 * Convierte GeoBounds en un objeto { latitude, longitude, latitudeDelta, longitudeDelta }
 * listo para usar como region de react-native-maps.
 * @param bounds  Bounding box del lugar
 * @param type    Tipo de lugar (ajusta los deltas mínimos)
 */
export function boundsToRegion(
  bounds: GeoBounds,
  type: "estado" | "municipio" | "colonia" | string = "colonia",
): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  const latSpan = Math.abs(bounds.north - bounds.south);
  const lngSpan = Math.abs(bounds.east - bounds.west);

  const MIN_DELTA = type === "estado" ? 0.03 : type === "municipio" ? 0.04 : 0.02;
  const MAX_DELTA = type === "estado" ? 3.0 : type === "municipio" ? 0.5 : 0.1;

  const latitudeDelta = Math.min(
    Math.max(latSpan * 1.4 || MIN_DELTA, MIN_DELTA),
    MAX_DELTA,
  );
  const longitudeDelta = Math.min(
    Math.max(lngSpan * 1.4 || MIN_DELTA, MIN_DELTA),
    MAX_DELTA,
  );

  return {
    latitude: (bounds.north + bounds.south) / 2,
    longitude: (bounds.east + bounds.west) / 2,
    latitudeDelta,
    longitudeDelta,
  };
}
