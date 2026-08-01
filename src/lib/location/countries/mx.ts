/**
 * src/lib/location/countries/mx.ts
 *
 * Configuración de México. Concentra todo lo que antes vivía repartido:
 *  - estadosMexico.ts (lista + coordenadas de estados)
 *  - STATE_NORMALIZATION de geocodingService
 *  - la lógica de parseAddressComponents (estructura administrativa mexicana)
 */

import type {
  CountryConfig,
  GoogleAddressComponent,
  LatLng,
  MappedComponents,
} from "../types";

/** Lista de los 32 estados de México (nombres usados en selectores de UI). */
export const ESTADOS_MX = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México (CDMX)",
  "Coahuila de Zaragoza",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán de Ocampo",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz de Ignacio de la Llave",
  "Yucatán",
  "Zacatecas",
] as const;

/** Coordenadas del centro aproximado de cada estado — fallback para centrar el mapa. */
export const COORDENADAS_ESTADO_MX: Record<string, LatLng> = {
  Aguascalientes: { lat: 21.8853, lng: -102.2916 },
  "Baja California": { lat: 30.8406, lng: -115.2838 },
  "Baja California Sur": { lat: 24.1426, lng: -110.3128 },
  Campeche: { lat: 19.8301, lng: -90.5349 },
  Chiapas: { lat: 16.7569, lng: -93.1292 },
  Chihuahua: { lat: 28.6329, lng: -106.0691 },
  "Ciudad de México (CDMX)": { lat: 19.4326, lng: -99.1332 },
  "Coahuila de Zaragoza": { lat: 27.0587, lng: -101.7068 },
  Colima: { lat: 19.2452, lng: -103.7241 },
  Durango: { lat: 24.5593, lng: -104.6588 },
  "Estado de México": { lat: 19.285, lng: -99.5496 },
  Guanajuato: { lat: 21.019, lng: -101.2574 },
  Guerrero: { lat: 17.4392, lng: -99.5451 },
  Hidalgo: { lat: 20.0911, lng: -98.7624 },
  Jalisco: { lat: 20.6597, lng: -103.3496 },
  "Michoacán de Ocampo": { lat: 19.5665, lng: -101.7068 },
  Morelos: { lat: 18.6813, lng: -99.1013 },
  Nayarit: { lat: 21.7514, lng: -104.8455 },
  "Nuevo León": { lat: 25.5922, lng: -99.9962 },
  Oaxaca: { lat: 17.0732, lng: -96.7266 },
  Puebla: { lat: 19.0414, lng: -98.2063 },
  Querétaro: { lat: 20.5888, lng: -100.3899 },
  "Quintana Roo": { lat: 19.1817, lng: -88.4791 },
  "San Luis Potosí": { lat: 22.1565, lng: -100.9855 },
  Sinaloa: { lat: 25.1721, lng: -107.4795 },
  Sonora: { lat: 29.2972, lng: -110.3309 },
  Tabasco: { lat: 17.8409, lng: -92.6189 },
  Tamaulipas: { lat: 24.2669, lng: -98.8363 },
  Tlaxcala: { lat: 19.3139, lng: -98.2404 },
  "Veracruz de Ignacio de la Llave": { lat: 19.1738, lng: -96.1342 },
  Yucatán: { lat: 20.7099, lng: -89.0943 },
  Zacatecas: { lat: 22.7709, lng: -102.5832 },
};

/**
 * Abreviaturas que Google agrega en `secondary_text` de Places Autocomplete
 * cuando el municipio comparte nombre con su estado (ej. "Aguascalientes,
 * Ags., México" en vez de "Aguascalientes, Aguascalientes, México") — Google
 * desambigua sustituyendo el estado por su abreviatura en vez de repetir el
 * nombre. Sin este mapeo, `extractMunicipioEstado` toma "Ags." como
 * `estado_nombre` literal y el re-rank geográfico lo descarta como "no local"
 * aunque sea exactamente el resultado que se busca.
 * Clave en minúsculas, sin punto final (se hace strip antes de comparar).
 */
export const ESTADO_ABREVIATURAS_MX: Record<string, string> = {
  ags: "Aguascalientes",
  bc: "Baja California",
  bcs: "Baja California Sur",
  camp: "Campeche",
  chis: "Chiapas",
  chih: "Chihuahua",
  cdmx: "Ciudad de México (CDMX)",
  df: "Ciudad de México (CDMX)",
  coah: "Coahuila de Zaragoza",
  col: "Colima",
  dgo: "Durango",
  "méx": "Estado de México",
  mex: "Estado de México",
  edomex: "Estado de México",
  gto: "Guanajuato",
  gro: "Guerrero",
  hgo: "Hidalgo",
  jal: "Jalisco",
  mich: "Michoacán de Ocampo",
  mor: "Morelos",
  nay: "Nayarit",
  nl: "Nuevo León",
  oax: "Oaxaca",
  pue: "Puebla",
  qro: "Querétaro",
  qroo: "Quintana Roo",
  qr: "Quintana Roo",
  slp: "San Luis Potosí",
  sin: "Sinaloa",
  son: "Sonora",
  tab: "Tabasco",
  tamps: "Tamaulipas",
  tlax: "Tlaxcala",
  ver: "Veracruz de Ignacio de la Llave",
  yuc: "Yucatán",
  zac: "Zacatecas",
};

/** Normalización de nombres de estado (Google → nomenclatura interna). */
const STATE_NORMALIZATION: Record<string, string> = {
  "Ciudad de México": "CDMX",
  "Mexico City": "CDMX",
  "Estado de México": "Estado de México",
  "State of Mexico": "Estado de México",
  "Nuevo León": "Nuevo León",
  "Nuevo Leon": "Nuevo León",
  Querétaro: "Querétaro",
  Queretaro: "Querétaro",
  Yucatán: "Yucatán",
  Yucatan: "Yucatán",
  Michoacán: "Michoacán",
  Michoacan: "Michoacán",
};

function normalizeLevel1(name: string): string {
  return STATE_NORMALIZATION[name] ?? name;
}

/**
 * Mapea address_components de Google a los niveles neutrales, con la estructura
 * administrativa de México (idéntico a la lógica histórica de parseAddressComponents):
 *  - level1 (estado)    = administrative_area_level_1 (normalizado)
 *  - city               = locality, o administrative_area_level_2 si no hay locality
 *  - level3 (colonia)   = sublocality_level_1 | sublocality | neighborhood
 *  - level2 (municipio) = city  (en México municipio ≈ ciudad)
 */
function mapGoogleComponents(
  components: GoogleAddressComponent[],
): MappedComponents {
  let estado = "";
  let ciudad = "";
  let colonia = "";
  let postalCode = "";

  for (const comp of components) {
    const t = comp.types;
    if (t.includes("administrative_area_level_1")) {
      estado = normalizeLevel1(comp.long_name);
    }
    if (t.includes("locality")) {
      ciudad = comp.long_name;
    }
    if (t.includes("administrative_area_level_2") && !ciudad) {
      ciudad = comp.long_name;
    }
    if (
      (t.includes("sublocality_level_1") ||
        t.includes("sublocality") ||
        t.includes("neighborhood")) &&
      !colonia
    ) {
      colonia = comp.long_name;
    }
    if (t.includes("postal_code")) {
      postalCode = comp.long_name;
    }
  }

  return {
    level1: estado,
    level2: ciudad, // municipio = ciudad en la mayoría de los casos de México
    level3: colonia,
    city: ciudad,
    postalCode,
  };
}

export const MX_CONFIG: CountryConfig = {
  code: "MX",
  name: "México",
  placesComponents: "country:mx",
  region: "mx",
  countrySuffixes: ["México", "Mexico"],
  labels: { level1: "Estado", level2: "Municipio", level3: "Colonia" },
  center: { lat: 23.6345, lng: -102.5528 },
  level1Options: ESTADOS_MX,
  level1Coords: COORDENADAS_ESTADO_MX,
  normalizeLevel1,
  stateAbbreviations: ESTADO_ABREVIATURAS_MX,
  mapGoogleComponents,
};
