import { useState, useCallback } from "react";
import { profileService } from "../services/profileService";
import { useAuth } from "@/context/AuthContext";
import { logger } from "@/utils/logger";

const log = logger.scoped("useUserRecommendations");

export interface RecommendedUser {
  id: string;
  name: string;
  /** Rol de permisos en la app (cliente/admin/web). NO sirve para etiquetar al
      usuario de cara al público: para eso está `ocupacion`. */
  role?: string;
  /** Lo que la persona ES ("Asesor Inmobiliario", "Constructor", …). */
  ocupacion?: string | null;
  avatar?: string | null;
}

export const useUserRecommendations = (userId?: string) => {
  const { user } = useAuth();
  const [recommendedList, setRecommendedList] = useState<RecommendedUser[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);

  const fetchRecommendations = useCallback(async () => {
    if (!userId) return;

    try {
      setLoadingRecommended(true);
      setRecommendedList([]);

      // Obtain recommendations using the service
      // We assume the service now supports retrieving the list with details
      // If getRecommendedByUsers returns perfiles[], we need to map it.

      const profiles = await profileService.getRecommendedByUsers(
        userId,
        0,
        49,
        true,
        user?.id,
      );

      const mapped: RecommendedUser[] = (profiles || []).map((p: any) => {
        const name = [p?.nombre, p?.apellido_paterno, p?.apellido_materno]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          id: p.id,
          name: name || "Usuario",
          role: p.rol,
          ocupacion: p.ocupacion ?? null,
          avatar: p.foto ?? null,
        };
      });

      setRecommendedList(mapped);
    } catch (error) {
      log.error("Error fetching recommendations:", error);
    } finally {
      setLoadingRecommended(false);
    }
  }, [userId, user?.id]);

  return {
    recommendedList,
    loadingRecommended,
    fetchRecommendations,
  };
};