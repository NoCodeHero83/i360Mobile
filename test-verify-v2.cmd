@echo off
setlocal enabledelayedexpansion
set ERRORS=0

echo ========================================
echo  TEST SET v2 - Fixes de ubicaciones
echo ========================================

echo.
echo ========================================
echo  1. Score textual + re-rank
echo ========================================

findstr /c:"_score" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.1 - Score textual definido) || (echo [FALLO] 1.1 - Score NO definido & set /a ERRORS+=1)
findstr /c:"name === q" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.2 - Comparacion exacta name===q) || (echo [FALLO] 1.2 - Sin comparacion exacta & set /a ERRORS+=1)
findstr /c:"normalize" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.3 - Normalize de acentos en score) || (echo [FALLO] 1.3 - Sin normalize en score & set /a ERRORS+=1)
findstr /c:"a._score - b._score" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.4 - Sort por score) || (echo [FALLO] 1.4 - Sort NO prioriza score & set /a ERRORS+=1)
findstr /c:"scoreDiff" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.5 - scoreDiff usado como principal) || (echo [FALLO] 1.5 - scoreDiff NO es principal & set /a ERRORS+=1)

echo.
echo ========================================
echo  2. Throttle de setFocusRegion
echo ========================================

findstr /c:"focusThrottleRef" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.1 - focusThrottleRef definido) || (echo [FALLO] 2.1 - Sin focusThrottleRef & set /a ERRORS+=1)
findstr /c:"setFocusRegionThrottled" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.2 - setFocusRegionThrottled definida) || (echo [FALLO] 2.2 - Sin setFocusRegionThrottled & set /a ERRORS+=1)
findstr /c:"400" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.3 - Throttle timeout 400ms presente) || (echo [FALLO] 2.3 - Sin timeout 400ms & set /a ERRORS+=1)
findstr /c:"focusThrottleRef.current) return" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.4 - Throttle bloquea duplicados) || (echo [FALLO] 2.4 - Sin bloqueo de duplicados & set /a ERRORS+=1)

echo.
echo ========================================
echo  3. Busqueda por colonia/municipio
echo ========================================

findstr /c:"unaccent(colonia)" src\hooks\useSearch.ts >nul 2>&1 && (echo [PASO] 3.1 - unaccent en colonia) || (echo [FALLO] 3.1 - Sin unaccent en colonia & set /a ERRORS+=1)
findstr /c:"unaccent(municipio)" src\hooks\useSearch.ts >nul 2>&1 && (echo [PASO] 3.2 - unaccent en municipio) || (echo [FALLO] 3.2 - Sin unaccent en municipio & set /a ERRORS+=1)
findstr /c:"codigo_propiedad.ilike" src\hooks\useSearch.ts >nul 2>&1 && (echo [PASO] 3.3 - Codigo propiedad conservado) || (echo [FALLO] 3.3 - Codigo propiedad eliminado & set /a ERRORS+=1)
findstr /c:"normalize" src\hooks\useSearch.ts >nul 2>&1 && (echo [PASO] 3.4 - normalize presente en fetchProperties) || (echo [FALLO] 3.4 - Sin normalize en fetchProperties & set /a ERRORS+=1)

echo.
echo ========================================
echo  4. mountedRef en handleAddLocationChip
echo ========================================

findstr /c:"mountedRef" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 4.1 - mountedRef definido) || (echo [FALLO] 4.1 - Sin mountedRef & set /a ERRORS+=1)
findstr /c:"mountedRef.current = false" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 4.2 - mountedRef cleanup) || (echo [FALLO] 4.2 - Sin cleanup & set /a ERRORS+=1)
findstr /c:"handleAddLocationChip" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 4.3 - handleAddLocationChip existe) || (echo [FALLO] 4.3 - Sin handleAddLocationChip & set /a ERRORS+=1)
findstr /c:"mountedRef.current) return" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 4.4 - Guard mountedRef presente) || (echo [FALLO] 4.4 - Sin guard mountedRef & set /a ERRORS+=1)

echo.
echo ========================================
echo  5. SelectionModal KeyboardAvoidingView
echo ========================================

findstr /c:"KeyboardAvoidingView" src\components\modals\SelectionModal.tsx >nul 2>&1 && (echo [PASO] 5.1 - KeyboardAvoidingView presente) || (echo [FALLO] 5.1 - Sin KeyboardAvoidingView & set /a ERRORS+=1)
findstr /c:"keyboardVerticalOffset" src\components\modals\SelectionModal.tsx >nul 2>&1 && (echo [PASO] 5.2 - keyboardVerticalOffset definido) || (echo [FALLO] 5.2 - Sin offset & set /a ERRORS+=1)
findstr /c:"flexGrow" src\components\modals\SelectionModal.tsx >nul 2>&1 && (echo [PASO] 5.3 - flexGrow presente) || (echo [FALLO] 5.3 - Sin flexGrow & set /a ERRORS+=1)
findstr /c:"minHeight" src\components\modals\SelectionModal.tsx >nul 2>&1 && (echo [PASO] 5.4 - minHeight presente) || (echo [FALLO] 5.4 - Sin minHeight & set /a ERRORS+=1)

echo.
echo ========================================
echo  6. SearchOverlay - Reset expandedSections
echo ========================================

findstr /c:"setExpandedSections(new Set())" src\components\search\SearchOverlay.tsx >nul 2>&1 && (echo [PASO] 6.1 - Reset al abrir overlay) || (echo [FALLO] 6.1 - Sin reset & set /a ERRORS+=1)
findstr /c:"<T,>" src\components\search\SearchOverlay.tsx >nul 2>&1 && (echo [PASO] 6.2 - Generic en sectionState) || (echo [FALLO] 6.2 - Sin generic & set /a ERRORS+=1)

echo.
echo ========================================
echo  7. App.json - updates disabled + cuenta correcta
echo ========================================

findstr /c:"enabled" app.json | findstr /c:"false" >nul 2>&1 && (echo [PASO] 7.1 - Updates deshabilitados) || (echo [FALLO] 7.1 - Updates habilitados & set /a ERRORS+=1)
findstr /c:"imightbewrong" app.json >nul 2>&1 && (echo [PASO] 7.2 - Owner imightbewrong) || (echo [FALLO] 7.2 - Owner incorrecto & set /a ERRORS+=1)
findstr /c:"fc0a5782" app.json >nul 2>&1 && (echo [PASO] 7.3 - projectId correcto) || (echo [FALLO] 7.3 - projectId incorrecto & set /a ERRORS+=1)

echo.
echo ========================================
echo  8. Sin Sentry
echo ========================================

findstr /c:"@sentry" package.json >nul 2>&1 && (echo [FALLO] 8.1 - Sentry en package.json! & set /a ERRORS+=1) || (echo [PASO] 8.1 - Sentry ausente de package.json)
findstr /c:"Sentry" src\app\_layout.tsx >nul 2>&1 && (echo [FALLO] 8.2 - Sentry en _layout.tsx! & set /a ERRORS+=1) || (echo [PASO] 8.2 - Sentry ausente de _layout.tsx)

echo.
echo ========================================
if !ERRORS!==0 (echo  RESULTADO: TODOS LOS TEST PASARON & exit /b 0)
echo  RESULTADO: !ERRORS! TEST(S) FALLARON & exit /b 1
exit /b 0
