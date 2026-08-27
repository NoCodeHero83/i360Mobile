import { supabase } from "@/lib/supabase";
import { perfiles, EstadisticasResenas } from "@/types";
import { logger } from "@/utils/logger";
import { blockService } from "@/services/blockService";

const log = logger.scoped("profileService");

export const profileService = {
  async getProfile(userId: string) {
    const { data: profile, error } = await supabase
      .from("perfiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return profile as perfiles | null;
  },

  async getReviewStats(userId: string, viewerUserId?: string | null) {
    const { data: statsData, error: statsError } = await supabase
      .from("vw_estadisticas_resenas")
      .select("*")
      .eq("profesional_id", userId)
      .maybeSingle();

    if (statsError) throw statsError;
    const stats = statsData as EstadisticasResenas | null;
    if (!stats || !viewerUserId) return stats;

    const blockedUserIds = await blockService.getBlockedUserIds(viewerUserId);
    if (blockedUserIds.length === 0) return stats;

    const { data: recs, error: recsError } = await supabase
      .from("recomendaciones_usuarios")
      .select("recomienda")
      .eq("usuario_recomendado_id", userId)
      .not("recomendado_por", "in", `(${blockedUserIds.join(",")})`);

    if (recsError) {
      log.warn("getReviewStats filtered recommendations failed", recsError);
      return stats;
    }

    const totalRecomiendan = (recs ?? []).filter((r: any) => r.recomienda).length;
    const totalNoRecomiendan = (recs ?? []).filter(
      (r: any) => !r.recomienda,
    ).length;

    return {
      ...stats,
      total_recomiendan: totalRecomiendan,
      total_no_recomiendan: totalNoRecomiendan,
    };
  },

  async getUserRecommendation(recommenderId: string, targetUserId: string) {
    const { data, error } = await supabase
      .from("recomendaciones_usuarios")
      .select("recomienda")
      .eq("usuario_recomendado_id", targetUserId)
      .eq("recomendado_por", recommenderId)
      .maybeSingle();

    if (error) throw error;
    return data?.recomienda ?? null;
  },

  async getRecommendedByUsers(
    targetUserId: string,
    from: number,
    to: number,
    recomienda: boolean = true,
    viewerUserId?: string | null,
  ) {
    const blockedUserIds = await blockService.getBlockedUserIds(viewerUserId);

    let recsQuery = supabase
      .from("recomendaciones_usuarios")
      .select("recomendado_por")
      .eq("usuario_recomendado_id", targetUserId)
      .eq("recomienda", recomienda)
      .range(from, to);

    if (blockedUserIds.length > 0) {
      recsQuery = recsQuery.not(
        "recomendado_por",
        "in",
        `(${blockedUserIds.join(",")})`,
      );
    }

    const { data: recsData, error: recsError } = await recsQuery;

    if (recsError) throw recsError;

    const recommendedByIds = (recsData || [])
      .map((r: any) => r?.recomendado_por)
      .filter(Boolean) as string[];

    if (recommendedByIds.length === 0) return [];

    const { data: profilesData, error: profilesError } = await supabase
      .from("perfiles")
      .select("id,nombre,apellido_paterno,apellido_materno,foto,rol,ocupacion")
      .in("id", recommendedByIds);

    if (profilesError) throw profilesError;
    return profilesData || [];
  },

  async toggleRecommendation(
    recommenderId: string,
    targetUserId: string,
    currentStatus: boolean | null,
    newStatus: boolean,
  ) {
    if (currentStatus === newStatus) {
      // Delete recommendation if clicking same status
      const { error } = await supabase
        .from("recomendaciones_usuarios")
        .delete()
        .eq("usuario_recomendado_id", targetUserId)
        .eq("recomendado_por", recommenderId);
      if (error) throw error;
      return null;
    } else if (currentStatus === null) {
      // Insert new recommendation
      const { error } = await supabase.from("recomendaciones_usuarios").insert({
        usuario_recomendado_id: targetUserId,
        recomendado_por: recommenderId,
        recomienda: newStatus,
      });
      if (error) throw error;
      return newStatus;
    } else {
      // Update existing recommendation
      const { error } = await supabase
        .from("recomendaciones_usuarios")
        .update({ recomienda: newStatus })
        .eq("usuario_recomendado_id", targetUserId)
        .eq("recomendado_por", recommenderId);
      if (error) throw error;
      return newStatus;
    }
  },

  async getRecommendationPreviewsForUsers(
    userIds: string[],
    viewerUserId?: string | null,
  ) {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (ids.length === 0) return {};

    try {
      const blockedUserIds = await blockService.getBlockedUserIds(viewerUserId);

      // 1. Obtener recomendaciones y sus perfiles en una sola consulta batch
      // Limitamos a un número razonable para evitar traer miles si un usuario es muy popular,
      // ya que solo necesitamos unos pocos para el "preview".
      let query = supabase
        .from("recomendaciones_usuarios")
        .select(
          `
          usuario_recomendado_id,
          recomendado_por,
          perfil:perfiles!recomendado_por (
            id,
            nombre,
            apellido_paterno,
            apellido_materno,
            foto
          )
        `,
        )
        .in("usuario_recomendado_id", ids)
        .eq("recomienda", true)
        .limit(1000); // Tope generoso para cubrir múltiples usuarios populares en un solo viaje

      if (blockedUserIds.length > 0) {
        query = query.not(
          "recomendado_por",
          "in",
          `(${blockedUserIds.join(",")})`,
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      // 2. Agrupar resultados por usuario recomendado
      const result: Record<string, any[]> = {};

      // Inicializar el objeto con los IDs solicitados
      ids.forEach((id) => {
        result[id] = [];
      });

      (data || []).forEach((row: any) => {
        const uId = row.usuario_recomendado_id;
        const p = row.perfil;

        if (p && result[uId].length < 3) {
          // Solo guardamos hasta 3 para el preview
          const name = [p.nombre, p.apellido_paterno, p.apellido_materno]
            .filter(Boolean)
            .join(" ")
            .trim();

          result[uId].push({
            id: p.id,
            name: name || "Usuario",
            avatar: p.foto ?? null,
          });
        }
      });

      return result;
    } catch (error) {
      log.error("Error en getRecommendationPreviewsForUsers:", error);
      return {};
    }
  },
};