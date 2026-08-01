# Reporte de Búsqueda de Ubicaciones — IlyroxMobile

## Comportamiento General

El sistema tiene **dos modos de búsqueda de ubicaciones**: **buscador por texto** (pantalla de inicio) y **buscador por mapa** (pantalla de mapa con chips, polígonos y autocomplete inline). Ambos se apoyan en Google Places API, con post-procesamiento client-side para ranking, filtrado por texto y conteo de propiedades.

---

## 1. Buscador por Texto (Pantalla de Inicio)

### Flujo

1. Usuario escribe en `LocationSearchBar` (HomeHeader) o en `SearchOverlay` (full-screen).
2. **Debounce 300ms** → llama a `searchLocations(term)` en `locationSearchStore`.
3. **Google Places Autocomplete**: consulta con `components=country:mx`, `types=(regions)` y bias por coordenadas del estado del usuario.
4. **Post-procesamiento** en `locationSearchStore`:
   - **Extraer municipio/estado** del `secondaryText` de Google.
   - **Re-rank geográfico**: prioriza resultados que pertenecen al estado del usuario.
   - **Fallback geográfico**: si hay menos de 2 resultados del estado del usuario, relanza la búsqueda con `"{query}, {estado}"`.
   - **Score textual**: clasifica por exact match > startsWith > includes > resto. Todo normalizado sin acentos (NFD).
   - **Property counts**: llama a RPC `contar_propiedades_zonas` (Supabase) para mostrar cuántas propiedades hay en cada zona sugerida.
5. **Resultados** se muestran en lista con nombre, tipo (estado/municipio/colonia) y conteo de propiedades.
6. **Usuario selecciona** una ubicación → `handleSelectLocation()`:
   - `clearFilters()` resetea todos los filtros.
   - `setSelectedLocation({ type, name, placeId, ... })` en AppContext.
   - `setPendingOpenMap(true)` → navega automáticamente a la pantalla de mapa.

### También busca (multipropósito)

- **Códigos de propiedad**: `supabase.from("propiedades").ilike("codigo_propiedad", ...)`
- **Usuarios**: RPC `buscar_perfiles`
- **Posts**: por contenido, ubicación, tipo
- **Reels**: por descripción
- **Fichas técnicas**: por código, colonia, municipio con `unaccent()`

---

## 2. Buscador por Mapa (Pantalla de Mapa)

### Sub-modo A: Geocoding de ubicación seleccionada (carga inicial)

1. En `MapSearch.tsx`, `useEffect` sobre `selectedLocation`:
   - Si tiene `placeId` → `getPlaceDetails(placeId)` → obtiene bounds.
   - Si no → Google Geocoding con `"{name}, Mexico"`.
2. Crea un `LocationChip` y lo agrega via `addLocationChip()`.
3. `PropertyMap` anima la cámara a `focusRegion`.

### Sub-modo B: Búsqueda de zona inline

1. Usuario toca "¿Dónde busca tu cliente?" en `SearchFiltersBar` → overlay de autocomplete.
2. **Debounce 300ms** → `searchLocations()` con `restrictToRegions: false` (encuentra colonias, fraccionamientos, POIs, etc.).
3. Resultados en `FlatList` con iconos según tipo.
4. Al seleccionar → `getPlaceDetails(placeId)` para bounds → centra mapa → crea `LocationChip`.

### Sub-modo C: Dibujo de polígonos

1. Long-press en mapa → entra en modo dibujo.
2. Tap para agregar vértices, tap en primer vértice (3+ puntos) para cerrar polígono.
3. `handleConfirmPolygon()` → `addPolygon(coords)`.
4. `drainDraftPoints()` elimina puntos temporales uno por uno (evita crash iOS con `react-native-maps`).

### Filtrado de propiedades (100% client-side)

Las ubicaciones **no se envían al servidor** para filtrar (`mapServerFilters.ts` las excluye explícitamente). Todo el filtrado ocurre en `usePropertyFilters.ts`:

1. **Polígonos** (OR): ray-casting `isPointInPolygon()` para cada polígono dibujado.
2. **Location chips** (OR):
   - Si el chip es tipo `municipio`/`estado`: primero compara **bounds** (lat BETWEEN south/north, lng BETWEEN west/east).
   - Si el chip es tipo `colonia`: solo **text match** (los bounds de Google para colonias son demasiado amplios).
3. **Base location filter** (OR): texto plano como fallback.
4. **Demás filtros** (precio, características, etc.): secuencial.

### Text match por nivel

- `colonia`: compara `p.colonia` con nombre del chip.
- `municipio`: compara `p.municipio` o `p.ciudad`.
- `estado`: compara `p.location.state`.

Todas las comparaciones usan `normalizeStr()` (sin acentos, sin puntuación).

---

## Historial de Fixes (commits)

| Commit | Fix | Problema | Solución |
|--------|-----|----------|----------|
| `acbadfa` | Normalización de caracteres especiales | Punto, apóstrofe, guión y `?` rompían match en `normalizeStr` | Extensión del regex de limpieza |
| `e20041b` | Acentos en fetchProperties | Búsqueda por colonia/municipio no ignoraba acentos | `unaccent()` en columna SQL + valor plano |
| `bf8e0df` | `unaccent` en búsqueda SQL | Consultas a DB no normalizaban acentos | `unaccent(colonia) ILIKE unaccent(...)` |
| `5f0ad22` | Score textual con acentos | "Nicolás" ≠ "Nicolas" rompía el match | Normalizar acentos en score textual (NFD) |
| `d687a2e` | Throttle + búsqueda acentos | Demasiadas animaciones + búsqueda sin acentos | `setFocusRegion` throttle 500ms + `unaccent` en fetchProperties |
| `4865fdc` | Algoritmo de re-rank | Resultados mal ordenados | Score textual primero, grupo geográfico como desempate |
| `7caccf2` | Score textual + unmount safety | Score no se aplicaba + crash al desmontar | Re-rank por score + `mountedRef` en `handleAddLocationChip` |
| `400f756` | Fallback geográfico | < 2 resultados locales | Segunda búsqueda con `"{query}, {estado}"` |
| `e808fa9` | Re-rank client-side | No priorizaba estado del usuario | Re-rank por estado después de Google results |
| `38c3bb4` | Pasar estado en todos los callers | `LocationSearchBar` y `useSearch` no recibían `profile?.estado` | Pasar estado explícitamente |
| `34ac75c` | Location bias + cancelación | Sin bias por estado + crash geocode | Bias por coordenadas + `AbortController` |
| `1efda3a` | Fallback a Supabase | `profile.estado` no disponible | Consulta directa a perfiles si no cargado |
| `eb684ae` | Chip text match fallback | Match por colonia fallaba, no intentaba municipio | Fallback a municipio en `chipTextMatch` |
| `160da9f` | Re-centrar mapa | Propiedades filtradas fuera del `focusRegion` | `animateToRegion` cuando hay properties fuera del viewport |
| `29321c1` | Reset addedSelectedChipRef | No se podía re-seleccionar misma ubicación | Resetear ref al cambiar `selectedLocation` |
| `909f662` | Extraer municipio de chips | `municipio_nombre` venía vacío en chips tipo municipio | Parsear de `secondaryText` de Google + fallback colonia |
| `667f977` | Match por texto tolerante por nivel | Chips no matcheaban propiedades por nivel incorrecto | Match por nivel del chip (colonia vs municipio vs estado) |
| `72cb3de` | No filtrar colonia por bounds | Bounds de Google para colonias son demasiado amplios | Solo text match para chips de tipo colonia |

---

## Archivos Clave

### Motor / Servicios
| Archivo | Rol |
|---------|-----|
| `src/lib/geocodingService.ts` | Llamadas directas a Google Maps API (Places Autocomplete, Place Details, Geocoding, Reverse Geocoding) |
| `src/lib/locationService.ts` | Abstracción sobre geocodingService. `searchLocations()` y `getLocationBounds()` |
| `src/lib/location/types.ts` | Modelo neutral de ubicación (CountryCode, LocationValue, CountryConfig) |
| `src/lib/location/registry.ts` | Resuelve `CountryConfig` por país (MX activo, US template) |
| `src/lib/location/countries/mx.ts` | Configuración México: 32 estados, coordenadas, normalización, `mapGoogleComponents()` |

### Store / Estado
| Archivo | Rol |
|---------|-----|
| `src/store/locationSearchStore.ts` | Estado de búsqueda: suggestions, loading, session tokens, ranking, property counts, fallback |
| `src/store/propertyFiltersStore.ts` | Filtros de propiedades: locationChips, polygons, locationFilter (legacy) |
| `src/context/AppContext.tsx` | selectedLocation (type, name, placeId) — puente entre home y mapa |

### Hooks / Lógica
| Archivo | Rol |
|---------|-----|
| `src/hooks/usePropertyFilters.ts` | Filtrado client-side: ray-casting polígonos, bounds chips, text match chips, locationFilter |
| `src/hooks/useSearch.ts` | Búsqueda global: usuarios, posts, reels, propiedades, ubicaciones |
| `src/hooks/useMapProperties.ts` | Fetch server-side de propiedades con filtros (bounds + texto) |

### UI — Texto
| Archivo | Rol |
|---------|-----|
| `src/components/LocationSearchBar.tsx` | Search bar del home, debounce 300ms, busca ubicaciones + códigos |
| `src/components/search/SearchOverlay.tsx` | Overlay full-screen con tabs (Ubicaciones, etc.) |
| `src/components/HomeHeader.tsx` | Header con LocationSearchBar, maneja selección → navega a mapa |

### UI — Mapa
| Archivo | Rol |
|---------|-----|
| `src/components/map/MapSearch.tsx` | Pantalla principal del mapa: geocoding inicial, zone search, chips, polígonos |
| `src/components/map/SearchFiltersBar.tsx` | Barra superior del mapa: chips de ubicación, botón "Buscar zona" |
| `src/components/map/PropertyMap.tsx` | MapView con markers, clusters (Supercluster), polígonos, drawing mode |

### Utilerías
| Archivo | Rol |
|---------|-----|
| `src/utils/stringNormalizer.ts` | `normalizeStr()` — remueve acentos, puntos, apóstrofes, guiones, `?` |
| `src/utils/mapServerFilters.ts` | Traduce store filters a server query (excluye location chips y polígonos) |

### Legado (aún en uso)
| Archivo | Rol |
|---------|-----|
| `src/components/common/CascadeLocationSelector.tsx` | Selector en cascada Google Places (usado en Create Property) |
| `src/components/common/MultiLevelLocationPicker.tsx` | Picker multi-nivel legacy |
| `src/components/CreateContent/LocationPicker.tsx` | Picker por PIN en mapa para crear propiedades |

### Supabase / RPCs
| Archivo | Rol |
|---------|-----|
| `supabase/contar_propiedades_zonas.sql` | RPC para contar propiedades por zona (usado en locationSearchStore) |
| `supabase/buscar_perfiles.sql` | RPC de búsqueda de perfiles con normalización de acentos |

---

## Diagrama de Flujo Simplificado

```
Usuario escribe texto
       │
       ▼
┌──────────────────┐       ┌──────────────────┐
│  LocationSearch  │       │  Mapa (autocomplete)│
│  Bar / Overlay   │       │  inline            │
└───────┬──────────┘       └───────┬──────────┘
        │                          │
        ▼                          ▼
   Debounce 300ms            Debounce 300ms
        │                          │
        ▼                          ▼
   Google Places              Google Places
   Autocomplete               Autocomplete
   (regions, bias estado)     (sin restricción)
        │                          │
        ▼                          ▼
   locationSearchStore        MapSearch
   • Re-rank geográfico       • getPlaceDetails
   • Score textual            • Crear LocationChip
   • Fallback                 • Centrar mapa
   • Property counts          • addLocationChip
        │                          │
        ▼                          ▼
   ┌─────────────────────────────────────┐
   │       usePropertyFilters            │
   │  (100% client-side)                 │
   │                                     │
   │  • Polígonos (OR, ray-casting)      │
   │  • Chips (OR: bounds + text match)  │
   │  • locationFilter (OR, texto)       │
   │  • Precio, features, etc.           │
   └─────────────────────────────────────┘
        │
        ▼
   Propiedades filtradas
   (mostradas en mapa + lista)
```

---

## Decisiones Arquitectónicas Clave

1. **Filtrado 100% client-side**: Los location chips y polígonos nunca se envían al servidor. Esto evita discrepancias entre mapa y lista causadas por bounds imprecisos de Google Places. El servidor solo recibe filtros de precio, features, etc.

2. **Dos tipos de match por chip**: Los chips de municipio/estado filtran primero por **bounds geográficos** (más precisos), mientras que los chips de colonia filtran solo por **texto** (los bounds de Google para colonias son demasiado amplios).

3. **Normalización agresiva**: Todo string de ubicación se normaliza sin acentos, sin puntuación, sin mayúsculas antes de comparar. Tanto en JS (`normalizeStr`) como en SQL (`unaccent()`).

4. **Geographic bias + fallback**: La búsqueda se sesga al estado del usuario mediante coordenadas en la llamada a Google Places. Si el resultado tiene pocos matches locales, se reintenta con `"{query}, {estado}"` para mejorar precisión.

5. **Session tokens**: Se regeneran por sesión de búsqueda y se refrescan tras llamadas a Place Details para minimizar costos de Google Places API.
