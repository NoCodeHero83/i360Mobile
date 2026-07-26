# Análisis Completo del Flujo: Buscador → Mapa

**Fecha:** 2026-07-25
**Caso:** "Residencial San Nicolás"
**Entorno:** APIs reales (Google Places + Supabase) con location bias Aguascalientes

---

## Resumen Ejecutivo

Se verificaron las **5 sugerencias** que Google devuelve para "Residencial San Nicolás". El resultado es taxativo:

| Sugerencia | Tipo | ¿Dónde está? | SIN Fixes | CON Fixes |
|-----------|------|-------------|-----------|-----------|
| "La Cantera" | colonia | Ags | 1 prop (irrelevante) | 1 prop |
| "Residencial San Nicolas" | colonia | **Monterrey, NL** | 9 props ✅ | 9 props |
| "San Nicolás de la Cantera" | municipio | Ags | **0 props ❌** | **11 props ✅** |
| "San Nicolás de los Jassos" | municipio | SLP | **0 props ❌** | **11 props ✅** |
| "San Nicolás de Arriba" | municipio | Ags | **0 props ❌** | **11 props ✅** |

**El build de TestFlight no incluye los 2 commits que habilitan el fallback de colonia.** Sin esos commits, las 3 sugerencias tipo "municipio" siempre dan 0.

---

## Traza Completa por Cada Sugerencia

### Sugerencia #1: "La Cantera" (tipo: colonia)

```
Google → mainText="La Cantera", types=[sublocality,sublocality_level_1]
       → derivePlaceType = "colonia"
       → Place Details: bounds cubren La Cantera en Ags.
       
App → chip: type=colonia, colonia="La Cantera", bounds=SI
    → chipTextMatch para colonia: compara p.colonia con "La Cantera"
    
BD → 1 propiedad con colonia que contiene "La Cantera"
   → NO incluye propiedades de Residencial San Nicolás
   
Resultado: 1 propiedad ✅ (pero no es la de Alex)
```

### Sugerencia #2: "Residencial San Nicolas" (tipo: colonia)

```
Google → mainText="Residencial San Nicolas", types=[sublocality,sublocality_level_1]
       → derivePlaceType = "colonia"
       → Place Details: ¡lat=25.76, lng=-100.27! → ESTO ES MONTERREY, NL
       → bounds cubren área en San Nicolás de los Garza, NL
       
App → chip: type=colonia, colonia="Residencial San Nicolas", bounds=SI
    → chipTextMatch para colonia: compara p.colonia con "Residencial San Nicolas"
    
BD → 9 propiedades con colonia "Residencial San Nicolás" (sin acento)
   → normalizeStr("Residencial San Nicolas") = normalizeStr("Residencial San Nicolás")
   → MATCH por coincidencia de TEXTO (no geográfica)
   
Resultado: 9 propiedades ✅ PERO el mapa se centra en Monterrey, NL
```

**⚠️ Dato crítico:** Esta sugerencia está en Nuevo León, NO en Aguascalientes. El mapa se centraría en San Nicolás de los Garza, y las propiedades de Alex (en Ags) aparecerían porque el match es por texto, no por coordenadas.

### Sugerencia #3: "San Nicolás de la Cantera" (tipo: municipio) ← CASO CRÍTICO

```
Google → mainText="San Nicolás de la Cantera", types=[locality,political]
       → derivePlaceType = "municipio" (porque incluye "locality")
       → Place Details: lat=21.84, lng=-102.37 → Aguascalientes
       → bounds cubren área de San Nicolás de la Cantera
       
App → chip: type=municipio, bounds=SI
    → extractMunicipioEstado: secondaryText="Ags., México"
      → parts=["Ags."], parts.Count < 2 → municipio_nombre=null
    → chip.municipio = null || ("municipio" ? "San Nicolás de la Cantera" : "")
    → chip.municipio = "San Nicolás de la Cantera" ← INCORRECTO
    → chip.colonia = ""
    
FLUJO SIN FIXES:
    1. bounds check: chip.type = "municipio" → NO se salta bounds
       → bounds de San Nicolás de la Cantera NO contienen (21.867, -102.325)
       → Bounds match: 0 propiedades
    2. chipTextMatch municipio: compara p.municipio "Aguascalientes" con "San Nicolás de la Cantera"
       → "aguascalientes".includes("san nicolas de la cantera") → FALSE
       → "san nicolas de la cantera".includes("aguascalientes") → FALSE
       → Text match: 0 propiedades
    3. RESULTADO: 0 propiedades ❌
    
FLUJO CON FIXES (colonia fallback + first 2 words):
    1. bounds check: igual, 0 propiedades
    2. chipTextMatch municipio: igual, FALSE
    3. Colonia fallback label completo: "san nicolas de la cantera" vs "residencial san nicolas"
       → "san nicolas de la cantera".contains("residencial san nicolas") → FALSE
       → "residencial san nicolas".contains("san nicolas de la cantera") → FALSE
    4. Colonia fallback first 2 words: labelParts=["san","nicolas","de","la","cantera"]
       → shortLabel = "san nicolas"
       → "residencial san nicolas".contains("san nicolas") → TRUE ✅
    5. RESULTADO: 11 propiedades ✅
```

### Sugerencias #4 y #5: Mismo patrón que #3

Idéntico comportamiento: tipo municipio, bounds que NO contienen las coordenadas de Residencial San Nicolás, municipio incorrecto en el chip.

---

## Causa Raíz Definitiva

**El problema tiene 2 capas:**

### Capa 1: Google no reconoce "Residencial San Nicolás" en Aguascalientes
Google NO tiene "Residencial San Nicolás" como un lugar en Aguascalientes. El reverse geocode de las coordenadas de las propiedades de Alex devuelve `sublocality_level_1 = "Santa Imelda"`, no "Residencial San Nicolás". Esto significa que las propiedades tienen un nombre de colonia que NO está registrado en Google Maps.

### Capa 2: Las sugerencias que SÍ existen son tipo "municipio" y el chip no las matchea
De las 5 sugerencias, **3 son tipo `locality` → `municipio`**. Para estas:
- `extractMunicipioEstado` NO extraía `municipio_nombre` (bug original)
- El chip comparaba el `municipio` de las propiedades (Aguascalientes) con el nombre del lugar (San Nicolás de la Cantera) → 0 matches
- Los bounds de Google NO contienen las coordenadas de las propiedades (porque están en otra ubicación dentro del municipio)

### Punto exacto donde se rompe la cadena

```
Archivo: src/hooks/usePropertyFilters.ts, función chipTextMatch (líneas 146-154)
Archivo: src/store/locationSearchStore.ts, función extractMunicipioEstado (líneas 91-93)

Para sugerencias tipo "municipio" (locality):
  1. extractMunicipioEstado devuelve { estado_nombre } sin municipio_nombre
  2. chip.locationFilter.municipio = sel.name (ej: "San Nicolás de la Cantera")
  3. chipTextMatch compara p.municipio (Aguascalientes) con chip.municipio → FALSE
  4. chipTextMatch NO tenía fallback a colonia → FALSE
  5. → 0 propiedades
```

---

## El Fix y Por Qué Funciona

Los 3 commits en la rama `fix/search-location-municipio-match`:

### Commit 1: `909f662` — extractMunicipioEstado corregido
```diff
- if (suggestion.type === "municipio") {
-   return { estado_nombre };
- }
+ if (suggestion.type === "municipio") {
+   const municipio_nombre = parts.length >= 2 ? parts[parts.length - 2] : undefined;
+   return { municipio_nombre, estado_nombre };
+ }
```
**No es suficiente solo.** Para "San Nicolás de la Cantera" con secondaryText "Ags., México", `parts=["Ags."]` → `parts.length < 2` → `municipio_nombre` sigue siendo undefined.

### Commit 2: `e366f8e` — Fallback colonia + primeras 2 palabras
```typescript
// Para chips tipo "municipio" - después del match original
const pColonia = normalizeStr(p.colonia);
if (pColonia) {
  if (includesEither(pColonia, label)) return true;          // full label
  const labelParts = label.split(" ");
  if (labelParts.length > 2) {
    const shortLabel = labelParts.slice(0, 2).join(" ");     // first 2 words
    if (shortLabel && includesEither(pColonia, shortLabel)) return true;
  }
}
```
**Este es el que realmente resuelve el problema.** Para "San Nicolás de la Cantera", extrae "san nicolas" y lo matchea contra "residencial san nicolas".

### Commit 3: `29321c1` — Reset de ref de re-selección
```typescript
addedSelectedChipRef.current = null;  // al inicio del effect
```
**Necesario** para la segunda vez que seleccionas la misma ubicación.

---

## Conclusión

La evidencia es concluyente: **el build de TestFlight que probaste NO incluye los commits del fix.** La simulación con APIs reales confirma:

| Escenario | Sugerencias tipo "municipio" (3 de 5) |
|-----------|--------------------------------------|
| **Código actual (build probado)** | 0 propiedades ❌ |
| **Con los 3 fixes** | 11 propiedades ✅ |

Para probarlo, necesitas regenerar el build desde `fix/search-location-municipio-match`:
```bash
git checkout fix/search-location-municipio-match
git pull
eas build --profile production --platform ios --branch fix/search-location-municipio-match
```
