# Informe de crashes por saturación

## 1. Crash al hacer búsquedas rápidas en el mapa

### Síntoma
Al cambiar de búsqueda varias veces seguidas (buscar, volver, buscar de nuevo), la app se congela y crashea. Parece saturación del puente nativo.

### Causas identificadas

#### 1A — Bug en `hasFitFilteredRef` (PropertyMap.tsx:464)

```typescript
const hasFitFilteredRef = useRef<string | null>(null);
// ...
hasFitFilteredRef.current = true;  // boolean asignado a string | null
```

Asigna `true` (booleano) a un ref tipado como `string | null`. Después de esta asignación, la guarda `hasFitFilteredRef.current === regionKey` (comparación string contra booleano) nunca matchea, por lo que el efecto de re-centrado (líneas 445-477) se ejecuta en CADA render con `properties` + `focusRegion`, no solo la primera vez.

Cada búsqueda nueva dispara:
- `animateToRegion` → `onRegionChangeComplete` → más efectos → más animaciones
- Efecto cascada que se acelera con cada búsqueda

**Commit que lo corrigió parcialmente:** `9bdd94f`
**Fix:** Cambiar a `hasFitFilteredRef.current = regionKey`.

---

#### 1B — `updateOverlayPositions` satura el puente nativo (PropertyMap.tsx:228-332)

Se llama desde 3 lugares:
- `onRegionChange` (cada frame de animación, throttled a ~30fps) — línea 658
- `onRegionChangeComplete` — línea 663
- `useEffect` en cambios de `properties.length` — línea 338

Dentro hace:
```typescript
const limitedProps = visibleProps.slice(0, 500);
const propPromises = limitedProps.map(async (p) => {
    const point = await nativeMapRef.current.pointForCoordinate({...});
    newPositions[p.id] = point;
});
await Promise.all(propPromises);
```

Hasta **500 promesas `pointForCoordinate`** por llamada, todas cruzando el puente nativo. El throttle (`isCalculatingRef`) evita solapamiento pero no detiene ejecuciones en vuelo ni las re-programa si una se salta. Con búsquedas rápidas encadenando animaciones, se acumulan cientos de promesas en el puente.

---

#### 1C — `geocode()` sin cancelación (MapSearch.tsx:155-215)

El `useEffect` de `selectedLocation` lanza `geocode()` asíncrono:

```typescript
useEffect(() => {
    if (!selectedLocation) { ... return; }
    const geocode = async () => {
        // getPlaceDetails(...) — network fetch
        // setFocusRegion(...)
        // addSelectedAsChip(...)
    };
    geocode();
}, [selectedLocation]);
```

Si el usuario cambia de búsqueda rápidamente:
- Múltiples `getPlaceDetails` en paralelo
- Cada uno resuelve y llama `setFocusRegion` + `addSelectedAsChip`
- No hay cancelación de las promesas anteriores
- Cada `setFocusRegion` dispara el efecto de animación en PropertyMap (punto 1B)

### Diagnóstico consolidado
Los 3 problemas se potencian entre sí: bug tipo → animaciones extras → `pointForCoordinate` backlog → saturación del puente nativo → crash.

No hay un solo fix que resuelva todo. Se requiere:
1. Corregir el tipo de `hasFitFilteredRef` (ya resuelto en `9bdd94f`)
2. Agregar cancelación de promesas en `geocode()` y `updateOverlayPositions`
3. Limitar/reducir llamadas a `pointForCoordinate`

---

## 2. Crash al cerrar modal antes de compartir PDF

### Síntoma
Usuario tocaba "Descargar PDF" y cerraba el `SharePropertyModal` antes de que el PDF terminara de generarse. La app se congelaba al intentar mostrar el diálogo nativo de compartir (`Sharing.shareAsync`) sobre un modal ya desmontado.

### Causa raíz
`downloadPdf()` no tenía conciencia de que el modal se había cerrado. Una vez generado el PDF, llamaba incondicionalmente a `Sharing.shareAsync()` y luego a `onClose()`. Si el modal ya no estaba en la jerarquía, el share sheet nativo se presentaba sobre un view controller inexistente, congelando la app.

### Commit que lo corrigió
```
578fba8 fix: cancelar generacion de PDF si el modal se cierra para evitar freeze
```

### Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `src/services/pdfService.ts` | +4 líneas |
| `src/components/modals/SharePropertyModal.tsx` | +21/-20 líneas |

### Solución implementada

Se agregó un `cancelledRef` (boolean persistente vía `useRef`) que se activa cuando `visible` pasa a `false`:

```typescript
// SharePropertyModal.tsx
const cancelledRef = useRef(false);

useEffect(() => {
    if (!visible) {
        cancelledRef.current = true;
    }
}, [visible]);
```

El ref se pasa como `signal` a `pdfService.generateAndOpenPropertyPdf()`:

```typescript
const result = await pdfService.generateAndOpenPropertyPdf(
    propertyId, includeAllData, cancelledRef,
);
```

En `pdfService.ts`, antes de llamar `Sharing.shareAsync()`, se verifica:

```typescript
if (signal?.aborted) return { filePath: newPath, opened: false };
```

Además, en `downloadPdf()` se agregaron guards en cada etapa:
- Al inicio: `if (downloading || cancelledRef.current) return;`
- Después del PDF: `if (cancelledRef.current) return;`
- Antes de `onClose()`: `if (!cancelledRef.current) { onClose(); }`
- En el catch: `if (cancelledRef.current) return;`

Esto evita doble llamado a `onClose()` y toasts de error espurios después de que el usuario ya cerró el modal.

### Patrón usado
`useRef` booleano como flag de cancelación. Misma técnica usada en `usePublishProperty.ts` para cancelar publicación de propiedades.

### Lecciones
- Las operaciones costosas (fetch + generar HTML + print PDF) no se cancelan porque Expo no lo soporta, pero el **efecto visible al usuario** (share sheet) se salta si el modal ya no está.
- El flag debe ser `useRef`, no `useState`, para que la función asíncrona pueda leer el valor actual sin depender de re-renders.
