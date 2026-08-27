import { supabase } from "@/lib/supabase";
import { Reel } from "@/types";
import { logger } from "@/utils/logger";

const log = logger.scoped("reelService");

export interface ReelFeedRow {
  feed_item_id: string;
  reel_id: string;
  autor_id: string;
  autor_nombre?: string;
  autor_foto?: string;
  descripcion?: string;
  thumbnail_url?: string;
  video_url?: string;
  likes_count?: number;
  comentarios_count?: number;
}

export const reelService = {
  async getReelsFeed(
    limit: number,
    offset: number,
    currentUserId?: string,
  ): Promise<ReelFeedRow[]> {
    const { data, error } = await supabase.rpc("get_reels_feed_paged", {
      p_limit: limit,
      p_offset: offset,
      p_current_user_id: currentUserId ?? null,
    });

    if (error) {
      log.error("getReelsFeed failed", error);
      return [];
    }

    return (data ?? []) as ReelFeedRow[];
  },

  async reelsByUser(targetUserId: string) {
    // 1. Fetch reels first
    const { data: reelsData, error: reelsError } = await supabase
      .from("reels")
      .select("*")
      .eq("publicado_por", targetUserId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (reelsError) {
      log.error("Error fetching reels:", reelsError);
      return [];
    }

    if (!reelsData || reelsData.length === 0) return [];

    // 2. Fetch corresponding feed_items for these reels
    const reelIds = reelsData.map((r) => r.id);
    const { data: feedData, error: feedError } = await supabase
      .from("feed_items")
      .select("id, contenido_id, likes_count, comentarios_count")
      .eq("tipo_contenido", "reel")
      .in("contenido_id", reelIds);

    if (feedError) {
      log.error("Error fetching feed_items for reels:", feedError);
      // Return reels even if feed stats fail
      return reelsData;
    }

    // 3. Map feed info to reel records
    const feedMap = new Map(feedData?.map((f) => [f.contenido_id, f]) || []);

    return reelsData.map((reel) => {
      const feedItem = feedMap.get(reel.id);
      return {
        ...reel,
        feed_item_id: feedItem?.id,
        likes_count: feedItem?.likes_count || 0,
        comentarios_count: feedItem?.comentarios_count || 0,
      };
    });
  },

  async deleteReel(reel: Reel) {
    const { error } = await supabase
      .from("reels")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", reel.id);

    if (error) throw error;

    return alert("Reel eliminado correctamente");
  },
};