import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("communityService");

const STORED_INVITE_CODE_KEY = "ilyrox:asesor_invite_code";

export interface CommunityBuilder {
  id: string;
  nombre: string;
  avatar?: string | null;
  ocupacion?: string | null;
  rating?: number | null;
  totalViews: number;
  invitedAdvisors: number;
  isNew: boolean;
}

type CommunityBuilderRow = {
  user_id: string;
  nombre: string | null;
  foto: string | null;
  ocupacion: string | null;
  calificacion_promedio: number | string | null;
  total_visualizaciones: number | string | null;
  asesores_invitados: number | string | null;
  es_nuevo: boolean | null;
};

function normalizeBuilder(row: CommunityBuilderRow): CommunityBuilder {
  return {
    id: row.user_id,
    nombre: row.nombre || "Asesor",
    avatar: row.foto,
    ocupacion: row.ocupacion,
    rating:
      row.calificacion_promedio == null
        ? null
        : Number(row.calificacion_promedio),
    totalViews: Number(row.total_visualizaciones || 0),
    invitedAdvisors: Number(row.asesores_invitados || 0),
    isNew: !!row.es_nuevo,
  };
}

function generateInviteCode(userId: string) {
  const random = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36);
  return `${userId.slice(0, 8)}-${stamp}-${random}`;
}

export function buildAdvisorInviteLink(code: string) {
  const baseUrl =
    process.env.EXPO_PUBLIC_INVITE_BASE_URL || "https://posts.ilyrox.com/";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}type=invite&code=${encodeURIComponent(code)}`;
}

export async function getCommunityBuilders(currentUserId?: string) {
  const { data, error } = await supabase.rpc("get_constructores_comunidad", {
    p_current_user_id: currentUserId ?? null,
    p_limit: 24,
  });

  if (error) {
    log.warn("get_constructores_comunidad unavailable", error);
    return [];
  }

  return ((data || []) as CommunityBuilderRow[]).map(normalizeBuilder);
}

export async function getOrCreateAdvisorInviteCode(userId: string) {
  const { data: existing, error: selectError } = await supabase
    .from("asesor_invitacion_codigos")
    .select("codigo")
    .eq("invitador_id", userId)
    .maybeSingle();

  if (selectError) {
    log.warn("Could not read advisor invite code", selectError);
  }

  if (existing?.codigo) return existing.codigo as string;

  const codigo = generateInviteCode(userId);
  const { data, error } = await supabase
    .from("asesor_invitacion_codigos")
    .insert({ invitador_id: userId, codigo })
    .select("codigo")
    .single();

  if (error) throw error;
  return data.codigo as string;
}

export async function storeInviteCodeFromUrl(url: string) {
  const parsed = Linking.parse(url);
  const path = parsed.path || "";
  const hostname = parsed.hostname || "";
  const hasInvitePath =
    hostname === "invite" ||
    path === "invite" ||
    path.startsWith("invite/") ||
    path.includes("/invite/");
  const hasInviteParam =
    parsed.queryParams?.type === "invite" ||
    parsed.queryParams?.invite != null ||
    parsed.queryParams?.ref != null;

  if (!hasInvitePath && !hasInviteParam) return null;

  const rawCode =
    parsed.queryParams?.code ??
    parsed.queryParams?.invite ??
    parsed.queryParams?.ref;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

  if (!code || typeof code !== "string") return null;

  await AsyncStorage.setItem(STORED_INVITE_CODE_KEY, code);
  return code;
}

export async function applyStoredAdvisorInvite(invitedUserId: string) {
  const code = await AsyncStorage.getItem(STORED_INVITE_CODE_KEY);
  if (!code) return false;

  const { data, error } = await supabase.rpc("aceptar_invitacion_asesor", {
    p_codigo: code,
    p_invitado_id: invitedUserId,
  });

  if (error) {
    log.warn("Could not apply stored advisor invite", error);
    return false;
  }

  if (data) {
    await AsyncStorage.removeItem(STORED_INVITE_CODE_KEY);
  }

  return !!data;
}

export async function recordCommunityBuilderView(
  viewerId: string | undefined,
  builderId: string,
) {
  if (!viewerId || viewerId === builderId) return;

  const { error } = await supabase.rpc("registrar_vista_constructor", {
    p_viewer_id: viewerId,
    p_constructor_id: builderId,
  });

  if (error) {
    log.warn("Could not record community builder view", error);
  }
}