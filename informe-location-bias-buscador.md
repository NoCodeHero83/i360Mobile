# Location Bias en Google Places Autocomplete

## Problema

Cuando un usuario tipea "San Nicolás", Google Places devuelve 5 sugerencias. Las primeras pueden ser de CDMX aunque el usuario sea de Aguascalientes. El usuario tiene que tipear "San Nicolás Premier" para obtener resultados de Aguascalientes.

La experiencia ideal (como Uber): las primeras opciones corresponden al estado del usuario.

## Análisis técnico

### Estado actual

`searchPlaces()` en `src/lib/geocodingService.ts:137-144` solo pasa `components: country:mx` como restricción:

```typescript
const params = new URLSearchParams({
    input: query,
    components: config.placesComponents,  // "country:mx"
    language: "es",
    key: GOOGLE_API_KEY,
    ...(token ? { sessiontoken: token } : {}),
    ...(types ? { types } : {}),
});
```

No hay bias por ubicación. Google ordena por relevancia global.

### Datos disponibles

El perfil del usuario (`perfiles`) tiene:
- `estado` — nombre del estado (ej. "Aguascalientes")
- `pais` — código del país (ej. "MX")

Ya existe `COORDENADAS_ESTADO_MX` en `src/lib/location/countries/mx.ts:54-87` con coordenadas centrales de los 32 estados.

### API de Google Places Autocomplete

Soporta los parámetros:
- `location` — coordenada `lat,lng` para centrar el bias
- `radius` — radio en metros (ej. 100000 = 100 km para cubrir un estado)
- `strictbounds` — opcional, si se necesita EXCLUIR resultados fuera del área

Documentación: https://developers.google.com/maps/documentation/places/web-service/autocomplete

## Cambio propuesto

### 1. Modificar `searchPlaces()` para aceptar location bias

**Archivo:** `src/lib/geocodingService.ts`

Agregar parámetros opcionales `location` y `radius`:

```typescript
export async function searchPlaces(
    query: string,
    token?: string,
    country?: CountryCode | string | null,
    types?: string,
    location?: { lat: number; lng: number },
    radius?: number,
): Promise<PlaceSuggestion[]> {
    // ... existing code ...
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
    // ...
}
```

### 2. Propagar el parámetro en `locationService.searchLocations()`

**Archivo:** `src/lib/locationService.ts`

Agregar `location` y `radius` opcionales y pasarlos a `searchPlaces()`.

### 3. Obtener la ubicación desde el perfil del usuario

En los callers (`locationSearchStore.searchLocations`, `useSearch`), leer `profile.estado` desde `useAuth()` y resolver las coordenadas vía `COORDENADAS_ESTADO_MX`.

Ejemplo de resolución de coordenadas:

```typescript
import { COORDENADAS_ESTADO_MX } from "@/lib/location/countries/mx";

function getStateCoords(estado: string): { lat: number; lng: number } | null {
    return COORDENADAS_ESTADO_MX[estado] ?? null;
}
```

### 4. Radio sugerido

- `radius: 100000` (100 km) — suficiente para cubrir un estado completo
- Sin `strictbounds` — permite que resultados fuera del estado aparezcan en "ver más"

## Efecto esperado

| Búsqueda | Sin bias | Con bias |
|----------|----------|----------|
| "San Nicolás" (usuario en Ags.) | "San Nicolás, CDMX", "San Nicolás, NL", ... | "San Nicolás, Aguascalientes" primero |
| "San Nicolás Premier" (usuario en Ags.) | "San Nicolás Premier, Ags." | "San Nicolás Premier, Ags." (sin cambio) |
| "St Angelo Reyes" (cualquier usuario) | Sin cambio (es único en MX) | Sin cambio |

## Lo que NO resuelve

El bug de matching de propiedades cuando un término es clasificado como `colonia` por `derivePlaceType()` (ej. "St Angelo Reyes"). Eso está cubierto por el fix de fallback a municipio en `chipTextMatch`.

## Consideraciones

- **Fallback**: si no hay usuario logueado o no tiene `estado`, se omite el bias (comportamiento actual).
- **Coordenadas por estado**: `COORDENADAS_ESTADO_MX` tiene centro aproximado de cada estado. Suficiente para bias de Places.
- **Países adicionales**: si se soportan más países en el futuro, cada `CountryConfig` podría tener `level1Coords`.
- **Usuarios de CDMX**: "Ciudad de México (CDMX)" es la clave en `COORDENADAS_ESTADO_MX`. El perfil guarda "Ciudad de México" o "CDMX" — verificar normalización.

## Implementación

Archivos a modificar:
- `src/lib/geocodingService.ts` — agregar `location` + `radius` a `searchPlaces()`
- `src/lib/locationService.ts` — propagar `location` + `radius` en `searchLocations()`
- `src/store/locationSearchStore.ts` — pasar ubicación del usuario al llamar `searchLocations()`
- Posible: `src/hooks/useSearch.ts` — pasar ubicación en la búsqueda general
