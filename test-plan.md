# Plan de pruebas completo — Fixes de ubicaciones, mapa y búsqueda

## Convenciones
- 🟢 = Prueba de código estático (test-verify-v2.cmd)
- 🔵 = Prueba contra API de Google (verificación remota)
- 🟠 = Prueba funcional en app (requiere TestFlight)

---

## 1. Score textual + re-rank (locationSearchStore.ts)

### 🟢 1.1 — Score textual definido
Verificar que `_score` existe en el código.
```bash
findstr /c:"_score" src/store/locationSearchStore.ts
```

### 🟢 1.2 — Normalización de acentos
Verificar que `normalize("NFD")` se usa en el score.
```bash
findstr /c:"normalize" src/store/locationSearchStore.ts
```

### 🔵 1.3 — Google Places: "San Nicolás Premier" sin bias
```bash
GET https://maps.googleapis.com/maps/api/place/autocomplete/json
  ?input=San%20Nicol%C3%A1s%20Premier
  &components=country:mx&language=es
```
**Esperado:** 1er resultado = `"San Nicolás Premier, Boulevard Juan Pablo II, Aguascalientes, Ags."`

### 🔵 1.4 — Google Places: "San Nicolás Premier" con bias Ags
Ídem 1.3 + `location=21.8853,-102.2916&radius=100000`
**Esperado:** Mismo resultado 1ro, bias no cambia orden (el query ya es específico)

### 🔵 1.5 — Fallback con (regions)
```bash
GET https://maps.googleapis.com/maps/api/place/autocomplete/json
  ?input=San%20Nicol%C3%A1s%20Premier,%20Aguascalientes
  &components=country:mx&language=es&types=(regions)
```
**Esperado:** 1er resultado = `"San Nicolás, Aguascalientes, México"`

### 🟠 1.6 — App: "San Nicolás Premier" orden correcto
1. Loguear con `jdiazarmas@gmail.com` (Aguascalientes)
2. Buscar `"San Nicolás Premier"`
3. **Esperado:** 1ro = "San Nicolás Premier" | 2do = "San Nicolás, Ags."

### 🟠 1.7 — App: "San Nicolás" orden correcto
1. Buscar `"San Nicolás"`
2. **Esperado:** 1ro = "San Nicolás, Ags." (exacto) | luego NL, CDMX, etc.

### 🟠 1.8 — App: "San Nicolas" sin acento
1. Buscar `"San Nicolas"` (sin acento)
2. **Esperado:** mismo orden que 1.6 / 1.7 (acentos normalizados)

### 🟠 1.9 — App: usuario sin estado
1. Usar cuenta sin `profile.estado`
2. Buscar `"San Nicolás"`
3. **Esperado:** orden original de Google (sin re-rank)

---

## 2. Búsqueda por colonia/municipio (useSearch.ts fetchProperties)

### 🟢 2.1 — Normalización de acentos en query Supabase
```bash
findstr /c:"normalize" src/hooks/useSearch.ts
```

### 🟢 2.2 — unaccent en colonia
```bash
findstr /c:"unaccent(colonia)" src/hooks/useSearch.ts
```

### 🔵 2.3 — Google Places: "St Angelo"
```bash
GET https://maps.googleapis.com/maps/api/place/autocomplete/json
  ?input=St%20Angelo&components=country:mx&language=es
```
**Esperado:** 1er resultado = `"ST. ANGELO RESIDENCE, Avenida Eugenio Garza Sada, Aguascalientes, Ags."`

### 🔵 2.4 — Google Places: "San Angelo" (sin St)
```bash
GET https://maps.googleapis.com/maps/api/place/autocomplete/json
  ?input=San%20Angelo%20Residence&components=country:mx&language=es
```
**Esperado:** 0 resultados (Google solo reconoce "St Angelo")

### 🟠 2.5 — App overlay general: "St Angelo" encuentra propiedades
1. Abrir overlay de búsqueda (home)
2. Buscar `"St Angelo"`
3. **Esperado:** Aparecen propiedades en sección "Fichas" con colonia = "St Ángelo Residence"

### 🟠 2.6 — App overlay general: "St Ángelo" con acento
1. Buscar `"St Ángelo"` (con acento)
2. **Esperado:** Mismas propiedades que 2.5

### 🟠 2.7 — App overlay general: "Jesús María" vs "San Angelo"
1. Buscar `"Jesús María"`
2. **Esperado:** Aparecen propiedades en Jesús María
3. Buscar `"San Angelo"`
4. **Esperado:** Aparecen propiedades con colonia que contiene "Angelo"

### 🟠 2.8 — App overlay general: código de propiedad (regresión)
1. Buscar código existente (ej. `"ILY-00123"`)
2. **Esperado:** la propiedad aparece (codigo_propiedad se conserva)

### 🟠 2.9 — App overlay general: término sin propiedades
1. Buscar término sin propiedades
2. **Esperado:** 0 fichas, sin errores

---

## 3. Throttle de setFocusRegion (MapSearch.tsx)

### 🟢 3.1 — focusThrottleRef definido
```bash
findstr /c:"focusThrottleRef" src/components/map/MapSearch.tsx
```

### 🟢 3.2 — setFocusRegionThrottled definida
```bash
findstr /c:"setFocusRegionThrottled" src/components/map/MapSearch.tsx
```

### 🟢 3.3 — Timeout 400ms presente
```bash
findstr /c:"400" src/components/map/MapSearch.tsx
```

### 🟠 3.4 — Múltiples búsquedas rápidas en mapa
1. Abrir mapa
2. Buscar "San Nicolás", "Jesús María", "Loretta" en <1s cada una
3. **Esperado:** Sin crash. Mapa centra en la última.

### 🟠 3.5 — Cinco búsquedas consecutivas
1. Realizar 5 búsquedas seguidas en el mapa
2. **Esperado:** Sin crash

---

## 4. mountedRef en handleAddLocationChip (MapSearch.tsx)

### 🟢 4.1 — mountedRef presente
```bash
findstr /c:"mountedRef" src/components/map/MapSearch.tsx
```

### 🟢 4.2 — Guard mountedRef antes de addLocationChip
```bash
findstr /c:"mountedRef.current) return" src/components/map/MapSearch.tsx
```

### 🟠 4.3 — Clic rápido en 2 sugerencias
1. Buscador de zonas abierto
2. Click rápido en 2 sugerencias diferentes
3. **Esperado:** Sin crash. Chips se agregan sin duplicados problemáticos.

### 🟠 4.4 — Cerrar buscador durante carga
1. Abrir buscador de zonas
2. Seleccionar sugerencia
3. Cerrar inmediatamente (botón X)
4. **Esperado:** Sin error

---

## 5. SelectionModal (selector de estado en EditProfile)

### 🟢 5.1 — KeyboardAvoidingView presente
```bash
findstr /c:"KeyboardAvoidingView" src/components/modals/SelectionModal.tsx
```

### 🟢 5.2 — keyboardVerticalOffset definido
```bash
findstr /c:"keyboardVerticalOffset" src/components/modals/SelectionModal.tsx
```

### 🟠 5.3 — Selector con teclado visible
1. Ir a Editar Perfil
2. Tocar campo Ubicación
3. Escribir texto
4. **Esperado:** Lista visible, no oculta por teclado

### 🟠 5.4 — Sin resultados
1. Escribir texto sin match
2. **Esperado:** Mensaje "No se encontraron resultados" visible

### 🟠 5.5 — Seleccionar estado
1. Escribir "Aguascalientes"
2. Tocar resultado
3. **Esperado:** Modal se cierra, campo muestra "Aguascalientes"

---

## 6. expandedSections en SearchOverlay

### 🟢 6.1 — Reset al abrir overlay
```bash
findstr /c:"setExpandedSections(new Set())" src/components/search/SearchOverlay.tsx
```

### 🟠 6.2 — Ver más / Ver menos
1. Buscar término con 5+ ubicaciones
2. **Esperado:** 2 ubicaciones + "Ver todos (5)"
3. Tocar "Ver todos" → muestra 5, botón cambia a "Ver menos"
4. Tocar "Ver menos" → vuelve a 2

### 🟠 6.3 — Cerrar y abrir overlay
1. Expandir ubicaciones
2. Cerrar overlay (swipe down)
3. Abrir de nuevo
4. **Esperado:** Sección colapsada

---

## 7. app.json — Configuración de cuenta

### 🟢 7.1 — Updates deshabilitados
```bash
findstr /c:"enabled" app.json | findstr /c:"false"
```

### 🟢 7.2 — Owner correcto
```bash
findstr /c:"imightbewrong" app.json
```

### 🟢 7.3 — projectId correcto
```bash
findstr /c:"fc0a5782" app.json
```

---

## 8. Sin Sentry

### 🟢 8.1 — Sentry ausente de package.json
```bash
findstr /c:"@sentry" package.json
```

### 🟢 8.2 — Sentry ausente de _layout.tsx
```bash
findstr /c:"Sentry" src/app/_layout.tsx
```

---

## 9. Regresiones críticas

### 🟠 9.1 — Búsqueda "Loretta" desde home
1. Buscar "Loretta" en overlay general
2. **Esperado:** Aparecen propiedades en Loretta

### 🟠 9.2 — Editar Perfil y guardar
1. Ir a Editar Perfil
2. Modificar nombre
3. Guardar
4. **Esperado:** Sin error, datos guardados

### 🟠 9.3 — Apertura de app 3 veces seguidas
1. Abrir app
2. Cerrar
3. Repetir 3 veces
4. **Esperado:** Sin crash en ninguna apertura

---

## Resumen de tipos de prueba

| Tipo | Cantidad | Descripción |
|------|----------|-------------|
| 🟢 Código | 15 | Verificación de patrones en archivos (test-verify-v2.cmd) |
| 🔵 API Google | 4 | Llamadas directas a Google Places API |
| 🟠 Funcional | 19 | Pruebas manuales en app (TestFlight) |
| **Total** | **38** | |
