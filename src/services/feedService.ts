/**
 * feedService.ts
 * Acceso a datos del feed principal. Combina feed_items + posts + reels +
 * propiedades + estadísticas de reseñas. Pura capa de datos: no hace
 * caching, memoization ni maneja estado — eso queda para React Query en
 * el hook consumidor.
 */

import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";
import { blockService } from "@/services/blockService";
import { profileService } from "@/services/profileService";
import {
  FeedItem,
  PropertyType,
  User,
} from "@/types";

const log = logger.scoped("feedService");

export type ReviewStatsRow = {
  profesional_id: string;
  calificacion_promedio: number | null;
  total_resenas: number | null;
  total_recomiendan: number | null;
  total_no_recomiendan: number | null;
};

const FEED_SELECT = `
  id,
  tipo_contenido,
  contenido_id,
  publicado_por,
  publicado_en,
  engagement_score,
  vistas_count,
  likes_count,
  comentarios_count,
  compartidos_count,
  estado_moderacion,
  perfiles!feed_items_publicado_por_fkey (
    id,
    nombre,
    foto,
    rol,
    ocupacion
  )
` as const;

const PROPERTY_SELECT = `
  id,
  created_at,
  created_by,
  codigo_propiedad,
  tipo,
  subtipo,
  pais,
  ciudad,
  colonia,
  municipio,
  estado,
  fotos,
  habitaciones,
  banos,
  medios_banos,
  estacionamientos,
  metros_cuadrados_construccion,
  metros_cuadrados_terreno,
  ancho_terreno,
  largo_terreno,
  pisos,
  area_oficinas_m2,
  patio_maniobras_m2,
  altura_libre_m,
  frente_metros,
  nivel_piso,
  tipo_ubicacion_comercial,
  en_esquina,
  sobre_avenida_principal,
  ubicacion_industrial,
  tipo_energia_kva,
  tipo_agua,
  concesion_agua,
  infra_electricidad,
  acceso_carretera,
  descripcion,
  longitud,
  latitud,
  operaciones_propiedad (
    tipo_operacion,
    precio,
    moneda,
    comision_tipo,
    comision_porcentaje,
    comision_meses,
    comision_monto_fijo,
    comparte_comision,
    porcentaje_comision_compartida
  )
` as const;

/**
 * Aplica la regla de visibilidad por comisión compartida a una query de
 * `propiedades`: una propiedad solo es visible públicamente (feed/mapa) si
 * comparte comisión. Su creador siempre la ve, comparta o no.
 */
function applyCommissionVisibility(query: any, currentUserId?: string): any {
  return currentUserId
    ? query.or(`comparte_comision.eq.true,created_by.eq.${currentUserId}`)
    : query.eq("comparte_comision", true);
}

function applyBlockedAuthors(query: any, blockedUserIds: string[]): any {
  if (blockedUserIds.length === 0) return query;
  return query.not("publicado_por", "in", `(${blockedUserIds.join(",")})`);
}

function applyBlockedPropertyOwners(query: any, blockedUserIds: string[]): any {
  if (blockedUserIds.length === 0) return query;
  return query.not("created_by", "in", `(${blockedUserIds.join(",")})`);
}

/**
 * Factor de decaimiento temporal para el ranking.
 * 0-24h: 1.0, 1-3d: 0.8, 3-7d: 0.5, 7-30d: 0.3, 30+d: 0.1
 */
export function calculateTimeFactor(timestamp: string): number {
  const now = new Date();
  const postDate = new Date(timestamp);
  const hoursDiff = (now.getTime() - postDate.getTime()) / (1000 * 60 * 60);

  if (hoursDiff < 24) return 1.0;
  if (hoursDiff < 72) return 0.8;
  if (hoursDiff < 168) return 0.5;
  if (hoursDiff < 720) return 0.3;
  return 0.1;
}

export function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Ahora";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

const buildUser = (perfil: any, stats?: ReviewStatsRow | null): User => ({
  id: perfil?.id || "",
  nombre: perfil?.nombre || "Usuario",
  name: perfil?.nombre || "Usuario",
  avatar: perfil?.foto || "https://placehold.co/100x100",
  isFollowing: false,
  role: (perfil?.rol === "agente" ? "Agent" : "User") as any,
  ocupacion: perfil?.ocupacion || undefined,
  rating:
    typeof stats?.calificacion_promedio === "number"
      ? stats.calificacion_promedio
      : 0,
  totalRatings:
    typeof stats?.total_resenas === "number" ? stats.total_resenas : 0,
  positiveRecommendations:
    typeof stats?.total_recomiendan === "number" ? stats.total_recomiendan : 0,
  negativeRecommendations:
    typeof stats?.total_no_recomiendan === "number"
      ? stats.total_no_recomiendan
      : 0,
});

const normalizePostType = (tipo?: string) =>
  tipo
    ?.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "") ?? "post";

const mapPostToFeedItem = (
  feedData: any,
  post: any,
  user: User,
): FeedItem => ({
  id: feedData.id,
  type: "post",
  user,
  content: post.contenido || "",
  postType: normalizePostType(post.tipo) as FeedItem["postType"],
  images: post.imagenes || [],
  likes: feedData.likes_count,
  comments: feedData.comentarios_count,
  views: feedData.vistas_count ?? 0,
  shares: feedData.compartidos_count ?? 0,
  timestamp: formatTimestamp(feedData.publicado_en),
  commentsList: [],
  foto_perfil_usuario: post.foto_perfil,
  fecha_hora: post.fecha_hora,
  nombre_asesor: post.nombre_asesor,
  ubicacion: post.ubicacion,
  foto_propiedad: post.foto_propiedad,
  antiguedad: post.antiguedad,
  postDetails: post,
  busquedas_json: post.busquedas_json,
});

const mapReelToFeedItem = (
  feedData: any,
  reel: any,
  user: User,
): FeedItem => ({
  id: feedData.id,
  type: "reel",
  user,
  content: reel.descripcion || "",
  videoUrl: reel.video_url,
  likes: feedData.likes_count,
  comments: feedData.comentarios_count,
  shares: feedData.compartidos_count ?? 0,
  timestamp: formatTimestamp(feedData.publicado_en),
  commentsList: [],
  reelDetails: reel,
});

const mapPropertyToFeedItem = (
  feedData: any,
  property: any,
  user: User,
): FeedItem => {
  const operation = Array.isArray(property.operaciones_propiedad)
    ? property.operaciones_propiedad[0]
    : property.operaciones_propiedad;

  return {
    id: feedData.id,
    type: "property",
    user,
    content: property.descripcion || "",
    likes: feedData.likes_count,
    comments: feedData.comentarios_count,
    views: feedData.vistas_count ?? 0,
    shares: feedData.compartidos_count ?? 0,
    timestamp: formatTimestamp(feedData.publicado_en),
    commentsList: [],
    propertyDetails: {
      id: property.id,
      code: property.codigo_propiedad || undefined,
      title: `${property.tipo} en ${property.ciudad}`,
      description: property.descripcion,
      longitud: property.longitud,
      latitud: property.latitud,
      price: operation?.precio || 0,
      currency: (operation?.moneda || "MXN") as "USD" | "MXN",
      createdAt: property.created_at,
      pais: property.pais || undefined,
      location: {
        address: `${property.municipio}, ${property.ciudad}, ${property.estado}`,
        country: "México",
        state: property.estado || "",
        city: property.ciudad || "",
        municipio: property.municipio || "",
        colony: property.colonia || "",
      },
      images: property.fotos || [],
      features: {
        beds: property.habitaciones || 0,
        baths: property.banos || 0,
        halfBaths: property.medios_banos || 0,
        parking: property.estacionamientos,
        floors: property.pisos || 0,
        constructionSqft: property.metros_cuadrados_construccion || 0,
        landSqft: property.metros_cuadrados_terreno || 0,
        // Industrial
        operationalAreaSqft: property.area_oficinas_m2 || 0,
        maneuveringYardSqft: property.patio_maniobras_m2 || 0,
        clearHeight: property.altura_libre_m || "",
        energiaKva: property.tipo_energia_kva || [],
        ubicacionIndustrial: property.ubicacion_industrial || "",
        // Comercial
        frontMeters: property.ancho_terreno || 0,
        backMeters: property.largo_terreno || 0,
        enEsquina: !!property.en_esquina,
        sobreAvenida: !!property.sobre_avenida_principal,
        floorLevel: property.nivel_piso ?? undefined,
        commercialLocation: property.tipo_ubicacion_comercial || "",
        // Agrícola
        tieneAgua:
          (Array.isArray(property.tipo_agua) && property.tipo_agua.length > 0) ||
          !!property.concesion_agua,
        electricidad: !!property.infra_electricidad,
        pieCarretera: !!property.acceso_carretera,
      },
      amenities: [],
      type: (property.tipo || "habitacional").toLowerCase() as PropertyType,
      subtype: (property.subtipo || property.tipo || "").toLowerCase(),
      operation: operation?.tipo_operacion === "renta" ? "Rent" : "Sale",
      status: "Publicada",
      operations: Array.isArray(property.operaciones_propiedad)
        ? property.operaciones_propiedad
        : property.operaciones_propiedad
          ? [property.operaciones_propiedad]
          : [],
      colonia: property.colonia || "",
    },
  };
};

export interface FeedPage {
  items: FeedItem[];
  nextPage: number | null;
}

export const feedService = {
  async getReviewStats(
    userIds: string[],
    currentUserId?: string,
  ): Promise<ReviewStatsRow[]> {
    const ids = Array.from(new Set(userIds.filter(Boolean)));
    if (ids.length === 0) return [];

    const { data, error } = await supabase
      .from("vw_estadisticas_resenas")
      .select(
        "profesional_id,calificacion_promedio,total_resenas,total_recomiendan,total_no_recomiendan",
      )
      .in("profesional_id", ids);

    if (error) {
      log.warn("getReviewStats failed", error);
      return [];
    }
    const rows = (((data || []) as unknown as ReviewStatsRow[]) ?? []).map(
      (row) => ({ ...row }),
    );

    if (!currentUserId) return rows;

    const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);
    if (blockedUserIds.length === 0) return rows;

    const { data: recs, error: recsError } = await supabase
      .from("recomendaciones_usuarios")
      .select("usuario_recomendado_id,recomienda")
      .in("usuario_recomendado_id", ids)
      .not("recomendado_por", "in", `(${blockedUserIds.join(",")})`);

    if (recsError) {
      log.warn("getReviewStats filtered recommendations failed", recsError);
      return rows;
    }

    const counts = new Map<string, { positive: number; negative: number }>();
    ids.forEach((id) => counts.set(id, { positive: 0, negative: 0 }));
    (recs ?? []).forEach((rec: any) => {
      const current = counts.get(rec.usuario_recomendado_id);
      if (!current) return;
      if (rec.recomienda) current.positive += 1;
      else current.negative += 1;
    });

    return rows.map((row) => {
      const count = counts.get(row.profesional_id);
      if (!count) return row;
      return {
        ...row,
        total_recomiendan: count.positive,
        total_no_recomiendan: count.negative,
      };
    });
  },

  async getFeedPage(
    pageNum: number,
    pageSize: number,
    currentUserId?: string,
  ): Promise<FeedPage> {
    const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);

    const { data: feedData, error: feedError } = await applyBlockedAuthors(
      supabase
      .from("feed_items")
      .select(FEED_SELECT)
      .eq("estado_moderacion", "activo")
      .is("deleted_at", null)
      .order("engagement_score", { ascending: false })
      .order("publicado_en", { ascending: false })
      .range(pageNum * pageSize, (pageNum + 1) * pageSize - 1),
      blockedUserIds,
    );

    if (feedError) throw feedError;
    if (!feedData || feedData.length === 0) {
      return { items: [], nextPage: null };
    }
    const feedRows = feedData as any[];

    const perfilIds = Array.from(
      new Set(
        feedRows
          .map((item: any) => (item.perfiles as any)?.id)
          .filter(Boolean) as string[],
      ),
    );

    const postIds = feedRows
      .filter((i: any) => i.tipo_contenido === "post")
      .map((i: any) => i.contenido_id);
    const reelIds = feedRows
      .filter((i: any) => i.tipo_contenido === "reel")
      .map((i: any) => i.contenido_id);
    const propertyIds = feedRows
      .filter((i: any) => i.tipo_contenido === "propiedad")
      .map((i: any) => i.contenido_id);

    const [postsRes, reelsRes, propertiesRes, statsRows] = await Promise.all([
      postIds.length > 0
        ? supabase
            .from("posts")
            .select("*")
            .in("id", postIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      reelIds.length > 0
        ? supabase
            .from("reels")
            .select("*")
            .in("id", reelIds)
            .is("deleted_at", null)
        : Promise.resolve({ data: [], error: null } as any),
      propertyIds.length > 0
        ? applyBlockedPropertyOwners(
            applyCommissionVisibility(
            supabase
              .from("propiedades")
              .select(PROPERTY_SELECT)
              .in("id", propertyIds)
              .eq("activo", true)
              .is("deleted_at", null),
            currentUserId,
            ),
            blockedUserIds,
          )
        : Promise.resolve({ data: [], error: null } as any),
      feedService.getReviewStats(perfilIds, currentUserId),
    ]);

    const postsMap = new Map((postsRes.data || []).map((p: any) => [p.id, p]));
    const reelsMap = new Map((reelsRes.data || []).map((r: any) => [r.id, r]));
    const propertiesMap = new Map(
      (propertiesRes.data || []).map((p: any) => [p.id, p]),
    );
    const statsByUserId = new Map<string, ReviewStatsRow>(
      statsRows.map((s) => [s.profesional_id, s]),
    );

    const items = feedRows
      .map((item: any) => {
        const perfil = item.perfiles as any;
        const stats = perfil?.id ? statsByUserId.get(perfil.id) : null;
        const user = buildUser(perfil, stats);

        if (item.tipo_contenido === "post") {
          const post = postsMap.get(item.contenido_id);
          return post ? mapPostToFeedItem(item, post, user) : null;
        }
        if (item.tipo_contenido === "reel") {
          const reel = reelsMap.get(item.contenido_id);
          return reel ? mapReelToFeedItem(item, reel, user) : null;
        }
        if (item.tipo_contenido === "propiedad") {
          const property = propertiesMap.get(item.contenido_id);
          return property ? mapPropertyToFeedItem(item, property, user) : null;
        }
        return null;
      })
      .filter((it: FeedItem | null): it is FeedItem => it !== null);

    return {
      items,
      nextPage: feedRows.length === pageSize ? pageNum + 1 : null,
    };
  },

  async getPropertiesAsFeedItems(
    propertyIds: string[],
    currentUserId?: string,
  ): Promise<FeedItem[]> {
    if (!propertyIds.length) return [];

    const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);

    const { data: feedData, error: feedError } = await applyBlockedAuthors(
      supabase
      .from("feed_items")
      .select(FEED_SELECT)
      .eq("tipo_contenido", "propiedad")
      .eq("estado_moderacion", "activo")
      .is("deleted_at", null)
      .in("contenido_id", propertyIds)
      .order("engagement_score", { ascending: false }),
      blockedUserIds,
    );

    if (feedError) throw feedError;
    if (!feedData || feedData.length === 0) return [];
    const feedRows = feedData as any[];

    const foundIds = feedRows.map((i: any) => i.contenido_id);
    const perfilIds = Array.from(
      new Set(feedRows.map((i: any) => (i.perfiles as any)?.id).filter(Boolean)),
    ) as string[];

    const [propertiesRes, statsRows, previewsByUserId] = await Promise.all([
      applyBlockedPropertyOwners(
        applyCommissionVisibility(
        supabase
          .from("propiedades")
          .select(PROPERTY_SELECT)
          .in("id", foundIds)
          .eq("activo", true)
          .is("deleted_at", null),
        currentUserId,
        ),
        blockedUserIds,
      ),
      feedService.getReviewStats(perfilIds, currentUserId),
      profileService.getRecommendationPreviewsForUsers(perfilIds, currentUserId),
    ]);

    const propertiesMap = new Map(
      (propertiesRes.data || []).map((p: any) => [p.id, p]),
    );
    const statsByUserId = new Map<string, ReviewStatsRow>(
      statsRows.map((s) => [s.profesional_id, s]),
    );

    return feedRows
      .map((item: any) => {
        const perfil = item.perfiles as any;
        const stats = perfil?.id ? statsByUserId.get(perfil.id) : null;
        const user = {
          ...buildUser(perfil, stats),
          recommendedByPreview: perfil?.id ? previewsByUserId[perfil.id] : [],
        };
        const property = propertiesMap.get(item.contenido_id);
        return property ? mapPropertyToFeedItem(item, property, user) : null;
      })
      .filter((it: FeedItem | null): it is FeedItem => it !== null);
  },

  async getFeedItem(
    feedItemId: string,
    currentUserId?: string,
  ): Promise<FeedItem | null> {
    const blockedUserIds = await blockService.getBlockedUserIds(currentUserId);

    const feedItemQuery = applyBlockedAuthors(
      supabase
      .from("feed_items")
      .select(FEED_SELECT)
      .or(`id.eq.${feedItemId},contenido_id.eq.${feedItemId}`)
      .limit(1),
      blockedUserIds,
    );

    const { data: feedData, error: feedError } =
      await feedItemQuery.maybeSingle();

    if (feedError) throw feedError;
    if (!feedData) return null;

    const { tipo_contenido, contenido_id } = feedData;
    const perfil = (feedData as any).perfiles as any;
    const user = buildUser(perfil);

    if (tipo_contenido === "post") {
      const { data } = await supabase
        .from("posts")
        .select("*")
        .eq("id", contenido_id)
        .single();
      return data ? mapPostToFeedItem(feedData, data, user) : null;
    }
    if (tipo_contenido === "reel") {
      const { data } = await supabase
        .from("reels")
        .select("*")
        .eq("id", contenido_id)
        .single();
      return data ? mapReelToFeedItem(feedData, data, user) : null;
    }
    if (tipo_contenido === "propiedad") {
      const { data } = await applyBlockedPropertyOwners(
        applyCommissionVisibility(
        supabase
          .from("propiedades")
          .select(PROPERTY_SELECT)
          .eq("id", contenido_id)
          .is("deleted_at", null),
        currentUserId,
        ),
        blockedUserIds,
      ).maybeSingle();
      return data ? mapPropertyToFeedItem(feedData, data, user) : null;
    }
    return null;
  },
};