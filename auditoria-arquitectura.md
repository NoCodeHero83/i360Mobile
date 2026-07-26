# Auditoría de Arquitectura — IlyroxMobile

**Fecha:** 2026-07-25
**Proyecto:** Ilyrox — Red social inmobiliaria (React Native / Expo SDK 54)
**Backend:** Supabase (PostgreSQL + RPCs + Realtime)
**Estado:** Producción (335 propiedades, ~20+ usuarios activos)

---

## 1. VISIÓN GENERAL DE LA ARQUITECTURA

```
┌─────────────────────────────────────────────────────────┐
│                    React Native App                      │
│  ┌─────────────────────────────────────────────────────┐│
│  │              Expo Router (File-based)                ││
│  │  (tabs) → Feed, Stats, Create, Profile              ││
│  │  (stack) → Map, Property, Messages, Matches...      ││
│  │  (auth) → Login, Register, Forgot Password           ││
│  ├─────────────────────────────────────────────────────┤│
│  │         State Management (3 Capas)                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ││
│  │  │ Zustand  │  │ React   │  │ useState/useRef  │  ││
│  │  │ (UI/Fmt) │  │ Query   │  │ (ephemeral)      │  ││
│  │  │ 6 stores │  │ (Cache) │  │                  │  ││
│  │  └──────────┘  └──────────┘  └──────────────────┘  ││
│  ├─────────────────────────────────────────────────────┤│
│  │           Services + Supabase Client                 ││
│  └─────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────┤
│                     Supabase / PostgreSQL                │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  ││
│  │ Tablas   │  │ RPCs     │  │ SECURITY DEFINER     │  ││
│  │ 25+      │  │ 20+      │  │ Triggers (síncronos) │  ││
│  └──────────┘  └──────────┘  └──────────────────────┘  ││
└─────────────────────────────────────────────────────────┘
```

---

## 2. BASE DE DATOS — SUPABASE

### 2.1 Estado Actual

| Aspecto | Diagnóstico | Impacto a escala |
|---------|-------------|------------------|
| **Índices** | ❌ **CERO índices definidos** en los 21 archivos SQL desplegados | **CRÍTICO.** Sin índices en `propiedades`, cada consulta de matching es un sequential scan completo |
| **RLS (Row Level Security)** | ❌ No hay políticas RLS definidas. Todo el control de acceso es vía `SECURITY DEFINER` en funciones | Las funciones con `SECURITY DEFINER` puentean RLS — si alguna tabla no tiene RLS habilitado, está expuesta |
| **PostGIS** | ⚠️ Usa ST_Contains pero **reconstruye geometría desde JSONB** en cada llamada. Sin índice GiST | Con +1000 propiedades, cada evaluación de polígono hará full scan |
| **Triggers de matching** | ❌ **Síncronos.** Al crear/editar una propiedad, itera TODAS las búsquedas guardadas activas | **O(P × S).** 500 propiedades × 200 búsquedas = 100,000 iteraciones con subconsultas |
| **pg_cron** | ❌ No desplegado. El archivo `scripts/match_queue_migration.sql` propone cola asíncrona pero no está implementado | Sin cola asíncrona, los triggers pueden hacer timeout en operaciones concurrentes |
| **Paginación** | ⚠️ `LIMIT/OFFSET` en `get_reels_feed_paged`. `LIMIT 500` en `handle_search_change_match` | OFFSET se vuelve lento con +10K filas. LIMIT 500 excluye propiedades antiguas del matching |
| **Full-text search** | ❌ No usa tsvector/tsquery. Todo es `LOWER(TRIM())` + `LIKE` + `unnest()` | No escalable para búsqueda de texto. GIN indexes en arrays mejorarían 10-100x |

### 2.2 Cuellos de Botella Identificados

#### 🔴 CRÍTICO: Sistema de Matching O(P × S)

El flujo actual cuando se crea/actualiza una propiedad:

```
1. Trigger: handle_property_change_match() se dispara
2. FOR v_search IN (SELECT * FROM busquedas_guardadas WHERE activa = TRUE)
     3. evaluar_par_match(v_prop.id, v_search.id)
        4. Múltiples subconsultas con unnest() y EXISTS()
        5. PostGIS ST_Contains reconstruyendo polígonos desde JSONB
        6. 10+ comparaciones de campo (precio, cuartos, m², comisión)
        7. INSERT o UPDATE en matches
   END LOOP
2. FOR v_search IN (...)  -- 200 búsquedas = 200 iteraciones
```

Con 500 propiedades y 200 búsquedas activas, una operación de guardado puede ejecutar **100,000 evaluaciones de par**. En PostgreSQL, esto puede tomar varios segundos y bloquear la tabla.

#### 🔴 CRÍTICO: Sin Índices en Tablas Principales

| Tabla | Columnas consultadas sin índice | Patrón |
|-------|-------------------------------|--------|
| `propiedades` | `activo`, `deleted_at`, `status`, `created_by` | Filtro en CADA consulta de matching |
| `propiedades` | `latitud`, `longitud` | Bounding box BETWEEN |
| `propiedades` | `estado`, `municipio`, `colonia`, `ciudad` | `normalizar_ubicacion()` + unnest |
| `busquedas_guardadas` | `activa`, `deleted_at`, `usuario_id` | Primer filtro en matching |
| `matches` | `propiedad_id`, `busqueda_id`, `activo` | UPSERT + lookup |

#### 🟡 ALTO: Función `contar_propiedades_zonas`

Por cada sugerencia del buscador (50+), ejecuta un `SELECT COUNT(*)` correlacionado. Con 335 propiedades es aceptable; con 10,000 son 50+ count scans completos.

### 2.3 Recomendaciones BD

#### Prioridad Inmediata (P0)

```sql
-- 1. Índice compuesto para filtro de propiedades activas
CREATE INDEX IF NOT EXISTS idx_propiedades_active_pub
  ON propiedades (deleted_at, activo, status)
  WHERE deleted_at IS NULL AND activo = TRUE;

-- 2. Índice para bounding box
CREATE INDEX IF NOT EXISTS idx_propiedades_coords
  ON propiedades (latitud, longitud);

-- 3. Índice para creador (usado en auto-exclusión de matches)
CREATE INDEX IF NOT EXISTS idx_propiedades_created_by
  ON propiedades (created_by);

-- 4. Búsquedas activas
CREATE INDEX IF NOT EXISTS idx_busquedas_activas
  ON busquedas_guardadas (activa, deleted_at)
  WHERE activa = TRUE AND deleted_at IS NULL;

-- 5. Matches upsert
CREATE INDEX IF NOT EXISTS idx_matches_lookup
  ON matches (propiedad_id, busqueda_id) INCLUDE (activo, tipo_match);
```

#### Prioridad Alta (P1)

```sql
-- 6. GIN indexes para búsqueda textual (reemplaza unnest + LIKE)
CREATE INDEX IF NOT EXISTS idx_busquedas_estado_gin
  ON busquedas_guardadas USING GIN (estado);

CREATE INDEX IF NOT EXISTS idx_busquedas_municipio_gin
  ON busquedas_guardadas USING GIN (municipio);

CREATE INDEX IF NOT EXISTS idx_busquedas_colonias_gin
  ON busquedas_guardadas USING GIN (colonias);

-- 7. Índice funcional para status normalizado
CREATE INDEX IF NOT EXISTS idx_propiedades_status_pub
  ON propiedades (LOWER(TRIM(COALESCE(status, ''))))
  WHERE deleted_at IS NULL AND activo = TRUE;
```

#### Deuda Técnica (P2)

1. **Migrar a cola asíncrona** (implementar `scripts/match_queue_migration.sql` con pg_cron)
2. **Agregar columna geometry** persistente en lugar de reconstruir desde JSONB cada vez
3. **Implementar RLS policies** reales en lugar de depender solo de `SECURITY DEFINER`
4. **Keyset pagination** (WHERE id > last_seen_id) en lugar de LIMIT/OFFSET en feeds

---

## 3. CAPA DE ESTADO — STATE MANAGEMENT

### 3.1 Diagnóstico General

| Patrón | Dónde se usa | Evaluación |
|--------|-------------|------------|
| ✅ React Query (useQuery) | Feed, Map Properties, Feed Items, Likes, Comments, Conversations, Badges | Correcto: staleTime configurado, query keys estructurados |
| ✅ Zustand (UI puro) | propertyFiltersStore, chatStore, citasStore, matchesStore | Correcto: estado de UI que no necesita stale/invalidation |
| ⚠️ Zustand (server data) | profileStore (profile, properties, posts, reels) | **INCORRECTO:** estado de servidor manejado manualmente sin React Query |
| ❌ useState (server data) | usePropertyDetails, useAppointments, useMessages, useEasyBroker | **CRÍTICO:** Sin caché, sin deduplicación, sin invalidación automática |
| ⚠️ Dual filtering | Propiedades: server-side (Supabase) + client-side (usePropertyFilters) | Complejidad innecesaria. Posible divergencia entre ambos |

### 3.2 Problemas Identificados

#### 🔴 CRÍTICO: `profileStore` almacena datos de servidor en Zustand

El perfil de usuario, propiedades, posts, reels, estadísticas de reseñas, y listas de recomendaciones se almacenan en Zustand con fetch manual. Esto significa:
- Sin revalidación por stale time
- Sin refetch al enfocar ventana
- Sin deduplicación de requests
- Paginación manual (page, hasMore, loading) — `useInfiniteQuery` lo haría automático

#### 🔴 CRÍTICO: `usePropertyDetails` sin React Query

Cada vez que se abre la ficha de una propiedad, se hace un fetch completo a Supabase. Dos fichas abiertas simultáneamente = dos requests idénticos.

#### 🔴 CRÍTICO: `useMessages` — 1116 líneas sin React Query

El hook de mensajes implementa manualmente:
- Paginación con `range()` y estado `page`
- Optimistic UI con manipulación manual de arrays
- Upload de archivos con compresión
- Realtime subscriptions
- Contadores de no leídos

`useInfiniteQuery` + `useMutation` eliminaría ~400 líneas y daría caché, retry, y deduplicación.

#### 🟡 ALTO: `usePropertyMutation` no es una mutación de React Query

Usa `useState` para `isSaving`/`error` y llama manualmente a `queryClient.invalidateQueries`. Debería ser un `useMutation`.

#### 🟡 ALTO: `hasActiveFilters()` duplicado

Existe en dos lugares: `propertyFiltersStore.ts:392-436` y `usePropertyFilters.ts:541-569`. Lógica idéntica con riesgo de divergencia.

#### 🟡 ALTO: Sin prefetching

No hay `queryClient.prefetchQuery()` en ningún lado. Las rutas de navegación comunes (detalle de propiedad desde card, siguiente página de feed) no prec rootcean datos.

### 3.3 Recomendaciones State Management

| Prioridad | Acción | Impacto |
|-----------|--------|---------|
| P0 | Migrar `profileStore` a React Query (`useQuery` + `useInfiniteQuery`) | Elimina ~150 líneas de estado manual. Gana caché, deduplicación, refetch automático |
| P0 | Convertir `usePropertyDetails` a `useQuery` | Elimina refetch en cada mount. Caché por ID |
| P0 | Refactorizar `useMessages` a `useInfiniteQuery` + `useMutation` | Elimina ~400 líneas. Gana retry, caché, sincronización |
| P1 | Convertir `useAppointments` a React Query | Sin cambios de UI, solo reemplazar useState interno |
| P1 | Convertir `usePropertyMutation` a `useMutation` | isValidating automático, retry, onError |
| P1 | Eliminar `hasActiveFilters` duplicado | Mantener solo la versión del hook |
| P1 | Extraer `useDebouncedMapFilters` | Elimina duplicación entre map.tsx y map-results.tsx |
| P2 | Agregar prefetching | Navegación instantánea en rutas predecibles |

---

## 4. ARQUITECTURA DE COMPONENTES

### 4.1 God Components Identificados

| Componente | Líneas | Problema |
|-----------|--------|----------|
| `usePropertyForm.ts` | 1303 | Hook más grande del proyecto. 50+ setters, reducer gigante |
| `PropertyMap.tsx` | 1250 | Renderizado de mapa, overlays, clusters, dibujo de polígonos, selector de tipo de mapa |
| `MapSearch.tsx` | 734 | Búsqueda de zonas, polígonos, chips, filtros, geocoding, navegación |
| `PropertyCard.tsx` | 738 | 15 imports, 6 modals, lógica de negocio mezclada con presentación |
| `Feed.tsx` | 507 | Scroll, comments, approvals, recommendations, tab press |

### 4.2 Duplicación de Código

| Patrón | Archivos | Líneas duplicadas |
|--------|----------|-------------------|
| Recommended Users (texto + modal + preview) | PropertyCard, PostCard, ReelCard | ~120 c/u → 360 total |
| Menú de propietario (editar/eliminar) | PropertyCard, PostCard, ReelCard | ~80 c/u → 240 total |
| Debounced filters + extractServerFilters | map.tsx, map-results.tsx | ~15 c/u → 30 total |
| ConfirmDialog para eliminar | PropertyCard, PostCard, ReelCard | ~30 c/u → 90 total |

### 4.3 Problemas de Renderizado

| # | Problema | Archivo | Impacto |
|---|----------|---------|---------|
| 1 | Stats de PropertyCard computados **sin useMemo** en cada render | PropertyCard.tsx:157-225 | ALTO: 20 cards en pantalla = 20 recomputaciones |
| 2 | Overlay de PropertyMap procesa **500+ markers** en cada movimento de mapa | PropertyMap.tsx:228-332 | ALTO: jank en dispositivos viejos |
| 3 | Supercluster index se reconstruye **completo** al cambiar propiedades | PropertyMap.tsx:143-161 | ALTO: 500 puntos reindexados en cada cambio |
| 4 | Nested FlatList (FlatList dentro de FlashList) | LazyImage.tsx | ALTO: viola virtualización |
| 5 | `allFeedItems` en map-results crece **sin límite** | map-results.tsx:181 | MEDIO: fuga de memoria en listas largas |
| 6 | Sin blurhash/placeholders en imágenes | LazyImage.tsx | BAJO: flash de spinner a imagen |

### 4.4 Recomendaciones Componentes

| Prioridad | Acción | Archivos |
|-----------|--------|----------|
| P0 | Extraer `RecommendedRow` component compartido | PropertyCard.tsx, PostCard.tsx, ReelCard.tsx |
| P0 | Envolver stats en `useMemo` | PropertyCard.tsx:157-225 |
| P1 | Extraer `useDebouncedMapFilters` hook | map.tsx, map-results.tsx |
| P1 | Reducir PropertyMap max visible de 500 a 200 | PropertyMap.tsx |
| P1 | Agregar debounce a Supercluster rebuild | PropertyMap.tsx:143-161 |
| P1 | Limitar `allFeedItems` con virtualización | map-results.tsx |
| P2 | Agregar blurhash como placeholder | LazyImage.tsx |
| P2 | Split PropertyCard en sub-componentes | PropertyCard.tsx |
| P2 | Convertir overlay styles inline a StyleSheet | PropertyMap.tsx |

---

## 5. NAVEGACIÓN Y RUTAS

### 5.1 Estructura de Routers

| Router | Rutas | Evaluación |
|--------|-------|------------|
| `(auth)` | 5 rutas (login, register, forgot/reset/verify password) | ✅ Correcto |
| `(tabs)` | 4 tabs (Feed, Stats, Create, Profile) | ✅ Correcto, tab bar custom |
| `(stack)` | 14 rutas (map, messages, property, etc.) | ⚠️ `gestureEnabled: false` en mapas necesario pero iOS puede sentirse menos responsive |
| `(create)` | 3 rutas (property, reel, post) | ✅ Correcto |

### 5.2 Problemas

- **Deep provider nesting**: 10 providers anidados en `_layout.tsx` causan re-renders en cascada
- **Auth guard**: Dependencia de `segments` (nuevo array en cada render) puede causar loops de redirect
- **Hooks globales en tab layout**: `useConversations()`, `usePendingAppointmentsCount()`, `useUnseenMatchesCount()` se ejecutan aunque el usuario nunca visite mensajes/matchs

---

## 6. SEGURIDAD

### 6.1 Hallazgos

| Aspecto | Estado | Riesgo |
|---------|--------|--------|
| **RLS Policies** | ❌ No definidas en ningún archivo SQL del repo | Las tablas SIN RLS habilitado están expuestas públicamente |
| **SECURITY DEFINER** | ✅ Usado en todas las funciones críticas | Las funciones se ejecutan con privilegios del owner, puenteando RLS — es intencional pero riesgoso si alguna función tiene SQL injection |
| **Auth** | ✅ Supabase Auth + Google OAuth | Correcto |
| **API Keys** | ⚠️ `EXPO_PUBLIC_SUPABASE_ANON_KEY` y `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` en el bundle | Las anon keys son públicas por diseño, pero las Google Maps keys pueden ser usadas por terceros si no tienen restricciones de bundle ID / SHA-1 |
| **Validación de propiedad** | ⚠️ `recalcular_matches_busqueda` verifica `auth.uid()` pero otras funciones no verifican ownership explícitamente | Posible manipulación de matches entre usuarios |

### 6.2 Recomendaciones Seguridad

1. **Verificar que RLS esté habilitado** en todas las tablas desde el dashboard de Supabase
2. **Agregar políticas RLS** explícitas en los archivos SQL del repo para tenerlas versionadas
3. **Agregar restricciones de bundle ID / SHA-1** en Google Cloud Console para las API keys
4. **Revisar funciones SECURITY DEFINER** para asegurar que no tengan vectores de SQL injection

---

## 7. ESCALABILIDAD — ¿CÓMO SE COMPORTA CON MILES DE USUARIOS?

### 7.1 Proyección por Volumen

| Escenario | Propiedades | Búsquedas | Usuarios activos | Comportamiento esperado |
|-----------|-------------|-----------|-------------------|------------------------|
| **Actual** | 335 | ~20 | ~25 | ✅ Sin problemas |
| **Pequeño** | 1,000 | 100 | 100 | ⚠️ Matching síncrono empieza a notarse (1-2s por operación) |
| **Mediano** | 5,000 | 500 | 500 | 🔴 Matching síncrono: 5-15 segundos. Sin índices: sequential scans |
| **Grande** | 20,000 | 2,000 | 2,000 | 🔴 Sistema colapsa. Triggers hacen timeout. Mapas sin PostGIS inservibles |
| **Escala** | 100,000+ | 10,000+ | 10,000+ | 🔴 Requiere re-arquitectura completa (cola asíncrona, índices, cachés) |

### 7.2 Cuellos de Botella por Orden de Impacto

1. **🔴 Sistema de matching síncrono O(P×S)** — El problema #1. Sin cola asíncrona, el sistema no escala más allá de ~1,000 propiedades y ~100 búsquedas.

2. **🔴 Sin índices en BD** — Sin índices compuestos, cada consulta es un sequential scan. Con 20,000 propiedades, cada evaluación de matching toma milisegundos × 10,000 búsquedas = decenas de segundos.

3. **🟡 Sin PostGIS espacial** — Las operaciones geográficas (polígonos) reconstruyen geometría desde JSONB. Con 5,000+ propiedades y 100+ polígonos, insostenible.

4. **🟡 Límite de 500 en matching** — `handle_search_change_match` solo evalúa las 500 propiedades más recientes. Las propiedades antiguas nunca se matchean con nuevas búsquedas.

5. **🟡 Paginación OFFSET** — En feeds con 10,000+ items, OFFSET 9000 requiere escanear y descartar 9000 filas.

6. **🟡 ProfileStore en Zustand** — Sin React Query, el perfil se refetchea en cada mount. Con 10,000 usuarios activos, requests duplicados a Supabase.

### 7.3 Costos Supabase

| Recurso | Uso actual (335 props) | Proyectado (20,000 props) |
|---------|----------------------|---------------------------|
| **Requests a BD** | ~50/min (estimado) | ~5,000/min (matching síncrono multiplica) |
| **PostgreSQL CPU** | < 5% | 80-100% (sequential scans sin índices) |
| **PostGIS** | No usado realmente | Requerido para escalar |
| **Edge Functions** | 4 desplegadas | Suficientes |
| **Bandwidth** | Mínimo | Depende de imágenes (S3) |
| **Plan Supabase recomendado** | Pro ($25/mes) | Team ($599/mes) o Enterprise |

---

## 8. HALLAZGOS ADICIONALES

### 8.1 Funciones Perdidas (referenciadas pero no definidas)

| Función | Archivo que la referencia | Riesgo |
|---------|--------------------------|--------|
| `convertir_a_usd(numeric, text)` | `evaluar_match_geografico.sql` | Si no existe, el match geográfico falla |
| `safe_int(text)` | `insertar_propiedad_easybroker.sql` | Si no existe, la importación EasyBroker falla |
| `enviar_notificacion_push(uuid, text, text, text, jsonb)` | `notificar_cita_cancelada.sql` | Las notificaciones de cancelación no se envían |

### 8.2 Versiones Múltiples de Funciones

| Función | Versiones en repo | Dónde |
|---------|------------------|-------|
| `evaluate_property_matches` | 4+ | `match_trigger.sql`, `evaluate_matches_unificado.sql`, `scripts/update_match_v2.sql`, `scripts/update_match_function.sql` |
| `handle_property_change_match` | 3+ | `match_trigger.sql`, `scripts/update_match_v2.sql`, `scripts/match_queue_migration.sql` |
| `handle_search_change_match` | 3+ | `match_trigger.sql`, `scripts/simplify_search_trigger.sql`, `scripts/match_queue_migration.sql` |

**Riesgo:** Aplicar el script incorrecto a producción puede sobrescribir una versión más nueva.

### 8.3 Datos Mock en Producción

`statsService.ts` tiene múltiples funciones que devuelven datos mock hardcodeados con multiplicadores aleatorios basados en el conteo de propiedades. No hay flag que indique que son datos falsos.

---

## 9. PLAN DE ACCIÓN PRIORIZADO

### Sprint 1 (Inmediato — 1-2 días)
1. ✅ Aplicar índices SQL (P0)
2. ✅ Verificar que RLS está habilitado en dashboard Supabase
3. ✅ Agregar restricciones SHA-1 / bundle ID a Google Maps API key

### Sprint 2 (Corto plazo — 1 semana)
4. Migrar `profileStore` a React Query
5. Convertir `usePropertyDetails` a `useQuery`
6. Extraer `useDebouncedMapFilters` hook
7. Extraer `RecommendedRow` component

### Sprint 3 (Mediano plazo — 2 semanas)
8. Refactorizar `useMessages` con `useInfiniteQuery` + `useMutation`
9. Implementar cola asíncrona de matching (pg_cron + match_jobs)
10. Reducir PropertyMap load (200 markers max, debounce Supercluster)

### Sprint 4 (Largo plazo — 1 mes)
11. Implementar PostGIS espacial (columna geometry persistente + índice GiST)
12. Keyset pagination en feeds
13. Split de god components (PropertyCard, PropertyMap, MapSearch)
14. GIN indexes + full-text search
15. Implementar las 3 funciones faltantes (`convertir_a_usd`, `safe_int`, `enviar_notificacion_push`)

---

## 10. CONCLUSIÓN

La arquitectura actual es **funcional para el volumen actual (~335 propiedades, ~25 usuarios)** pero **no escala más allá de ~1,000 propiedades sin intervención**.

**Fortalezas:**
- Base sólida con React Query + Zustand
- Estructura de rutas limpia con Expo Router
- Buen uso de FlashList y supercluster para mapas
- Provider pattern desacoplado

**Debilidades principales:**
- **Sistema de matching síncrono O(P×S)** — el problema más grave a escala
- **Cero índices en BD** — cada consulta es un sequential scan
- **Estado de servidor en Zustand y useState** — perdiendo todos los beneficios de React Query
- **God components y código duplicado** — mantenibilidad decreciente

**Puntaje de salud arquitectónica:** 6/10
- Escalabilidad BD: 3/10
- State management: 5/10
- Componentes: 6/10
- Seguridad: 7/10
- Rendimiento cliente: 6/10
