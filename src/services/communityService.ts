import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("communityService");

const STORED_INVITE_CODE_KEY = "ilyrox:asesor_invite_code";
const DEVICE_TOKEN_KEY = "ilyrox:device_token";

let invitationAppliedForSession: string | null = null;

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
  const baseUrl = (
    process.env.EXPO_PUBLIC_INVITE_BASE_URL ||
    "https://www.ilyrox.com/invite"
  ).replace(/\/$/, "");
  return `${baseUrl}/${encodeURIComponent(code)}`;
}

export async function getCommunityBuilders(currentUserId?: string) {
  const { data, error } = await supabase.rpc("get_constructores_comunidad", {
    p_current_user_id: currentUserId ?? null,
    p_limit: null,
  });

  if (error) {
    log.warn("get_constructores_comunidad unavailable", error);
    return [];
  }

  return ((data || []) as CommunityBuilderRow[]).map(normalizeBuilder);
}

type CommunityBuilderV2Row = {
  user_id: string;
  nombre: string | null;
  foto: string | null;
  ocupacion: string | null;
  calificacion_promedio: number | string | null;
  asesores_invitados: number | string | null;
  ultimo_invitado_en: string | null;
  es_nuevo: boolean | null;
  total_visualizaciones: number | string | null;
};

function normalizeBuilderV2(row: CommunityBuilderV2Row): CommunityBuilder {
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

export interface PaginatedBuilders {
  builders: CommunityBuilder[];
  total: number;
  hasMore: boolean;
}

export async function getCommunityBuildersV2(
  limit: number = 4,
  offset: number = 0
): Promise<PaginatedBuilders> {
  const [{ data, error }, { data: countData }] = await Promise.all([
    supabase.rpc("get_constructores_comunidad_v2", {
      p_limit: limit,
      p_offset: offset,
    }),
    supabase.rpc("get_constructores_comunidad_v2_count"),
  ]);

  if (error) {
    log.warn("get_constructores_comunidad_v2 unavailable", error);
    return { builders: [], total: 0, hasMore: false };
  }

  const total = Number(countData) || 0;
  const builders = ((data || []) as CommunityBuilderV2Row[]).map(
    normalizeBuilderV2
  );

  return {
    builders,
    total,
    hasMore: offset + builders.length < total,
  };
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
    parsed.queryParams?.ref != null ||
    parsed.queryParams?.code != null;

  if (!hasInvitePath && !hasInviteParam) return null;

  const rawCode =
    parsed.queryParams?.code ??
    parsed.queryParams?.invite ??
    parsed.queryParams?.ref ??
    extractInviteCodeFromPath(path);
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

  if (!code || typeof code !== "string") return null;

  await AsyncStorage.setItem(STORED_INVITE_CODE_KEY, code);
  return code;
}

function extractInviteCodeFromPath(path: string): string | null {
  // /invite/{codigo} → extrae el segmento tras "invite/"
  const match = path.match(/invite\/([^/?#]+)/i);
  if (!match) return null;
  const code = match[1].split("=")[0];
  return code || null;
}

export async function getOrCreateDeviceToken(): Promise<string> {
  let token = await AsyncStorage.getItem(DEVICE_TOKEN_KEY);
  if (token) return token;

  token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  return token;
}

export async function registerDeviceInvite(refCode: string, plataforma?: string) {
  const deviceToken = await getOrCreateDeviceToken();
  const fp = await getDeviceFingerprint();
  log.info("registerDeviceInvite: Registrando con fingerprint", {
    deviceToken,
    refCode,
    plataforma: plataforma || "mobile",
    fp,
  });
  const { error } = await supabase.rpc("registrar_dispositivo_invitacion", {
    p_device_token: deviceToken,
    p_ref_code: refCode,
    p_plataforma: plataforma || "mobile",
    p_ip: fp.ip,
    p_asn: fp.asn,
    p_os: fp.os,
    p_timezone: fp.timezone,
    p_pais: fp.pais,
    p_region: fp.region,
    p_ciudad: fp.ciudad,
    p_locale: fp.locale,
  });
  if (error) {
    log.warn("Could not register device invite", error);
    return false;
  }
  return true;
}

export async function captureInviteFromDeviceMatch(): Promise<string | null> {
  try {
    const deviceToken = await getOrCreateDeviceToken();
    const { data, error } = await supabase.rpc("buscar_invitacion_dispositivo", {
      p_device_token: deviceToken,
    });
    if (error) {
      log.warn("Could not search device invite", error);
      return null;
    }
    if (!data) return null;

    if (invitationAppliedForSession === data) {
      log.info("captureInviteFromDeviceMatch: Codigo ya procesado esta sesion, omitiendo", { code: data });
      return null;
    }

    await AsyncStorage.setItem(STORED_INVITE_CODE_KEY, data as string);
    return data as string;
  } catch (e) {
    log.warn("Device match failed", e);
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 4000): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getDeviceFingerprint() {
  const fingerprint: {
    ip?: string | null;
    asn?: string | null;
    timezone?: string | null;
    pais?: string | null;
    region?: string | null;
    ciudad?: string | null;
    locale?: string | null;
    os?: string | null;
  } = {
    timezone: getTimezone(),
    os: Platform.OS,
    locale: getLocale(),
  };
  try {
    const ipRes = await fetchWithTimeout("https://api.ipify.org/?format=json", 5000);
    if (ipRes && ipRes.ok) {
      const ipData = await ipRes.json();
      fingerprint.ip = ipData?.ip ?? null;

      if (fingerprint.ip) {
        const geoRes = await fetchWithTimeout(`https://ipaddress.to/api/lookup/${fingerprint.ip}`, 5000);
        if (geoRes && geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData?.success) {
            fingerprint.asn = geoData.asn ?? null;
            fingerprint.pais = geoData.country ?? null;
            fingerprint.region = geoData.region ?? null;
            fingerprint.ciudad = geoData.city ?? null;
            fingerprint.timezone = geoData.timezone ?? fingerprint.timezone;
          }
        }
      }
    }
  } catch {
    // fallback silencioso, devuelve lo que se tenga
  }
  return fingerprint;
}

function getTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function getLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || null;
  } catch {
    return null;
  }
}

/**
 * Lee el portapapeles buscando un link de invitación. La landing copia el link
 * automáticamente al portapapeles cuando el usuario entra (sin tener la app).
 * El portapapeles es del sistema y sobrevive a la instalación, así que al abrir
 * la app por primera vez desde el icono se puede recuperar el código.
 */
export async function captureInviteFromClipboard(): Promise<string | null> {
  try {
    const text = await Clipboard.getStringAsync();
    if (!text) return null;

    const match =
      text.match(/invite\/([^/?#\s]+)/i) ||
      text.match(/invite[?&]code=([^&\s]+)/i);
    if (!match) return null;

    const rawCode = match[1];
    if (!rawCode || rawCode.length < 8) return null;

    if (invitationAppliedForSession === rawCode) {
      log.info("captureInviteFromClipboard: Codigo ya procesado esta sesion, omitiendo", { code: rawCode });
      return null;
    }

    await AsyncStorage.setItem(STORED_INVITE_CODE_KEY, rawCode);
    return rawCode;
  } catch (e) {
    log.warn("Clipboard match failed", e);
    return null;
  }
}

export async function captureInviteFromFingerprint(): Promise<string | null> {
  try {
    log.info("captureInviteFromFingerprint: Iniciando busqueda por fingerprint");
    const fp = await getDeviceFingerprint();
    log.info("captureInviteFromFingerprint: Fingerprint obtenido", {
      ip: fp.ip,
      asn: fp.asn,
      os: fp.os,
      timezone: fp.timezone,
      pais: fp.pais,
      region: fp.region,
      ciudad: fp.ciudad,
      locale: fp.locale,
      plataforma: Platform.OS,
    });
    const { data, error } = await supabase.rpc(
      "buscar_invitacion_por_fingerprint",
      {
        p_ip: fp.ip,
        p_asn: fp.asn,
        p_os: fp.os,
        p_timezone: fp.timezone,
        p_pais: fp.pais,
        p_region: fp.region,
        p_ciudad: fp.ciudad,
        p_locale: fp.locale,
        p_plataforma: Platform.OS,
        p_umbral_minimo: 30,
      },
    );

    log.info("captureInviteFromFingerprint: Respuesta RPC", { data, error });
    if (error) {
      log.warn("Could not search invite by fingerprint", error);
      return null;
    }
    if (!data) {
      log.info("captureInviteFromFingerprint: No se encontro invitacion por fingerprint");
      return null;
    }

    log.info("captureInviteFromFingerprint: Invitacion encontrada, guardando en AsyncStorage", { code: data });
    await AsyncStorage.setItem(STORED_INVITE_CODE_KEY, data as string);
    log.info("captureInviteFromFingerprint: Consumiendo fila de dispositivo", { code: data });
    await supabase.rpc("consumir_invitacion_dispositivo", { p_ref_code: data as string });
    return data as string;
  } catch (e) {
    log.warn("Fingerprint match failed", e);
    return null;
  }
}

export async function markDeviceInviteAssigned(): Promise<void> {
  try {
    const deviceToken = await getOrCreateDeviceToken();
    await supabase.rpc("marcar_dispositivo_asignado", {
      p_device_token: deviceToken,
    });
  } catch (e) {
    log.warn("Could not mark device assigned", e);
  }
}

export async function applyStoredAdvisorInvite(invitedUserId: string) {
  const code = await AsyncStorage.getItem(STORED_INVITE_CODE_KEY);
  if (!code) return false;

  if (invitationAppliedForSession === code) {
    log.info("applyStoredAdvisorInvite: Invitacion ya procesada esta sesion, omitiendo", { code });
    return true;
  }

  log.info("applyStoredAdvisorInvite: Aplicando invitacion", { code, invitedUserId });

  await AsyncStorage.removeItem(STORED_INVITE_CODE_KEY);
  await markDeviceInviteAssigned();

  const { data, error } = await supabase.rpc("aceptar_invitacion_asesor", {
    p_codigo: code,
    p_invitado_id: invitedUserId,
  });

  if (error) {
    log.warn("Could not apply stored advisor invite", error);
    return false;
  }

  if (data) {
    log.info("applyStoredAdvisorInvite: Invitacion aplicada, consumiendo dispositivo");
    invitationAppliedForSession = code;
    await supabase.rpc("consumir_invitacion_dispositivo", { p_ref_code: code });
    Clipboard.setStringAsync("").catch(() => {});
  }

  return !!data;
}

export async function bulkRecordConstructorViews(builderIds: string[]) {
  if (!builderIds?.length) {
    log.info("[views] bulkRecordConstructorViews: empty array, skipping");
    return;
  }

  log.info(`[views] bulkRecordConstructorViews: recording ${builderIds.length} views`, builderIds);

  const { data, error } = await supabase.rpc("bulk_record_constructor_views", {
    p_constructor_ids: builderIds,
  });

  if (error) {
    log.warn("[views] bulk_record_constructor_views failed", error);
  } else {
    log.info(`[views] bulk_record_constructor_views success`, data);
  }
}