/**
 * useProfileLoader.ts
 * Hook para cargar perfiles con cache y reintentos inteligentes
 */

import { useCallback, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { perfiles } from "../../types";
import { logger } from "@/utils/logger";

const log = logger.scoped("profile-loader");

export const useProfileLoader = () => {
  // Cache para evitar llamadas redundantes
  const profileCacheRef = useRef<{ [userId: string]: perfiles }>({});
  const loadingProfileRef = useRef<{
    [userId: string]: Promise<perfiles | null>;
  }>({});

  /**
   * Cargar perfil con reintentos inteligentes y cache
   *
   * Identidad estable (solo lee refs): los consumidores lo usan como
   * dependencia de efectos y una nueva referencia en cada render los
   * reejecutaría en bucle.
   */
  const loadProfile = useCallback(async (
    userId: string,
    maxRetries = 1,
  ): Promise<perfiles | null> => {
    if (!userId) {
      log.warn("loadProfile: No userId provided");
      return null;
    }

    // Verificar cache primero
    if (profileCacheRef.current[userId]) {
      return profileCacheRef.current[userId];
    }

    // Si ya está cargando, retornar la promesa existente
    if (userId in loadingProfileRef.current) {
      return loadingProfileRef.current[userId];
    }

    // Crear nueva promesa de carga
    const loadPromise = (async () => {
      let lastError: unknown = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }

          const { data, error } = await supabase
            .from("perfiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

          if (error) {
            // Si no existe el perfil, no reintentamos
            if (error.code === "PGRST116") {
              return null;
            }
            throw error;
          }

          if (data) {
            // Guardar en cache
            profileCacheRef.current[userId] = data;
            return data;
          }

          return null;
        } catch (err: unknown) {
          lastError = err;

          const errorMsg =
            err instanceof Error ? err.message : String(err);
          log.warn(`Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);

          // Si es el último intento, no esperar más
          if (attempt === maxRetries) {
            break;
          }

          // Si es un error fatal (no de red), no reintentar
          if (
            errorMsg.includes("PGRST") ||
            errorMsg.includes("JWT") ||
            errorMsg.includes("permission")
          ) {
            log.error("Fatal error, stopping retries:", errorMsg);
            break;
          }
        }
      }

      const lastErrorMsg =
        lastError instanceof Error ? lastError.message : String(lastError);
      log.error(
        `All attempts failed to load profile for ${userId.substring(0, 8)}:`,
        lastErrorMsg,
      );

      return null;
    })();

    // Guardar promesa en cache de loading
    loadingProfileRef.current[userId] = loadPromise;

    try {
      const result = await loadPromise;
      return result;
    } finally {
      // Limpiar cache de loading después de 5 segundos
      setTimeout(() => {
        delete loadingProfileRef.current[userId];
      }, 5000);
    }
  }, []);

  /**
   * Limpiar cache
   */
  const clearCache = useCallback((userId?: string) => {
    if (userId) {
      delete profileCacheRef.current[userId];
      delete loadingProfileRef.current[userId];
    } else {
      profileCacheRef.current = {};
      loadingProfileRef.current = {};
    }
  }, []);

  /**
   * Actualizar cache directamente
   */
  const updateCache = useCallback((userId: string, profile: perfiles) => {
    profileCacheRef.current[userId] = profile;
  }, []);

  return {
    loadProfile,
    clearCache,
    updateCache,
  };
};
