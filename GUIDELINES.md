# GUIDELINES — Reglas obligatorias antes de implementar

## Principio fundamental

Las tareas aquí descritas deben implementarse con **máximo cuidado quirúrgico**: solo deben modificarse los archivos estrictamente necesarios, y los cambios deben ser mínimos, localizados, y sin efecto secundario alguno sobre el resto del sistema.

## Reglas

### 1. Aislamiento absoluto

- Los cambios solo pueden afectar los archivos directamente implicados en la tarea.
- No se permite modificar archivos no listados en el plan de implementación.
- Si durante la implementación se descubre que un archivo no listado necesita cambios, se debe reportar antes de tocar ese archivo.

### 2. Cero impacto en UX/UI

- Ningún cambio puede alterar la interfaz de usuario, los textos visibles, colores, animaciones, layouts, o comportamientos visuales existentes.
- No se permite cambiar nombres de componentes, props, o estilos que afecten el renderizado.
- No se permite agregar, quitar ni modificar elementos visuales, textos, tooltips, spinners, o cualquier otro elemento de UI.
- Los únicos cambios de UI permitidos son aquellos que previenen crashes (ej. evitar que el mapa se congele).

### 3. Cero impacto en funcionalidad existente

- Todo el comportamiento actual debe preservarse exactamente igual para los casos que ya funcionan.
- Los cambios solo deben agregar comportamiento nuevo en los caminos específicos que se están corrigiendo.
- No se permite refactorizar, renombrar, reordenar, o "mejorar" código existente no relacionado.
- No se permite cambiar firmas de funciones exportadas (parámetros obligatorios, tipos de retorno) que otros módulos consumen.

### 4. Parámetros opcionales, nunca obligatorios

- Cualquier nuevo parámetro debe ser opcional (con valor por defecto o `undefined`).
- El comportamiento por defecto debe ser idéntico al actual.
- Los callers existentes que no pasen el nuevo parámetro deben funcionar exactamente igual que antes.

### 5. Sin regresiones

- Antes de declarar una tarea como completa, se debe verificar que los tests existentes (si los hay) sigan pasando.
- Se debe compilar/transpilar el código para asegurar que no hay errores de tipo.

### 6. Patrón fail-safe

- Si una dependencia externa falla (API, perfil sin estado, etc.), el sistema debe degradar gracefulmente al comportamiento anterior.
- Ninguna falla en las nuevas características puede propagarse como error o crash al usuario.
- Usar try/catch alrededor de código nuevo que pueda fallar.

### 7. Nada de logs, console.warn, ni comentarios

- No agregar `console.log`, `console.warn`, ni comentarios explicativos.
- El código nuevo debe ser autodescriptivo o seguir exactamente el estilo del archivo.

### 8. No cambiar imports de otros módulos

- No se permite agregar imports a archivos que no sean necesarios para la tarea.
- Si un archivo ya importa algo, se puede usar lo que ya importa.
