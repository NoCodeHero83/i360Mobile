# Plan de pruebas — Fixes de ubicaciones y mapa

## 1. Score textual + re-rank

### Prerrequisito
Usuario con `profile.estado = "Aguascalientes"` (ej. `jdiazarmas@gmail.com`)

### TC-1.1: Prioridad de coincidencia exacta
1. Buscar `"San Nicolás Premier"`
2. **Esperado:** 1er resultado = `"San Nicolás Premier, Aguascalientes"`
3. 2do resultado = `"San Nicolás, Aguascalientes"` (fallback)

### TC-1.2: Prioridad de coincidencia exacta sobre parcial
1. Buscar `"San Nicolás"`
2. **Esperado:** 1er resultado = `"San Nicolás, Aguascalientes"` (exacto)
3. Resultados de NL, CDMX después

### TC-1.3: Score textual en otros estados
1. Buscar `"San Nicolás"`
2. **Esperado:** resultados de Aguascalientes primero, luego otros estados ordenados por score

### TC-1.4: Término sin coincidencias exactas
1. Buscar `"Nicolás"`
2. **Esperado:** resultados de Aguascalientes con mayor score primero

### TC-1.5: Usuario sin estado configurado
1. Usar cuenta sin `profile.estado`
2. Buscar `"San Nicolás"`
3. **Esperado:** orden original de Google (sin re-rank geográfico)

### TC-1.6: Coincidencia case-insensitive
1. Buscar `"san nicolás premier"` (minúsculas)
2. **Esperado:** mismo orden que TC-1.1

### TC-1.7: Un solo resultado en Ags.
1. Buscar un término que solo devuelva 1 resultado de Ags.
2. **Esperado:** ese resultado primero, seguido de otros estados

---

## 2. Throttle de setFocusRegion

### TC-2.1: Múltiples búsquedas rápidas
1. Abrir mapa
2. Buscar rápidamente 3 ubicaciones consecutivas (ej. "San Nicolás", "Jesús María", "Loretta") con <1s entre cada una
3. **Esperado:** NO hay crash. El mapa centra en la ÚLTIMA ubicación después de 400ms

### TC-2.2: Búsqueda desde home + mapa
1. Seleccionar ubicación desde home (LocationSearchBar)
2. Navegar al mapa
3. Inmediatamente buscar otra zona en el mapa
4. **Esperado:** NO hay crash. Mapa centra correctamente

### TC-2.3: Cinco búsquedas consecutivas
1. Realizar 5 búsquedas en el mapa seguidas
2. **Esperado:** Sin crash, sin animaciones encimadas

### TC-2.4: Cancelación de búsqueda a mitad
1. Iniciar búsqueda
2. Antes de que termine, seleccionar otra ubicación
3. **Esperado:** Sin crash, mapa centra en la última

---

## 3. Búsqueda por colonia/municipio (San Angelo Residence)

### TC-3.1: Búsqueda por nombre de fraccionamiento
1. Buscar `"San Angelo Residence"`
2. **Esperado:** aparecen propiedades con colonia que contenga "San Angelo Residence"

### TC-3.2: Búsqueda por colonia
1. Buscar `"Loretta"`
2. **Esperado:** aparecen propiedades en colonia "Loretta"

### TC-3.3: Búsqueda por municipio
1. Buscar `"Jesús María"`
2. **Esperado:** aparecen propiedades en municipio "Jesús María"

### TC-3.4: Coincidencia en código de propiedad (regresión)
1. Buscar código de propiedad existente (ej. "ILY-00123")
2. **Esperado:** la propiedad aparece (búsqueda por codigo_propiedad se conserva)

### TC-3.5: Sin resultados en búsqueda general
1. Buscar término sin propiedades asociadas
2. **Esperado:** resultados vacíos sin errores

### TC-3.6: Límite de resultados
1. Buscar término muy común
2. **Esperado:** máximo 20 resultados

---

## 4. mountedRef en handleAddLocationChip

### TC-4.1: Clic rápido en sugerencias
1. Abrir buscador de zonas en mapa
2. Hacer clic rápido en 2 sugerencias diferentes
3. **Esperado:** solo se agrega 1 chip (el mountedRef evita state post-unmount)

### TC-4.2: Cerrar buscador durante carga
1. Abrir buscador de zonas
2. Hacer clic en sugerencia
3. Inmediatamente cerrar el buscador (botón X)
4. **Esperado:** sin error, sin crash

### TC-4.3: Navegar fuera del mapa durante carga
1. Abrir buscador de zonas
2. Hacer clic en sugerencia
3. Inmediatamente navegar a otra pantalla
4. **Esperado:** sin error al volver al mapa

### TC-4.4: Acumulación de chips en búsquedas consecutivas
1. Buscar "San Nicolás" → agregar chip
2. Buscar "Jesús María" → agregar chip
3. Buscar "Loretta" → agregar chip
4. **Esperado:** 3 chips en la barra de filtros, no hay crash ni lentitud

### TC-4.5: Chip con ID único por Date.now()
1. Verificar que cada chip tiene ID único
2. **Esperado:** no hay conflictos de key en React

---

## 5. Editar Perfil — Selector de estado

### TC-5.1: Apertura del selector
1. Ir a Editar Perfil
2. Tocar campo de estado
3. **Esperado:** modal aparece con lista de 32 estados

### TC-5.2: Búsqueda con teclado visible
1. Abrir selector de estado
2. Tocar campo de búsqueda (teclado se abre)
3. Escribir texto
4. **Esperado:** la lista de resultados es COMPLETAMENTE VISIBLE, no oculta por el teclado

### TC-5.3: Sin resultados
1. Abrir selector, escribir texto sin match
2. **Esperado:** mensaje "No se encontraron resultados" visible (no oculto por teclado)

### TC-5.4: Selección de estado
1. Escribir "Aguascalientes"
2. Tocar el resultado
3. **Esperado:** modal se cierra, campo muestra "Aguascalientes"

### TC-5.5: Búsqueda con pocos caracteres
1. Escribir "A"
2. **Esperado:** lista filtrada se muestra, no se comprime ni oculta

---

## 6. Ver más / Ver menos en buscador general

### TC-6.1: Toggle de ubicaciones
1. Buscar término con 5+ ubicaciones
2. **Esperado:** se muestran 2 ubicaciones + botón "Ver todos (5)"

### TC-6.2: Expandir sección
1. Tocar "Ver todos (5)"
2. **Esperado:** se muestran las 5, botón cambia a "Ver menos"

### TC-6.3: Colapsar sección
1. Tocar "Ver menos"
2. **Esperado:** vuelve a 2 + "Ver todos (5)"

### TC-6.4: Persistencia al cerrar/abrir overlay
1. Expandir ubicaciones
2. Cerrar overlay
3. Abrir overlay de nuevo
4. **Esperado:** sección colapsada (siempre inicia colapsado)

---

## 7. Sin regresiones

### TC-7.1: Búsqueda desde home
1. Tocar buscador en home
2. Escribir "Loretta"
3. **Esperado:** overlay se abre, resultados aparecen, sin crash

### TC-7.2: Editar Perfil sin crash
1. Ir a Editar Perfil
2. Modificar nombre
3. Guardar
4. **Esperado:** sin error

### TC-7.3: Apertura de la app
1. Abrir la app 3 veces seguidas
2. **Esperado:** sin crash en ninguna apertura
