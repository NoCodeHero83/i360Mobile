# INFORME TÉCNICO: Propiedades no aparecen en el mapa al seleccionar ubicación desde el buscador

## Fecha
2026-07-25

## Contexto
- **Aplicación:** Ilyrox (Red social inmobiliaria)
- **Framework:** React Native via Expo SDK 54
- **Backend:** Supabase (PostgreSQL + RPC)
- **Mapas:** Google Maps API (Places Autocomplete, Place Details, Geocoding)
- **Caso de prueba:** Propietario *Alex Gutiérrez* — Ubicación *Residencial San Nicolás*

---

## RESUMEN EJECUTIVO

Se identificaron **tres posibles causas raíz** que pueden estar actuando individualmente o en combinación:

| # | Causa | Probabilidad | Descripción |
|---|-------|-------------|-------------|
| 1 | Propiedad excluida por filtros **server-side** (`activo`/`status`/límite 500) | **ALTA** | La propiedad no está entre las 500 más recientes, o tiene `activo=false`, o `status` es "vendida"/"suspendida"/"baja" |
| 2 | Inconsistencia en clasificación de **tipo Google Places** | **MEDIA** | Google clasifica "Residencial San Nicolás" como `locality` (municipio), pero el municipio extraído es incorrecto |
| 3 | Diferencia entre **colonia almacenada** vs **mainText de Google** | **MEDIA** | El campo `colonia` en BD difiere del nombre que Google devuelve en Autocomplete |

---

## TRAZA COMPLETA DEL FLUJO

### 1. Propiedad almacenada → Base de datos

- **Tabla:** `propiedades` en Supabase
- **Campos relevantes:** `colonia`, `municipio`, `estado`, `latitud`, `longitud`, `activo`, `status`, `created_by`, `sin_comision`, `deleted_at`
- **Origen del campo `colonia` al crear la propiedad:**

El `CascadeLocationSelector` usa Google Places de la siguiente forma:

1. **Fase A — Place Details:** Obtiene lat/lng del lugar seleccionado
2. **Fase B — Reverse Geocoding:** Convierte coordenadas a componentes de dirección
3. **Fase C — `mapGoogleComponents` (`mx.ts:117-156`):** Extrae colonia del primer componente `sublocality_level_1`, `sublocality` o `neighborhood`
4. **Fase D — Corrección:** Si el tipo de lugar NO es "colonia", se limpia el campo colonia (se deja vacío)

**Archivos involucrados:**
- `src/components/common/CascadeLocationSelector.tsx`
- `src/lib/geocodingService.ts` (`parseAddressComponents`, `reverseGeocode`)
- `src/lib/location/countries/mx.ts` (`mapGoogleComponents`)

**⚠️ Punto crítico:** Si el reverse geocode NO encuentra un componente `sublocality_level_1`/`sublocality`/`neighborhood`, y el tipo de lugar no es "colonia", el campo `colonia` **se guarda vacío en la BD**.

---

### 2. Usuario escribe "Residencial San Nicolás" en el buscador

**Componente que maneja la entrada:** `SearchOverlay` (`src/components/search/SearchOverlay.tsx`)

**Hook principal:** `useSearch` (`src/hooks/useSearch.ts`)

**Consulta a Google Places:**
```typescript
// useSearch.ts:245-248
searchLocations(trimmed, undefined, {
  restrictToRegions: false,  // SIN filtro (regions) → devuelve TODO tipo de lugar
  withCounts: false,         // Sin conteo de propiedades
});
```

**Flujo completo:**
1. `searchLocations` → `locationService.ts:searchLocations` → `geocodingService.ts:searchPlaces`
2. `searchPlaces` hace fetch a la API de Google Places Autocomplete
3. Los resultados se mapean con `derivePlaceType` para determinar el tipo (`estado`/`municipio`/`colonia`)
4. Los resultados pasan por `extractMunicipioEstado` para extraer municipio/estado del `secondaryText`

**Criterio de `derivePlaceType` (`geocodingService.ts:61-72`):**
```typescript
function derivePlaceType(types: string[]): "estado" | "municipio" | "colonia" {
  if (types.includes("administrative_area_level_1")) return "estado";
  if (types.includes("locality") || types.includes("administrative_area_level_2") || types.includes("administrative_area_level_3"))
    return "municipio";
  return "colonia";  // ← default: TODO lo demás (sublocality, neighborhood, route, establishment, premise, etc.)
}
```

---

### 3. Sugerencias devueltas → `SearchLocation[]`

Se mapean en `useSearch.ts:262-274`:

```typescript
locations: suggestions.map((s, i) => ({
  id: `${s.type}-${i}`,
  name: s.name,                    // Google mainText (ej: "Residencial San Nicolás")
  count: s.propertyCount ?? 0,
  type: s.type,                     // derivePlaceType → "estado"|"municipio"|"colonia"
  municipio: s.municipio_nombre,    // extractMunicipioEstado
  estado: s.estado_nombre,          // extractMunicipioEstado
  placeId: s.placeId,               // Google place_id
}));
```

**Extracción de municipio/estado (`locationSearchStore.ts:57-99`):**

```typescript
function extractMunicipioEstado(suggestion, country) {
  // Remueve sufijo del país: "México" o "Mexico"
  // Divide secondaryText por comas: "Aguascalientes, Aguascalientes"
  const parts = secondary.split(",").map(s => s.trim()).filter(Boolean);

  // Para tipo "estado" → NO devuelve nada (solo estado implícito en name)
  if (suggestion.type === "estado") return {};

  const estado_nombre = parts[parts.length - 1];

  // Para tipo "municipio" → devuelve SOLO estado_nombre (¡NO municipio_nombre!)
  if (suggestion.type === "municipio") {
    return { estado_nombre };
  }

  // Para tipo "colonia" → devuelve ambos
  const municipio_nombre = parts.length >= 2 ? parts[parts.length - 2] : undefined;
  return { municipio_nombre, estado_nombre };
}
```

**⚠️ Punto crítico:** Para sugerencias de tipo `"municipio"`, `municipio_nombre` queda `undefined`. Esto es relevante para la CAUSA 2.

---

### 4. Usuario hace clic en una sugerencia → `selectLocation()`

**Archivo:** `src/hooks/useSearch.ts:278-294`

```typescript
const selectLocation = useCallback((loc: SearchLocation) => {
  const baseName = loc.name.split(",")[0].trim();

  // 1. LIMPIA TODOS los filtros activos
  clearFilters({ estado: "", ciudad: "", municipio: "", colonia: "" });

  // 2. Establece la ubicación seleccionada en AppContext
  setSelectedLocation({
    type: loc.type ?? "colonia",
    name: baseName,
    estado_id: loc.estadoId ?? 0,
    municipio_nombre: loc.municipio,   // de SearchLocation (≈ extractMunicipioEstado)
    estado_nombre: loc.estado,          // de SearchLocation (≈ extractMunicipioEstado)
    placeId: loc.placeId,               // para obtener bounds después
  });

  // 3. Marca flag para que la Home navegue al mapa
  setPendingOpenMap(true);
}, [clearFilters, setSelectedLocation, setPendingOpenMap]);
```

**Datos enviados al mapa:**
```javascript
{
  type: "colonia",                    // depende de derivePlaceType
  name: "Residencial San Nicolás",    // texto principal de Google
  municipio_nombre: "Aguascalientes", // de extractMunicipioEstado
  estado_nombre: "Aguascalientes",    // de extractMunicipioEstado
  placeId: "ChIJ...",                 // ID de Google Places
}
```

---

### 5. Navegación al mapa

**Archivo:** `src/app/(tabs)/index.tsx:81-89`

```typescript
useEffect(() => {
  if (pendingOpenMap) {
    setPendingOpenMap(false);
    router.navigate("/(stack)/map");  // NOTA: usa navigate, no push
  }
}, [pendingOpenMap]);
```

- No se pasan parámetros por URL
- La comunicación entre pantallas es vía `selectedLocation` en `AppContext` y `locationChips` en `propertyFiltersStore`

---

### 6. Mapa recibe `selectedLocation` → crea `LocationChip`

**Archivo:** `src/components/map/MapSearch.tsx:117-217`

El `useEffect` de `selectedLocation` ejecuta:

```typescript
useEffect(() => {
  if (!selectedLocation) { /* limpiar */ return; }

  const sel = selectedLocation as any;
  const selKey = `${sel.type}-${sel.name}`;

  const addSelectedAsChip = (bounds?) => {
    if (addedSelectedChipRef.current === selKey) return;  // evita duplicados
    addedSelectedChipRef.current = selKey;

    const chip: LocationChip = {
      id: `selected-${selKey}`,
      label: sel.name,
      type: (sel.type ?? "colonia") as "estado" | "municipio" | "colonia",
      bounds,  // desde Place Details
      locationFilter: {
        estado: sel.estado_nombre || (sel.type === "estado" ? sel.name : ""),
        ciudad: "",
        municipio: sel.municipio_nombre || (sel.type === "municipio" ? sel.name : ""),
        colonia: sel.type === "colonia" ? sel.name : "",
      },
    };
    addLocationChip(chip);  // → propertyFiltersStore
  };

  // Intenta obtener bounds del lugar
  const geocode = async () => {
    if (sel.placeId) {
      const details = await getPlaceDetails(sel.placeId);
      if (details?.bounds) {
        setFocusRegion(boundsToRegion(details.bounds, sel.type));
        addSelectedAsChip(details.bounds);
        return;
      }
      if (details?.location) {
        addSelectedAsChip(undefined);  // chip sin bounds
        return;
      }
    }
    // Fallback: Geocoding API con el nombre
  };
  geocode();
}, [selectedLocation]);
```

**Chip resultante (ejemplo ideal para colonia):**
```javascript
{
  id: "selected-colonia-Residencial San Nicolás",
  label: "Residencial San Nicolás",
  type: "colonia",
  bounds: { north: ..., south: ..., east: ..., west: ... }, // de Place Details
  locationFilter: {
    estado: "Aguascalientes",
    ciudad: "",
    municipio: "Aguascalientes",
    colonia: "Residencial San Nicolás",
  },
}
```

---

### 7. Consulta al servidor (`fetchMapProperties`)

**Archivo:** `src/hooks/useMapProperties.ts:212-341`

**`map.tsx`** ejecuta:

```typescript
const storeFilters = usePropertyFiltersStore((s) => s.filters);
const [debouncedFilters, setDebouncedFilters] = useState<MapServerFilters>(
  () => extractServerFilters(storeFilters)
);
const { data: properties = [] } = useMapProperties(debouncedFilters);
```

**`extractServerFilters` (`src/utils/mapServerFilters.ts:23-110`) OMITE explícitamente los `locationChips`:**
```typescript
// Comentario en mapServerFilters.ts:10-17
// IMPORTANTE — UBICACIÓN NO va al servidor:
// La ubicación (chips de colonia/municipio/estado y polígonos) se resuelve
// SIEMPRE en el cliente (usePropertyFilters)
```

Solo extrae:
- `tipoPropiedad`, `subtipo`
- `locationFilter.estado`, `locationFilter.municipio` (solo si están poblados, que tras `clearFilters` quedan vacíos)
- Precio, habitaciones, baños, etc.

**Conclusión:** Como `clearFilters` vació `locationFilter`, y no hay chips en los server filters, `extractServerFilters` devuelve `{}`.

**Consulta resultante a Supabase:**

```typescript
let query = supabase.from("propiedades").select(`*, operaciones_propiedad (*), amenidades:...`);

if (currentUserId) {
  // activo=true  O  (sin_comision=true AND created_by=currentUserId)
  query = query.or(`activo.eq.true,and(sin_comision.eq.true,created_by.eq.${currentUserId})`);
} else {
  query = query.eq("activo", true);
}

query = query.is("deleted_at", null);

// Sin filtros activos → 500 más recientes
query = query.limit(500).order("created_at", { ascending: false });
```

**⚠️ Punto crítico (CAUSA 1):** La propiedad DEBE cumplir:
1. `activo = true` (a menos que `sin_comision = true` y el usuario actual sea quien la creó)
2. `deleted_at IS NULL`
3. Estar entre las 500 más recientes por `created_at`

---

### 8. Filtrado cliente (`usePropertyFilters`)

**Archivo:** `src/hooks/usePropertyFilters.ts:159-575`

El hook recibe `properties` (respuesta del servidor) y filtra usando los `locationChips` del store:

```typescript
const filteredProperties = useMemo(() => {
  return properties.filter((p) => {
    const rawP = p as RawProperty;

    // Filtro de status
    const rawStatus = rawP.status || rawP.estado;
    if (rawStatus) {
      const s = String(rawStatus).toLowerCase().trim();
      if (s === "vendida" || s === "suspendida" || s === "baja") return false;
    }

    // Filtro geográfico combinado: OR entre chips, base location y polígonos
    if (hasPolygons || hasChips || hasBaseLocation) {
      let geoMatch = false;

      if (hasChips && !geoMatch) {
        geoMatch = filters.locationChips.some((chip) => {
          // Para chips NO-colonia con bounds: verifica si la propiedad está dentro
          if (chip.type !== "colonia" && chip.bounds && hasCoords) {
            if (inBounds) return true;
          }
          // SIEMPRE: verifica por texto según el nivel del chip
          return chipTextMatch(p, rawP, chip);
        });
      }

      if (!geoMatch) return false;
    }

    // ... resto de filtros (precio, habitaciones, amenidades, etc.)
  });
}, [properties, filters, geofenceBounds]);
```

**`chipTextMatch` para cada tipo (`usePropertyFilters.ts:128-157`):**

```typescript
function chipTextMatch(p: Property, rawP: RawProperty, chip: LocationChip): boolean {
  const lf = chip.locationFilter;
  const label = normalizeStr((chip.label || "").split(",")[0]);

  // COLONIA → compara p.colonia con chip.locationFilter.colonia
  if (chip.type === "colonia") {
    const c = Array.isArray(lf.colonia) ? lf.colonia[0] : lf.colonia;
    const term = normalizeStr(c || "") || label;
    const pColonia = normalizeStr(p.colonia || p.location?.colony || "");
    return includesEither(pColonia, term);
  }

  // MUNICIPIO → compara p.municipio con chip.locationFilter.municipio
  if (chip.type === "municipio") {
    const f = normalizeStr(lf.municipio || "") || label;
    const pMunicipio = normalizeStr(p.municipio || p.location?.municipio || "");
    const pCiudad = normalizeStr(rawP.ciudad || p.location?.city || "");
    return includesEither(pMunicipio, f) || includesEither(pCiudad, f);
  }

  // ESTADO → compara p.estado con chip.locationFilter.estado
  if (chip.type === "estado") {
    const pEstado = normalizeStr(p.location?.state || rawP.estado || "");
    return includesEither(pEstado, normalizeStr(lf.estado || "") || label);
  }

  return false;
}
```

**Función de comparación (`includesEither`):**
```typescript
const includesEither = (a: string, b: string) =>
  !!a && !!b && (a.includes(b) || b.includes(a));
```

---

## CAUSAS RAÍZ DETALLADAS

### CAUSA 1: Propiedad excluida por filtros del servidor

**¿Qué ocurre?** La propiedad no está en el conjunto devuelto por `fetchMapProperties`.

**Posibles razones:**

| Razón | Dónde | Código |
|-------|-------|--------|
| `activo = false` | `useMapProperties.ts:226-232` | `query.or("activo.eq.true,and(sin_comision.eq.true,created_by.eq.${currentUserId})")` |
| `deleted_at IS NOT NULL` | `useMapProperties.ts:234` | `query.is("deleted_at", null)` |
| `status = "vendida"/"suspendida"/"baja"` | `usePropertyFilters.ts:183-187` | Filtro cliente elimina estas propiedades |
| Propiedad > 500 más recientes | `useMapProperties.ts:335` | `query.limit(500).order("created_at", {ascending: false})` |

**Por qué la ficha SÍ muestra la propiedad:** `usePropertyDetails` (`src/hooks/usePropertyDetails.ts`) hace `supabase.from("propiedades").select("*").eq("id", feedItemId).single()` — busca por ID directo, sin filtros de `activo`/`status`. La ficha muestra cualquier propiedad existente.

---

### CAUSA 2: Inconsistencia en clasificación de tipo Google Places

**¿Qué ocurre?** Google clasifica "Residencial San Nicolás" como `locality` en vez de `sublocality`, lo que produce un chip de tipo "municipio" con datos incorrectos.

**Flujo del error:**

1. Google Autocomplete devuelve:
   - `types: ["locality", "political"]`
   - `mainText: "Residencial San Nicolás"`
   - `secondaryText: "Aguascalientes, Aguascalientes, México"`

2. `derivePlaceType` devuelve `"municipio"` (porque `types.includes("locality")`)

3. `extractMunicipioEstado` para tipo "municipio":
   ```typescript
   if (suggestion.type === "municipio") {
     return { estado_nombre };  // ← NO incluye municipio_nombre
   }
   ```

4. En la creación del chip, `municipio_nombre` es `undefined`, por lo que:
   ```typescript
   municipio: undefined || ("municipio" ? "Residencial San Nicolás" : "")
   // → "Residencial San Nicolás"  ← INCORRECTO
   ```

5. En `chipTextMatch` para tipo "municipio":
   ```typescript
   const f = normalizeStr("Residencial San Nicolás") = "residencialsanicolas"
   const pMunicipio = normalizeStr("Aguascalientes") = "aguascalientes"
   includesEither("aguascalientes", "residencialsanicolas")
   // "aguascalientes".includes("residencialsanicolas") → FALSE
   // "residencialsanicolas".includes("aguascalientes") → FALSE
   // Resultado: NO HAY MATCH
   ```

**¿Por qué el mapa muestra 0 propiedades?** Porque el chip busca propiedades cuyo `municipio` sea "Residencial San Nicolás" — ninguna propiedad tiene ese valor en el campo `municipio`.

---

### CAUSA 3: Diferencia entre colonia almacenada vs mainText de Google

**¿Qué ocurre?** El valor del campo `colonia` en la BD se pobló mediante `reverseGeocode` + `mapGoogleComponents` al **crear** la propiedad. El filtro de búsqueda usa el `mainText` de Google Places **Autocomplete**. Aunque ambos vienen de Google, pueden diferir para ciertos lugares.

**Escenario posible:**

- **Al crear la propiedad:** el usuario buscó "Residencial San Nicolás", Google devolvió reverse geocode con `sublocality_level_1 = "San Nicolás"` (abreviado). En la BD: `colonia = "San Nicolás"`.
- **Al buscar:** Google Autocomplete devuelve `mainText = "Residencial San Nicolás"` (nombre completo).
- **chipTextMatch compara:**
  - `term = normalizeStr("Residencial San Nicolás") = "residencialsanicolás"`
  - `pColonia = normalizeStr("San Nicolás") = "sannicolás"`
  - `includesEither("sannicolás", "residencialsanicolás")`
  - `"sannicolás".includes("residencialsanicolás")` → FALSE
  - `"residencialsanicolás".includes("sannicolás")` → **TRUE** ← ¡Esto SÍ funciona!

**Conclusión:** El substring matching bidireccional (`includesEither`) mitiga pequeñas diferencias. Sin embargo, si la diferencia es mayor (ej: `colonia = ""` o `colonia = "Aguascalientes"`), el matching falla.

---

## MAPA DE ARCHIVOS INVOLUCRADOS

| Archivo | Líneas clave | Rol |
|---------|-------------|-----|
| `src/hooks/useMapProperties.ts` | 226-232, 335 | Consulta Supabase con filtro `activo` y límite 500 |
| `src/hooks/usePropertyFilters.ts` | 131-157, 178-517 | Filtrado cliente por chips (bounds + texto) |
| `src/hooks/useSearch.ts` | 245-294 | Búsqueda global + `selectLocation` |
| `src/store/locationSearchStore.ts` | 57-99, 110-195 | Búsqueda de ubicaciones + `extractMunicipioEstado` |
| `src/store/propertyFiltersStore.ts` | 10-29, 250-256 | `LocationChip` + `addLocationChip` |
| `src/utils/mapServerFilters.ts` | 23-110 | Traduce store → server filters (OMITE locationChips) |
| `src/components/map/MapSearch.tsx` | 117-217, 250-284 | Procesa `selectedLocation` → chip |
| `src/components/map/PropertyMap.tsx` | 956-962 | Renderiza "No hay propiedades para mostrar" |
| `src/components/search/SearchOverlay.tsx` | 600-616 | UI del buscador global |
| `src/app/(tabs)/index.tsx` | 81-89 | Escucha `pendingOpenMap` y navega al mapa |
| `src/app/(stack)/map.tsx` | 1-39 | Página del mapa: debounce + consulta |
| `src/app/(stack)/map-results.tsx` | 160-178 | Lista de resultados |
| `src/lib/geocodingService.ts` | 61-72, 172-213 | `derivePlaceType`, `getPlaceDetails` |
| `src/lib/locationService.ts` | 39-66 | `searchLocations` → Google Places |
| `src/lib/location/countries/mx.ts` | 117-156 | `mapGoogleComponents` (colonia desde address_components) |
| `src/lib/location/types.ts` | 1-88 | Tipos de ubicación neutrales |
| `src/lib/location/registry.ts` | 1-50 | Resolución de config por país |
| `src/components/common/CascadeLocationSelector.tsx` | — | Creación de propiedad: selección de ubicación |
| `src/components/CreateContent/CreateProperty/usePublishProperty.ts` | — | Mapea `ubicacionData.colonia` → columna `colonia` |
| `supabase/contar_propiedades_zonas.sql` | 1-57 | Conteo de propiedades (requiere match EXACTO) |
| `supabase/geo_matching_functions.sql` | 1-112 | `normalizar_ubicacion`, `punto_en_area_busqueda` |

---

## PUNTOS EXACTOS DONDE SE ROMPE LA CADENA

### Punto A — Servidor (más probable)
**`src/hooks/useMapProperties.ts:226-232`** — Filtro `activo` excluye la propiedad
**`src/hooks/useMapProperties.ts:335`** — Límite 500 excluye propiedades antiguas

### Punto B — Cliente si el tipo es "municipio"
**`src/store/locationSearchStore.ts:91-93`** — `extractMunicipioEstado` no extrae `municipio_nombre` para tipo "municipio"
**`src/components/map/MapSearch.tsx:147`** — Chip usa `sel.name` como fallback de `municipio` cuando `municipio_nombre` es undefined
**`src/hooks/usePropertyFilters.ts:147-150`** — `chipTextMatch` compara municipio vs "Residencial San Nicolás" → no coinciden

### Punto C — Cliente si colonia no coincide
**`src/hooks/usePropertyFilters.ts:141-144`** — `chipTextMatch` para colonia: compara texto normalizado

---

## MODIFICACIONES RECOMENDADAS

### 1. Diagnóstico inmediato (logging)

Agregar logs en puntos críticos para determinar la causa exacta:

**En `src/hooks/usePropertyFilters.ts:131-157`** (`chipTextMatch`):
```typescript
console.log("[chipTextMatch]", {
  chipType: chip.type,
  chipLabel: chip.label,
  locationFilter: chip.locationFilter,
  pColonia: p.colonia,
  pMunicipio: p.municipio,
  pEstado: p.estado,
  term,
  pColoniaNormalized: pColonia,
  pMunicipioNormalized: pMunicipio,
  result,
});
```

**En `src/components/map/MapSearch.tsx:139-151`** (creación del chip):
```typescript
console.log("[selectedLocation chip]", JSON.stringify(chip));
console.log("[selectedLocation sel]", JSON.stringify(sel));
```

### 2. Corrección en `extractMunicipioEstado`

**Archivo:** `src/store/locationSearchStore.ts:87-99`

**Problema:** Para tipo "municipio", `extractMunicipioEstado` NO devuelve `municipio_nombre`.

**Solución:** Extraer `municipio_nombre` igual que para tipo "colonia":

```typescript
// ANTES (roto):
if (suggestion.type === "estado") return {};
if (suggestion.type === "municipio") {
  return { estado_nombre };
}

// DESPUÉS (corregido):
if (suggestion.type === "estado") return {};
const municipio_nombre = parts.length >= 2 ? parts[parts.length - 2] : undefined;
return { municipio_nombre, estado_nombre };
```

### 3. Corrección en creación del chip (`MapSearch.tsx`)

**Archivo:** `src/components/map/MapSearch.tsx:139-151`

Cuando `municipio_nombre` venga vacío y `type` sea "municipio", usar el `name` parseado de `secondaryText` en vez del `label` del chip:

```typescript
// Alternativa: no usar sel.name como fallback cuando el tipo es "municipio"
// porque sel.name puede ser "Residencial San Nicolás" y no un municipio real
municipio: sel.municipio_nombre || "",  // quitar el fallback a sel.name
```

### 4. Incrementar límite de propiedades servidor

En `src/hooks/useMapProperties.ts:335`, cuando hay chips de ubicación (aunque no sean server filters), incrementar el límite.

**Opción A:** Siempre devolver 3000 propiedades:
```typescript
query = query.limit(3000).order("created_at", { ascending: false });
```

**Opción B:** Pasar un flag desde `MapSearch` indicando que se necesita más cobertura.

### 5. Garantizar colonia en creación de propiedad

En `CascadeLocationSelector.tsx` (Fase D), cuando el reverse geocode no encuentre colonia (`sublocality_level_1`/`sublocality`/`neighborhood`), usar el `mainText` de la sugerencia como valor para colonia si el tipo de lugar no es "estado" ni "municipio".

### 6. Mejorar matching para chips sin bounds

En `usePropertyFilters.ts`, cuando un chip de tipo "municipio" tiene `locationFilter.municipio` = "Residencial San Nicolás" (incorrecto), y el fallback de bounds tampoco funciona, no hay manera de recuperarse. La corrección de #2 y #3 previene esto.

---

## CASOS SIMILARES QUE PUEDEN PRODUCIR EL MISMO COMPORTAMIENTO

| Tipo de ubicación | Ejemplo | Riesgo |
|-------------------|---------|--------|
| Fraccionamientos con nombre | "Residencial X", "Fraccionamiento Y", "Villas Z" | ALTO — Google puede clasificarlos como `locality` |
| Condominios cerrados | "Coto X", "Privada Y" | ALTO — mismo caso |
| Pequeñas localidades | Pueblos que Google trata como `locality` dentro de un municipio | ALTO |
| Colonias con nombre compuesto | "San Miguel Chapultepec", "Lomas de Sotelo" | MEDIO — si el reverse geocode devuelve nombre abreviado |
| Propiedades importadas (EasyBroker) | Cualquiera | MEDIO — el colonia viene de CSV parseado |
| Propiedades antiguas (>500 en BD) | Cualquiera | MEDIO — no entran en el top 500 |
| Propiedades con `activo=false` | Cualquiera | ALTO — el admin panel las muestra pero el mapa no |
| Propiedades con `status != "publicada"` | "Suspendida", "Vendida", "Baja" | ALTO — el filtro cliente las elimina |

---

## VERIFICACIÓN EN BD (necesaria para confirmar causa exacta)

```sql
-- 1. Estado de la propiedad específica
SELECT id, activo, status, sin_comision, created_by, created_at,
       colonia, municipio, estado,
       latitud IS NOT NULL as tiene_coords
FROM propiedades
WHERE id = '<ID_DE_LA_PROPIEDAD_DE_ALEX>';

-- 2. Conteo de propiedades activas totales
SELECT COUNT(*) FROM propiedades
WHERE activo = true AND deleted_at IS NULL;

-- 3. ¿Está la propiedad en el top 500?
SELECT COUNT(*) FROM propiedades
WHERE activo = true AND deleted_at IS NULL
  AND created_at > (SELECT created_at FROM propiedades WHERE id = '<ID>');

-- 4. ¿Hay propiedades en la BD con colonia = 'Residencial San Nicolás'?
SELECT COUNT(*) FROM propiedades
WHERE activo = true AND deleted_at IS NULL
  AND LOWER(TRIM(colonia)) LIKE '%residencial%san%nicolás%';
```

---

## CONCLUSIÓN

Las tres causas raíz identificadas pueden coexistir. La **más probable** es la Causa 1 (filtros server-side), que explicaría por qué la propiedad se ve en la ficha (búsqueda por ID sin filtros) pero no en el mapa (búsqueda masiva con filtros). Sin embargo, la Causa 2 (tipo "municipio" incorrecto) y la Causa 3 (discrepancia en nombre de colonia) son también probables y comparten el mismo síntoma.

**Se recomienda priorizar:**
1. Verificar en BD el `activo`, `status` y `created_at` de la propiedad
2. Agregar los logs de diagnóstico
3. Aplicar la corrección de `extractMunicipioEstado` (modificación #2) que es un bug latente independientemente
4. Evaluar si el límite de 500 propiedades es adecuado
