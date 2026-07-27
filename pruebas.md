# Prueba: Priorización geográfica en el buscador de ubicaciones

## Objetivo

Verificar que, al buscar una ubicación, los primeros resultados correspondan a las ubicaciones geográficamente más cercanas al usuario registrado, o idealmente a su mismo estado/ciudad.

---

## Usuario de prueba

| Campo | Valor |
|-------|-------|
| Email | `jdiazarmas@gmail.com` |
| Ubicación registrada | **Aguascalientes** |
| Coordenadas de referencia | `21.8853, -102.2916` (centro del estado) |

> La ubicación se obtuvo del campo `estado` en el perfil del usuario (`perfiles.estado`).
> Se mapea a coordenadas vía `COORDENADAS_ESTADO_MX` en `src/lib/location/countries/mx.ts`.

---

## Término de búsqueda

```
San Nicolás
```

---

## Resultado esperado (con fix)

Si existen resultados de "San Nicolás" en Aguascalientes o zonas cercanas, deben aparecer **primero** en la lista. El orden de prioridad debe ser:

1. Resultados dentro del mismo estado del usuario (Aguascalientes).
2. Resultados en estados geográficamente cercanos.
3. Resultados progresivamente más lejanos.

Para "San Nicolás" en Aguascalientes, se espera ver:
- **San Nicolás, Aguascalientes** como primer resultado (o dentro de los primeros).
- Resultados de CDMX, Nuevo León, etc. deben aparecer después.

---

## Comportamiento actual (sin fix)

Actualmente Google Places Autocomplete se llama **sin** `location` ni `radius`, por lo que Google ordena por relevancia global sin bias geográfico.

Resultado típico actual para "San Nicolás" desde Aguascalientes:

| # | Resultado (Google) | Estado | Distancia aprox. desde Ags. |
|---|-------------------|--------|---------------------------|
| 1 | San Nicolás de los Garza | **Nuevo León** | ~380 km |
| 2 | San Nicolás, CDMX | **Ciudad de México** | ~470 km |
| 3 | San Nicolás, Estado de México | **Estado de México** | ~460 km |
| 4 | San Nicolás de la Cantera | **Aguascalientes** | ~5 km |
| 5 | San Nicolás, Jalisco | **Jalisco** | ~180 km |

**Problema:** "San Nicolás de la Cantera" (Aguascalientes, ~5 km del usuario) aparece en la **posición 4**, después de resultados de otros estados. El usuario tiene que escribir "San Nicolás Premier" para ver resultados de Ags. primero.

---

## Cómo ejecutar la prueba

### Prerrequisitos

- App compilada en TestFlight (o build de desarrollo)
- Usuario `jdiazarmas@gmail.com` con sesión iniciada
- Perfil del usuario con `estado: "Aguascalientes"`

### Pasos

1. Abrir la app y asegurarse de que el usuario tiene sesión iniciada.
2. Ir al buscador principal (home / LocationSearchBar).
3. Escribir **"San Nicolás"** en el campo de búsqueda.
4. Esperar a que aparezcan las sugerencias.
5. Registrar el orden de los resultados mostrados.
6. Repetir desde el buscador de zonas dentro del mapa (MapSearch).
7. Repetir desde el overlay de búsqueda general (SearchOverlay).

### Qué registrar

- [ ] Resultados mostrados en el buscador principal (LocationSearchBar)
- [ ] Resultados mostrados en el buscador de zonas del mapa (MapSearch)
- [ ] Resultados mostrados en el overlay general (useSearch / SearchOverlay)
- [ ] ¿Aparece "San Nicolás de la Cantera" (Ags.) primero?
- [ ] ¿Los resultados de CDMX/NL aparecen después?
- [ ] Si no hay bias, ¿la posición de Ags. sigue siendo la #4?

---

## Criterio de aceptación

La prueba se considera **exitosa** si:

1. **"San Nicolás de la Cantera"** (Ags.) aparece en la **posición 1 o 2** de la lista de sugerencias.
2. Ningún resultado de otros estados aparece antes que el de Aguascalientes (a menos que no exista ningún resultado en Ags.).
3. El comportamiento es consistente en los 3 callers (LocationSearchBar, MapSearch, SearchOverlay).
4. Si el perfil no tiene `estado` o el usuario no está logueado, el comportamiento es el mismo que antes (sin bias, orden de Google por defecto).

---

## Notas

- El fix ya está implementado en la branch `fix/search-location-municipio-match` (commits `8434554` y `6e75cfc`).
- El bias se aplica pasando `location` + `radius=100000` a la API de Google Places Autocomplete.
- No se usa `strictbounds`, por lo que resultados de otros estados siguen apareciendo, solo que más abajo.
- Si `profile?.estado` no existe o no matchea una key en `level1Coords`, el bias se omite (fallback al comportamiento original).
- Las pruebas deben ejecutarse en un build **sin** los commits de fix para documentar el problema, y luego con el fix para validar la solución.
