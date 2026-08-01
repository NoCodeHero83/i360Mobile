/**
 * src/lib/location/types.ts
 *
 * Modelo neutral de ubicación, agnóstico al país.
 *
 * Las columnas físicas de la BD (estado/municipio/colonia/ciudad) se conservan,
 * pero se REINTERPRETAN como niveles administrativos genéricos (level1/2/3)
 * a través de la configuración de cada país (ver ./countries/*).
 *
 *   level1 → división mayor    (MX: estado    · US: state)
 *   level2 → división media    (MX: municipio · US: county)
 *   level3 → división menor    (MX: colonia   · US: neighborhood)
 */

/** Código ISO-3166-1 alpha-2 en mayúsculas. */
export type CountryCode = "MX" | "US";

/** Componente de dirección crudo de Google (`address_components`). */
export interface GoogleAddressComponent {
  types: string[];
  long_name: string;
  short_name: string;
}

/** Etiquetas de UI para cada nivel administrativo, según el país. */
export interface LevelLabels {
  level1: string; // "Estado" / "State"
  level2: string; // "Municipio" / "County"
  level3: string; // "Colonia" / "Neighborhood"
}

/** Coordenada simple. */
export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Valor de ubicación neutral. Es el modelo con el que habla el código nuevo;
 * los adaptadores lo traducen a/desde las columnas físicas y a/desde Google.
 */
export interface LocationValue {
  country: CountryCode;
  level1: string; // estado / state
  level2: string; // municipio / county
  level3: string; // colonia / neighborhood
  city?: string;
  street?: string;
  number?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
}

/** Resultado del mapeo de address_components (sin país ni coordenadas). */
export type MappedComponents = Pick<
  LocationValue,
  "level1" | "level2" | "level3" | "city" | "postalCode"
>;

/**
 * Configuración de un país. Cada país soportado aporta una de estas;
 * concentra TODO lo que hoy está hardcodeado a México.
 */
export interface CountryConfig {
  /** Código ISO alpha-2 (mayúsculas). */
  code: CountryCode;
  /** Nombre legible del país. */
  name: string;
  /** Valor para el parámetro `components` de Places Autocomplete (ej. "country:mx"). */
  placesComponents: string;
  /** Region bias para la Geocoding API (ej. "mx"). */
  region: string;
  /** Sufijos del país que Google añade al final del texto, a remover al parsear. */
  countrySuffixes: string[];
  /** Etiquetas de UI por nivel. */
  labels: LevelLabels;
  /** Centro aproximado del país (fallback de centrado de mapa). */
  center: LatLng;
  /** Divisiones de nivel 1 (estados/provincias) para selectores. */
  level1Options: readonly string[];
  /** Coordenadas centrales por división de nivel 1 (fallback de mapa). */
  level1Coords: Record<string, LatLng>;
  /** Normaliza el nombre de una división de nivel 1 a su forma canónica. */
  normalizeLevel1: (name: string) => string;
  /**
   * Abreviaturas que Google usa para el nivel 1 en `secondary_text` de Places
   * Autocomplete (ej. MX: "Ags." → "Aguascalientes"), típicamente cuando el
   * nivel 1 y el nivel 2 comparten nombre y Google agrega la abreviatura para
   * desambiguar. Clave en minúsculas sin acentos. Opcional por país.
   */
  stateAbbreviations?: Record<string, string>;
  /** Mapea address_components de Google a los niveles neutrales. */
  mapGoogleComponents: (components: GoogleAddressComponent[]) => MappedComponents;
}
