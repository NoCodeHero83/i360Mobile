import { useMemo } from "react";
import { Property } from "@/types";
import { useExchangeRate } from "./useExchangeRate";
import { normalizeStr } from "@/utils/stringNormalizer";
import {
  usePropertyFiltersStore,
  PropertyFilters,
  PolygonCoord,
  LocationChip,
} from "@/store/propertyFiltersStore";

type RawOperacion = {
  tipo_operacion: string | null;
  precio: number | null;
  moneda: string | null;
  comision_tipo?: string | null;
  comision_porcentaje?: number | null;
  comision_meses?: number | null;
  comparte_comision?: boolean | null;
};

type RawProperty = Property & {
  estado?: string | null;
  ciudad?: string | null;
  antiguedad?: number | null;
  niveles?: string | number | null;
  ancho_terreno?: number | null;
  largo_terreno?: number | null;
  operaciones_propiedad?: RawOperacion[] | null;
  operaciones?: RawOperacion[] | null;
  operacion?: string | null;
  // Campos especializados
  tipo_ubicacion_comercial?: string | null;
  frente_metros?: number | null;
  nivel_piso?: number | null;
  sobre_avenida_principal?: boolean | null;
  en_esquina?: boolean | null;
  alta_visibilidad?: boolean | null;
  alto_flujo_vehicular?: boolean | null;
  ubicacion_industrial?: string | null;
  altura_libre_m?: string | null;
  tipo_energia_kva?: string[] | null;
  area_oficinas_m2?: number | null;
  patio_maniobras_m2?: number | null;
  tipo_agua?: string[] | null;
  concesion_agua?: boolean | null;
  uso_terreno?: string[] | null;
  tipo_riego?: string[] | null;
  infra_electricidad?: boolean | null;
  infra_camino_acceso?: boolean | null;
  infra_cercado?: boolean | null;
  acceso_carretera?: boolean | null;
  acceso_camiones?: boolean | null;
};

export type { PropertyFilters };

export interface GeofenceBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Ray casting: retorna true si el punto está dentro del polígono */
const isPointInPolygon = (
  lat: number,
  lng: number,
  polygon: PolygonCoord[],
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude, yi = polygon[i].longitude;
    const xj = polygon[j].latitude, yj = polygon[j].longitude;
    const intersect =
      yi > lng !== yj > lng &&
      lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

type LocationFilter = PropertyFilters["locationFilter"];

const matchesLocationFilter = (
  p: Property,
  rawP: RawProperty,
  locationFilter: LocationFilter,
): boolean => {
  if (locationFilter.estado) {
    const pEstado = normalizeStr(rawP.estado || p.location?.state || "");
    const fEstado = normalizeStr(locationFilter.estado);
    if (!pEstado.includes(fEstado) && !fEstado.includes(pEstado)) return false;
  }

  const pCiudad = (rawP.ciudad || p.location?.city || "").toString().trim().toLowerCase();
  const pMunicipio = (p.municipio || p.location?.municipio || "").toString().trim().toLowerCase();

  if (locationFilter.municipio) {
    const fMunicipio = normalizeStr(locationFilter.municipio);
    const matchMunicipio = normalizeStr(pMunicipio).includes(fMunicipio) || fMunicipio.includes(normalizeStr(pMunicipio));
    const matchCiudad = normalizeStr(pCiudad).includes(fMunicipio) || fMunicipio.includes(normalizeStr(pCiudad));
    if (!matchMunicipio && !matchCiudad) return false;
  }

  if (locationFilter.colonia && locationFilter.colonia.length > 0) {
    const pColonia = normalizeStr(p.colonia || p.location?.colony || "");
    if (Array.isArray(locationFilter.colonia)) {
      const fColonias = locationFilter.colonia.map(normalizeStr);
      const isMatch = fColonias.some((f) => pColonia.includes(f) || f.includes(pColonia));
      if (!isMatch) return false;
    } else {
      const fColonia = normalizeStr(locationFilter.colonia);
      if (!pColonia.includes(fColonia) && !fColonia.includes(pColonia)) return false;
    }
  }

  return true;
};

/**
 * Match por TEXTO según el nivel del chip (colonia/municipio/estado), tolerante.
 * A diferencia de `matchesLocationFilter`, NO exige que coincidan los tres
 * campos: compara solo el del nivel buscado. Así una propiedad de la colonia
 * correcta coincide aunque Google haya abreviado el estado ("Ags.") o el pin
 * esté corrido. La "zona" (polígono dibujado) no tiene texto → solo bounds.
 */
const includesEither = (a: string, b: string) =>
  !!a && !!b && (a.includes(b) || b.includes(a));

function chipTextMatch(
  p: Property,
  rawP: RawProperty,
  chip: LocationChip,
): boolean {
  const lf = chip.locationFilter;
  // Respaldo del término con la etiqueta del chip (primer componente) por si el
  // locationFilter del nivel viniera vacío.
  const label = normalizeStr((chip.label || "").split(",")[0]);
  if (chip.type === "colonia") {
    const c = Array.isArray(lf.colonia) ? lf.colonia[0] : lf.colonia;
    const term = normalizeStr(c || "") || label;
    const pColonia = normalizeStr(p.colonia || p.location?.colony || "");
    if (includesEither(pColonia, term)) return true;
    if (lf.municipio) {
      const pMunicipio = normalizeStr(p.municipio || p.location?.municipio || "");
      if (includesEither(pMunicipio, normalizeStr(lf.municipio))) return true;
    }
    return false;
  }
  if (chip.type === "municipio") {
    const f = normalizeStr(lf.municipio || "") || label;
    const pMunicipio = normalizeStr(p.municipio || p.location?.municipio || "");
    const pCiudad = normalizeStr(rawP.ciudad || p.location?.city || "");
    if (includesEither(pMunicipio, f) || includesEither(pCiudad, f)) return true;
    const pColonia = normalizeStr(p.colonia || p.location?.colony || "");
    if (pColonia) {
      if (includesEither(pColonia, label)) return true;
      const labelParts = label.split(" ");
      if (labelParts.length > 2) {
        const shortLabel = labelParts.slice(0, 2).join(" ");
        if (shortLabel && includesEither(pColonia, shortLabel)) return true;
      }
    }
    return false;
  }
  if (chip.type === "estado") {
    const pEstado = normalizeStr(p.location?.state || rawP.estado || "");
    return includesEither(pEstado, normalizeStr(lf.estado || "") || label);
  }
  return false;
}

export const usePropertyFilters = (
  properties: Property[],
  geofenceBounds?: GeofenceBounds | null,
) => {
  const { convertPrice } = useExchangeRate();

  const {
    filters,
    updateFilter,
    updateLocationFilter,
    addPolygon,
    removePolygon,
    clearPolygons,
    addLocationChip,
    removeLocationChip,
    clearLocationChips,
    clearFilters,
  } = usePropertyFiltersStore();

  const filteredProperties = useMemo(() => {
    return properties.filter((p) => {
      const rawP = p as RawProperty;

      // Status check
      const rawStatus = rawP.status || rawP.estado;
      if (rawStatus) {
        const s = String(rawStatus).toLowerCase().trim();
        if (s === "vendida" || s === "suspendida" || s === "baja") return false;
      }

      // ── Filtro geográfico combinado: OR entre polígonos, chips y base ──
      const hasPolygons = filters.polygons.length > 0;
      const hasChips = filters.locationChips.length > 0;
      const hasBaseLocation = !!(
        filters.locationFilter.estado ||
        filters.locationFilter.ciudad ||
        filters.locationFilter.municipio ||
        (Array.isArray(filters.locationFilter.colonia)
          ? filters.locationFilter.colonia.length > 0
          : filters.locationFilter.colonia)
      );

      if (hasPolygons || hasChips || hasBaseLocation) {
        let geoMatch = false;

        // Coordenadas de la propiedad (latitud/longitud ya son number en la BD)
        const propLat = p.coordinates?.lat ?? p.latitud ?? undefined;
        const propLng = p.coordinates?.lng ?? p.longitud ?? undefined;
        const hasCoords =
          propLat != null && propLng != null &&
          !isNaN(propLat) && !isNaN(propLng);

        if (hasPolygons && !geoMatch) {
          if (hasCoords) {
            geoMatch = filters.polygons.some(
              (polygon) =>
                polygon.length >= 3 &&
                isPointInPolygon(propLat!, propLng!, polygon),
            );
          }
        }

        if (hasChips && !geoMatch) {
          geoMatch = filters.locationChips.some((chip) => {
            // 1) Dentro del recuadro geográfico (sistema por bounds).
            //    OJO: para chips de COLONIA NO usamos los bounds de Google. El
            //    "viewport" que Google devuelve para una colonia suele ser mucho
            //    más grande que la colonia real y arrastraba propiedades de
            //    colonias vecinas (p. ej. buscar "Santa Imelda" mostraba las de
            //    "Tamarindos"). Como la columna `colonia` está bien poblada, para
            //    colonia confiamos en el match por TEXTO (paso 2). Los bounds
            //    siguen valiendo para municipio/estado, donde el recuadro sí es
            //    el área correcta.
            if (chip.type !== "colonia" && chip.bounds && hasCoords) {
              const b = chip.bounds;
              const inBounds =
                propLat! >= b.south &&
                propLat! <= b.north &&
                propLng! >= b.west &&
                propLng! <= b.east;
              if (inBounds) return true;
            }
            // 2) O por texto, SEGÚN EL NIVEL del chip. Recupera propiedades con
            //    la ubicación correcta aunque su pin (impreciso en EasyBroker)
            //    caiga fuera del recuadro. Se compara SOLO el campo del nivel
            //    (colonia/municipio/estado), no los tres a la vez: Google
            //    abrevia el estado ("Ags." vs "Aguascalientes") y exigir que
            //    coincidieran todos rompía el match aunque la colonia fuera la
            //    correcta.
            return chipTextMatch(p, rawP, chip);
          });
        }

        if (hasBaseLocation && !geoMatch) {
          geoMatch = matchesLocationFilter(p, rawP, filters.locationFilter);
        }

        if (!geoMatch) return false;
      } else if (geofenceBounds) {
        // Sin filtros explícitos: solo geobounds del mapa
        const lat = p.coordinates?.lat ?? p.latitud ?? undefined;
        const lng = p.coordinates?.lng ?? p.longitud ?? undefined;
        const valid =
          lat != null && lng != null && !isNaN(lat) && !isNaN(lng) &&
          lat >= geofenceBounds.minLat && lat <= geofenceBounds.maxLat &&
          lng >= geofenceBounds.minLng && lng <= geofenceBounds.maxLng;
        if (!valid) return false;
      }

      // ── Operación ──
      if (filters.operacion) {
        let hasMatchingOperation = false;
        const operaciones = rawP.operaciones_propiedad || rawP.operaciones;
        if (operaciones && Array.isArray(operaciones)) {
          hasMatchingOperation = operaciones.some((op) => {
            const tipoOp = op?.tipo_operacion;
            if (!tipoOp) return false;
            const lower = String(tipoOp).toLowerCase();
            let normalized = lower;
            if (lower === "sale") normalized = "venta";
            else if (lower === "rent") normalized = "renta";
            return normalized === filters.operacion.toLowerCase();
          });
        } else {
          const rawOperacion = rawP.operacion || (rawP as any).operation;
          if (rawOperacion) {
            const pOperacion = String(rawOperacion)
              .toLowerCase()
              .replace("sale", "venta")
              .replace("rent", "renta");
            hasMatchingOperation = pOperacion === filters.operacion.toLowerCase();
          }
        }
        if (!hasMatchingOperation) return false;
      }

      // ── Tipo de propiedad ──
      if (
        filters.tipoPropiedad &&
        p.type?.toString().toLowerCase() !== filters.tipoPropiedad.toLowerCase()
      ) return false;

      if (filters.subtipo && filters.subtipo.length > 0) {
        const propSubtipo = p.subtipo?.toString().toLowerCase();
        if (!filters.subtipo.some((s) => s.toLowerCase() === propSubtipo)) return false;
      }

      // ── Precio ──
      let pPrice = p.price || 0;
      let pCurrency: "MXN" | "USD" = p.currency || "MXN";
      const operaciones = rawP.operaciones_propiedad || rawP.operaciones;

      if (filters.operacion && operaciones && Array.isArray(operaciones)) {
        const matchingOp = operaciones.find((op) => {
          const tipoOp = op?.tipo_operacion;
          if (!tipoOp) return false;
          const lower = String(tipoOp).toLowerCase();
          let normalized = lower;
          if (lower === "sale") normalized = "venta";
          else if (lower === "rent") normalized = "renta";
          return normalized === filters.operacion.toLowerCase();
        });
        if (matchingOp) {
          pPrice = matchingOp.precio || 0;
          pCurrency = (matchingOp.moneda || "MXN") as "MXN" | "USD";
        }
      }

      let finalPrice = pPrice;
      if (pCurrency !== filters.moneda) {
        finalPrice = convertPrice(pPrice, pCurrency as "MXN" | "USD", filters.moneda);
      }

      const minP = parseFloat(filters.precioMin.replace(/,/g, "")) || 0;
      const maxP = parseFloat(filters.precioMax.replace(/,/g, "")) || Infinity;
      if (finalPrice < minP || finalPrice > maxP) return false;

      // ── Habitaciones ──
      if (filters.habitaciones && filters.habitaciones !== "No indicado") {
        const beds = p.features?.beds || 0;
        if (filters.habitaciones === "Más" || filters.habitaciones.includes("Más")) {
          if (beds < 5) return false;
        } else if (filters.habitaciones.includes("+")) {
          const hMin = parseInt(filters.habitaciones);
          if (!isNaN(hMin) && beds < hMin) return false;
        } else {
          const hExact = parseInt(filters.habitaciones);
          if (!isNaN(hExact) && beds !== hExact) return false;
        }
      }

      // ── Baños ──
      if (filters.banos && filters.banos !== "No indicado") {
        const baths = p.features?.baths || 0;
        if (filters.banos === "Más" || filters.banos.includes("Más")) {
          if (baths < 5) return false;
        } else if (filters.banos.includes("+")) {
          const bMin = parseInt(filters.banos);
          if (!isNaN(bMin) && baths < bMin) return false;
        } else {
          const bExact = parseInt(filters.banos);
          if (!isNaN(bExact) && baths !== bExact) return false;
        }
      }

      // ── Medios baños ──
      if (filters.mediosBanos && filters.mediosBanos !== "No indicado") {
        const half = p.features?.halfBaths ?? 0;
        if (filters.mediosBanos === "Más" || filters.mediosBanos.includes("Más")) {
          if (half < 5) return false;
        } else if (filters.mediosBanos.includes("+")) {
          const mMin = parseInt(filters.mediosBanos);
          if (!isNaN(mMin) && half < mMin) return false;
        } else {
          const mExact = parseInt(filters.mediosBanos);
          if (!isNaN(mExact) && half !== mExact) return false;
        }
      }

      // ── Estacionamientos ──
      if (filters.estacionamientos && filters.estacionamientos !== "No indicado") {
        const parking = p.features?.parking || 0;
        if (filters.estacionamientos === "Más" || filters.estacionamientos.includes("Más")) {
          if (parking < 5) return false;
        } else if (filters.estacionamientos.includes("+")) {
          const pMin = parseInt(filters.estacionamientos);
          if (!isNaN(pMin) && parking < pMin) return false;
        } else {
          const pExact = parseInt(filters.estacionamientos);
          if (!isNaN(pExact) && parking !== pExact) return false;
        }
      }

      // ── Antigüedad ──
      if (filters.antiguedad && filters.antiguedad !== "No indicado" && rawP.antiguedad) {
        if (rawP.antiguedad.toString() !== filters.antiguedad) return false;
      }

      // ── M² ──
      if (filters.m2TerrenoMin) {
        const land = p.features?.landSqft || 0;
        if (land < parseFloat(filters.m2TerrenoMin.replace(/,/g, ""))) return false;
      }

      if (filters.m2ConstruccionMin) {
        const constr = p.features?.constructionSqft || 0;
        if (constr < parseFloat(filters.m2ConstruccionMin.replace(/,/g, ""))) return false;
      }

      // ── Ancho / Largo de terreno (frente/fondo, mínimos) ──
      if (filters.anchoTerrenoMin) {
        const ancho = rawP.ancho_terreno ?? 0;
        if (ancho < parseFloat(filters.anchoTerrenoMin.replace(/,/g, ""))) return false;
      }
      if (filters.largoTerrenoMin) {
        const largo = rawP.largo_terreno ?? 0;
        if (largo < parseFloat(filters.largoTerrenoMin.replace(/,/g, ""))) return false;
      }

      // ── Niveles ──
      if (filters.niveles && filters.niveles !== "No indicado") {
        const pLevels = parseInt(String(rawP.niveles ?? p.features?.floors ?? "0"));
        if (filters.niveles === "Más" || filters.niveles.includes("Más")) {
          if (pLevels < 4) return false;
        } else if (filters.niveles.includes("+")) {
          const nMin = parseInt(filters.niveles);
          if (!isNaN(nMin) && pLevels < nMin) return false;
        } else {
          const nExact = parseInt(filters.niveles);
          if (!isNaN(nExact) && pLevels !== nExact) return false;
        }
      }

      // ── Amenidades (la propiedad debe tenerlas TODAS) ──
      if (filters.amenidades && filters.amenidades.length > 0) {
        const propAmenities = (p.amenities ?? []).map(normalizeStr);
        const hasAll = filters.amenidades.every((a) =>
          propAmenities.includes(normalizeStr(a)),
        );
        if (!hasAll) return false;
      }

      // ── Comisión Venta (%) ──
      const comisionVentaMin = parseFloat(filters.comisionVentaMin) || 0;
      if (comisionVentaMin > 0 && operaciones && Array.isArray(operaciones)) {
        const ventaOps = operaciones.filter((op) => {
          if (!op?.tipo_operacion) return false;
          const t = String(op.tipo_operacion).toLowerCase();
          return t === "venta" || t === "sale";
        });
        const passes = ventaOps.some(
          (op) => (op.comision_porcentaje ?? 0) >= comisionVentaMin,
        );
        if (!passes) return false;
      }

      // ── Comisión Renta (meses) ──
      const comisionRentaMin = parseFloat(filters.comisionRentaMin) || 0;
      if (comisionRentaMin > 0 && operaciones && Array.isArray(operaciones)) {
        const rentaOps = operaciones.filter((op) => {
          if (!op?.tipo_operacion) return false;
          const t = String(op.tipo_operacion).toLowerCase();
          return t === "renta" || t === "rent";
        });
        const passes = rentaOps.some(
          (op) => (op.comision_meses ?? 0) >= comisionRentaMin,
        );
        if (!passes) return false;
      }

      // ── Filtros comerciales ──
      if (filters.tipoPropiedad === 'comercial') {
        const cf = filters.comercialFilters;
        // Solo filtra cuando se eligió exactamente una opción; ambas (o ninguna) = sin filtro
        if (cf.tipoUbicacion.length === 1 && rawP.tipo_ubicacion_comercial !== cf.tipoUbicacion[0]) return false;
        if (cf.frenteMin && (rawP.frente_metros ?? 0) < parseFloat(cf.frenteMin)) return false;
        if (cf.nivel && String(rawP.nivel_piso ?? '') !== cf.nivel) return false;
        if (cf.sobreAvenidaPrincipal && !rawP.sobre_avenida_principal) return false;
        if (cf.enEsquina && !rawP.en_esquina) return false;
        if (cf.altaVisibilidad && !rawP.alta_visibilidad) return false;
        if (cf.altoFlujoVehicular && !rawP.alto_flujo_vehicular) return false;
      }

      // ── Filtros industriales ──
      if (filters.tipoPropiedad === 'industrial') {
        const inf = filters.industrialFilters;
        // Solo filtra cuando se eligió exactamente una opción; ambas (o ninguna) = sin filtro
        if (inf.ubicacion.length === 1 && rawP.ubicacion_industrial !== inf.ubicacion[0]) return false;
        if (inf.alturaLibre && rawP.altura_libre_m !== inf.alturaLibre) return false;
        if (inf.energiaKva.length > 0) {
          const propEnergy = rawP.tipo_energia_kva ?? [];
          const hasMatch = inf.energiaKva.some((e) => propEnergy.includes(e));
          if (!hasMatch) return false;
        }
        if (inf.areaOficinasMin && (rawP.area_oficinas_m2 ?? 0) < parseFloat(inf.areaOficinasMin)) return false;
        if (inf.patioManiobrasMin && (rawP.patio_maniobras_m2 ?? 0) < parseFloat(inf.patioManiobrasMin)) return false;
      }

      // ── Filtros agrícolas ──
      if (filters.tipoPropiedad === 'agricola') {
        const ag = filters.agricolaFilters;
        if (ag.tiposAgua.length > 0) {
          const propAgua = rawP.tipo_agua ?? [];
          const hasMatch = ag.tiposAgua.some((a) => propAgua.includes(a));
          if (!hasMatch) return false;
        }
        if (ag.concesionAgua && !rawP.concesion_agua) return false;
        if (ag.usoTerreno.length === 1 && !rawP.uso_terreno?.includes(ag.usoTerreno[0])) return false;
        if (ag.tipoRiego.length === 1 && !rawP.tipo_riego?.includes(ag.tipoRiego[0])) return false;
        if (ag.electricidad && !rawP.infra_electricidad) return false;
        if (ag.caminoAcceso && !rawP.infra_camino_acceso) return false;
        if (ag.cercado && !rawP.infra_cercado) return false;
        if (ag.pieCarretera && !rawP.acceso_carretera) return false;
        if (ag.accesCamiones && !rawP.acceso_camiones) return false;
      }

      return true;
    });
  }, [properties, filters, geofenceBounds]);

  const cf = filters.comercialFilters;
  const inf = filters.industrialFilters;
  const ag = filters.agricolaFilters;
  const hasSpecializedFilters =
    (cf && (cf.tipoUbicacion.length > 0 || cf.frenteMin !== "" || cf.nivel !== "" ||
      cf.sobreAvenidaPrincipal || cf.enEsquina || cf.altaVisibilidad || cf.altoFlujoVehicular)) ||
    (inf && (inf.ubicacion.length > 0 || inf.alturaLibre !== "" || inf.energiaKva?.length > 0 ||
      inf.areaOficinasMin !== "" || inf.patioManiobrasMin !== "")) ||
    (ag && (ag.tiposAgua?.length > 0 || ag.concesionAgua || ag.usoTerreno.length > 0 ||
      ag.tipoRiego.length > 0 || ag.electricidad || ag.caminoAcceso || ag.cercado ||
      ag.pieCarretera || ag.accesCamiones));

  const hasActiveFilters =
    filters.polygons.length > 0 ||
    filters.locationChips.length > 0 ||
    filters.tipoPropiedad !== "" ||
    (filters.subtipo && filters.subtipo.length > 0) ||
    filters.precioMin !== "" ||
    filters.precioMax !== "" ||
    filters.habitaciones !== "" ||
    filters.banos !== "" ||
    filters.mediosBanos !== "" ||
    filters.estacionamientos !== "" ||
    filters.antiguedad !== "" ||
    filters.niveles !== "" ||
    filters.m2TerrenoMin !== "" ||
    filters.m2ConstruccionMin !== "" ||
    filters.anchoTerrenoMin !== "" ||
    filters.largoTerrenoMin !== "" ||
    filters.operacion !== "" ||
    parseFloat(filters.comisionVentaMin) > 0 ||
    parseFloat(filters.comisionRentaMin) > 0 ||
    !!hasSpecializedFilters ||
    !!(
      filters.locationFilter.estado ||
      filters.locationFilter.ciudad ||
      filters.locationFilter.municipio ||
      (Array.isArray(filters.locationFilter.colonia)
        ? filters.locationFilter.colonia.length > 0
        : filters.locationFilter.colonia)
    );

  return {
    filters,
    filteredProperties,
    updateFilter,
    updateLocationFilter,
    addPolygon,
    removePolygon,
    clearPolygons,
    addLocationChip,
    removeLocationChip,
    clearLocationChips,
    clearFilters,
    hasActiveFilters,
  };
};
