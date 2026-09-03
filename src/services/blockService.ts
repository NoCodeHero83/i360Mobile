import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("blockService");

export interface BlockedUser {
  id: string;
  nombre: string;
  avatar?: string | null;
  ocupacion?: string | null;
  blockedAt?: string | null;
}

interface CacheEntry {
  ids: string[];
  expires: number;
}

const blockedUsersCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateBlockedUsersCache(blockerId: string) {
  blockedUsersCache.delete(blockerId);
}

export const blockService = {
  async getBlockedUserIds(blockerId?: string | null): Promise<string[]> {
    if (!blockerId) return [];

    const cached = blockedUsersCache.get(blockerId);
    if (cached && cached.expires > Date.now()) {
      return cached.ids;
    }

    const { data, error } = await supabase
      .from("bloqueos_usuarios")
      .select("bloqueado_id")
      .eq("bloqueador_id", blockerId);

    if (error) {
      log.warn("getBlockedUserIds failed", error);
      return [];
    }

    const ids = (data ?? [])
      .map((row: any) => row.bloqueado_id)
      .filter(Boolean) as string[];

    blockedUsersCache.set(blockerId, {
      ids,
      expires: Date.now() + CACHE_TTL_MS,
    });

    return ids;
  },

  async getBlockedUsers(blockerId?: string | null): Promise<BlockedUser[]> {
    if (!blockerId) return [];

    const { data: blocks, error: blocksError } = await supabase
      .from("bloqueos_usuarios")
      .select("bloqueado_id,created_at")
      .eq("bloqueador_id", blockerId)
      .order("created_at", { ascending: false });

    if (blocksError) {
      log.warn("getBlockedUsers failed", blocksError);
      return [];
    }

    const blockedIds = (blocks ?? [])
      .map((row: any) => row.bloqueado_id)
      .filter(Boolean) as string[];

    if (blockedIds.length === 0) return [];

    const { data: profiles, error: profilesError } = await supabase
      .from("perfiles")
      .select("id,nombre,nombre_completo,apellido_paterno,apellido_materno,foto,ocupacion")
      .in("id", blockedIds);

    if (profilesError) {
      log.warn("getBlockedUsers profiles failed", profilesError);
      return blockedIds.map((id) => ({
        id,
        nombre: "Usuario bloqueado",
        blockedAt:
          (blocks ?? []).find((row: any) => row.bloqueado_id === id)
            ?.created_at ?? null,
      }));
    }

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    return blockedIds.map((id) => {
      const profile = profileById.get(id);
      const block = (blocks ?? []).find((row: any) => row.bloqueado_id === id);
      const nombre =
        profile?.nombre_completo ||
        [profile?.nombre, profile?.apellido_paterno, profile?.apellido_materno]
          .filter(Boolean)
          .join(" ") ||
        "Usuario bloqueado";

      return {
        id,
        nombre,
        avatar: profile?.foto ?? null,
        ocupacion: profile?.ocupacion ?? null,
        blockedAt: block?.created_at ?? null,
      };
    });
  },

  async isBlocked(blockerId?: string | null, blockedId?: string | null) {
    if (!blockerId || !blockedId || blockerId === blockedId) return false;

    const { data, error } = await supabase
      .from("bloqueos_usuarios")
      .select("bloqueado_id")
      .eq("bloqueador_id", blockerId)
      .eq("bloqueado_id", blockedId)
      .maybeSingle();

    if (error) throw error;
    return !!data;
  },

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new Error("No puedes bloquear tu propia cuenta");
    }

    const { error } = await supabase.from("bloqueos_usuarios").upsert(
      {
        bloqueador_id: blockerId,
        bloqueado_id: blockedId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "bloqueador_id,bloqueado_id" },
    );

    if (error) throw error;

    invalidateBlockedUsersCache(blockerId);
  },

  async unblockUser(blockerId: string, blockedId: string) {
    const { error } = await supabase
      .from("bloqueos_usuarios")
      .delete()
      .eq("bloqueador_id", blockerId)
      .eq("bloqueado_id", blockedId);

    if (error) throw error;

    invalidateBlockedUsersCache(blockerId);
  },
};