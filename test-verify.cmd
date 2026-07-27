@echo off
setlocal enabledelayedexpansion
set ERRORS=0

echo ========================================
echo  TEST: Location Bias en Google Places
echo ========================================

findstr /c:"location?" src\lib\geocodingService.ts >nul 2>&1 && (echo [PASO] 1.1 - searchPlaces location) || (echo [FALLO] 1.1 - searchPlaces location & set /a ERRORS+=1)
findstr /c:"radius?" src\lib\geocodingService.ts >nul 2>&1 && (echo [PASO] 1.2 - searchPlaces radius) || (echo [FALLO] 1.2 - searchPlaces radius & set /a ERRORS+=1)
findstr /c:"location:" src\lib\geocodingService.ts | findstr /c:"${" >nul 2>&1 && (echo [PASO] 1.3 - location en URLParams) || (echo [FALLO] 1.3 - location en URLParams & set /a ERRORS+=1)
findstr /c:"radius:" src\lib\geocodingService.ts | findstr /c:"String" >nul 2>&1 && (echo [PASO] 1.4 - radius en URLParams) || (echo [FALLO] 1.4 - radius en URLParams & set /a ERRORS+=1)
findstr /c:"location," src\lib\locationService.ts >nul 2>&1 && (echo [PASO] 1.5 - searchLocations location) || (echo [FALLO] 1.5 - searchLocations location & set /a ERRORS+=1)
findstr /c:"level1Coords" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.6 - store level1Coords) || (echo [FALLO] 1.6 - store level1Coords & set /a ERRORS+=1)
findstr /c:"opts?.estado" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.7 - store lee estado) || (echo [FALLO] 1.7 - store lee estado & set /a ERRORS+=1)
findstr /c:"biasCoords" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 1.8 - store pasa biasCoords a searchLocations) || (echo [FALLO] 1.8 - store NO pasa biasCoords & set /a ERRORS+=1)
findstr /c:"strictbounds" src\lib\geocodingService.ts >nul 2>&1 && (echo [FALLO] 1.9 - strictbounds presente & set /a ERRORS+=1) || (echo [PASO] 1.9 - sin strictbounds)
findstr /c:"profile?.estado" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 1.10 - MapSearch pasa estado) || (echo [FALLO] 1.10 - MapSearch NO pasa estado & set /a ERRORS+=1)
findstr /c:"profile?.estado" src\components\LocationSearchBar.tsx >nul 2>&1 && (echo [PASO] 1.11 - LocationSearchBar pasa estado) || (echo [FALLO] 1.11 - LocationSearchBar NO pasa estado & set /a ERRORS+=1)
findstr /c:"profile?.estado" src\hooks\useSearch.ts >nul 2>&1 && (echo [PASO] 1.12 - useSearch pasa estado) || (echo [FALLO] 1.12 - useSearch NO pasa estado & set /a ERRORS+=1)

echo.
echo ========================================
echo  TEST: Re-rank client-side por estado
echo ========================================

findstr /c:"estado_nombre?.toLowerCase" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 3.1 - store re-rank: compara estado_nombre con userEstado) || (echo [FALLO] 3.1 - store NO re-rank por estado_nombre & set /a ERRORS+=1)
findstr /c:"userEstado" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 3.2 - store re-rank: define userEstado desde opts) || (echo [FALLO] 3.2 - store NO define userEstado & set /a ERRORS+=1)
findstr /c:"userEstado.toLowerCase()" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 3.3 - store re-rank: comparacion userEstado) || (echo [FALLO] 3.3 - store NO compara userEstado & set /a ERRORS+=1)
findstr /c:"ranked" src\store\locationSearchStore.ts >nul 2>&1 && (echo [PASO] 3.4 - store re-rank: ranked sustituye a enriched) || (echo [FALLO] 3.4 - store NO usa ranked & set /a ERRORS+=1)

echo.
echo ========================================
echo  TEST: geocode() cancelation (Crash 1C)
echo ========================================

findstr /c:"cancelledRef" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.1 - cancelledRef definido) || (echo [FALLO] 2.1 - cancelledRef & set /a ERRORS+=1)
findstr /c:"cancelledRef.current" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.2 - geocode verifica cancelledRef) || (echo [FALLO] 2.2 - geocode verifica cancelledRef & set /a ERRORS+=1)
findstr /c:"cancelledRef.current = true" src\components\map\MapSearch.tsx >nul 2>&1 && (echo [PASO] 2.3 - cancelledRef cleanup) || (echo [FALLO] 2.3 - cancelledRef cleanup & set /a ERRORS+=1)

echo.
echo ========================================
if !ERRORS!==0 (echo  RESULTADO: TODOS LOS TEST PASARON & exit /b 0)
echo  RESULTADO: !ERRORS! TEST(S) FALLARON & exit /b 1
exit /b 0
