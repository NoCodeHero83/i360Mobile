/**
 * useFeed.ts
 * Hook principal para cargar el feed con algoritmo de engagement.
 *
 * Usa React Query (useInfiniteQuery) para paginación infinita + cache.
 * La lógica de fetch vive en feedService; este archivo orquesta cache,
 * auto-refresh y enriquecimiento post-carga (stats + recomendaciones).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { FeedItem, RecommendedByPreviewUser, User } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { feedService } from "@/services/feedService";
import { profileService } from "@/services/profileService";
import { PAGINATION, TIMEOUTS } from "@/constants/config";
import { logger } from "@/utils/logger";

const log = logger.scoped("useFeed");

const STATS_REFRESH_THROTTLE_MS = 60_000;
const AUTO_REFRESH_INTERVAL_MS = 2 * 60_000;

interface UseFeedOptions {
  userId?: string;
  pageSize?: number;
  enableAutoRefresh?: boolean;
}

const feedKeys = {
  all: ["feed"] as const,
  list: (pageSize: number, userId?: string) =>
    [...feedKeys.all, "list", pageSize, userId ?? "anon"] as const,
  item: (id: string, userId?: string) =>
    [...feedKeys.all, "item", id, userId ?? "anon"] as const,
};

function dedupeItems(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const item of items) {
    const contentId =
      item.postDetails?.id || item.propertyDetails?.id || item.id;
    const key = `${item.type}_${contentId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function useFeed(options: UseFeedOptions = {}) {
  const {
    userId,
    pageSize = PAGINATION.FEED_PAGE_SIZE,
    enableAutoRefresh = true,
  } = options;

  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: feedKeys.list(pageSize, userId),
    queryFn: ({ pageParam = 0 }) =>
      feedService.getFeedPage(pageParam as number, pageSize, userId),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    staleTime: 30_000,
    refetchInterval: enableAutoRefresh ? AUTO_REFRESH_INTERVAL_MS : false,
  });

  // Enriquecimiento post-carga: previews de recomendaciones
  const [recommendedByPreviewByUserId, setRecommendedByPreviewByUserId] =
    useState<Record<string, RecommendedByPreviewUser[] | undefined>>({});

  const baseItems = useMemo(() => {
    const pages = query.data?.pages || [];
    return dedupeItems(pages.flatMap((p) => p.items));
  }, [query.data]);

  const items = useMemo<FeedItem[]>(() => {
    if (Object.keys(recommendedByPreviewByUserId).length === 0) return baseItems;
    return baseItems.map((it) => {
      const preview = recommendedByPreviewByUserId[it.user.id];
      if (!preview) return it;
      return {
        ...it,
        user: { ...it.user, recommendedByPreview: preview },
      };
    });
  }, [baseItems, recommendedByPreviewByUserId]);

  // Cargar previews para IDs nuevos que aparezcan en la lista
  useEffect(() => {
    if (baseItems.length === 0) return;
    const ids = Array.from(
      new Set(
        baseItems
          .map((it) => it.user?.id)
          .filter(Boolean) as string[],
      ),
    );
    const pendingIds = ids.filter(
      (id) => recommendedByPreviewByUserId[id] === undefined,
    );
    if (pendingIds.length === 0) return;

    let cancelled = false;
    profileService
      .getRecommendationPreviewsForUsers(pendingIds, userId)
      .then((map) => {
        if (cancelled) return;
        setRecommendedByPreviewByUserId((prev) => {
          const next = { ...prev };
          Object.entries(map).forEach(([id, previews]) => {
            next[id] = previews as RecommendedByPreviewUser[];
          });
          return next;
        });
      })
      .catch((err) => log.error("getRecommendationPreviews failed", err));

    return () => {
      cancelled = true;
    };
  }, [baseItems, recommendedByPreviewByUserId]);

  // Actualización manual de stats (throttle 60s) — usado por useFocusEffect externo
  const lastStatsUpdateRef = useRef<number>(0);
  const refreshUserStats = useMemo(() => {
    return async () => {
      const now = Date.now();
      if (now - lastStatsUpdateRef.current < STATS_REFRESH_THROTTLE_MS) return;
      lastStatsUpdateRef.current = now;

      const ids = Array.from(
        new Set(
          baseItems
            .map((it) => it.user?.id)
            .filter(Boolean) as string[],
        ),
      );
      if (ids.length === 0) return;

      const [statsRows, previewsMap] = await Promise.all([
        feedService.getReviewStats(ids),
        profileService.getRecommendationPreviewsForUsers(ids, userId),
      ]);

      const statsById = new Map(statsRows.map((s) => [s.profesional_id, s]));

      // Mutar la cache directamente con las stats frescas
      queryClient.setQueryData(
        feedKeys.list(pageSize, userId),
        (prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            pages: prev.pages.map((page: any) => ({
              ...page,
              items: page.items.map((it: FeedItem) => {
                const stats = statsById.get(it.user.id);
                if (!stats) return it;
                const nextUser: User = {
                  ...it.user,
                  rating:
                    typeof stats.calificacion_promedio === "number"
                      ? stats.calificacion_promedio
                      : 0,
                  totalRatings:
                    typeof stats.total_resenas === "number"
                      ? stats.total_resenas
                      : 0,
                  positiveRecommendations:
                    typeof stats.total_recomiendan === "number"
                      ? stats.total_recomiendan
                      : 0,
                  negativeRecommendations:
                    typeof stats.total_no_recomiendan === "number"
                      ? stats.total_no_recomiendan
                      : 0,
                };
                return { ...it, user: nextUser };
              }),
            })),
          };
        },
      );

      // Actualizar previews
      setRecommendedByPreviewByUserId((prev) => {
        const next = { ...prev };
        Object.entries(previewsMap).forEach(([id, previews]) => {
          next[id] = previews as RecommendedByPreviewUser[];
        });
        return next;
      });
    };
  }, [baseItems, pageSize, queryClient, userId]);

  const loadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query.hasNextPage, query.isFetchingNextPage, query.fetchNextPage]);

  const refresh = useCallback(() => {
    return query.refetch();
  }, [query.refetch]);

  return {
    items,
    loading: query.isLoading,
    refreshing: query.isRefetching && !query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    error: query.error ? (query.error as Error).message : null,
    loadMore,
    refresh,
    refreshUserStats,
  };
}

/**
 * Inserta una publicación recién creada al inicio del feed (prepend optimista),
 * para que aparezca SIEMPRE en la posición 0 justo tras publicar, ignorando el
 * engagement_score. El orden por score se reaplica en el siguiente refetch
 * (pull-to-refresh, cambio de pestaña, auto-refresh o reentrar).
 *
 * `contenidoId` es el id del post/reel/propiedad: getFeedItem acepta tanto el id
 * del feed_item como el contenido_id.
 */
export async function prependPublishedFeedItem(
  queryClient: QueryClient,
  contenidoId: string,
  userId?: string,
) {
  try {
    const item = await feedService.getFeedItem(contenidoId, userId);
    if (!item) return;
    queryClient.setQueriesData(
      { queryKey: [...feedKeys.all, "list"] },
      (prev: any) => {
        if (!prev?.pages?.length) return prev;
        const exists = prev.pages.some((pg: any) =>
          pg.items?.some((it: FeedItem) => it.id === item.id),
        );
        if (exists) return prev;
        const [first, ...rest] = prev.pages;
        return {
          ...prev,
          pages: [
            { ...first, items: [item, ...(first.items ?? [])] },
            ...rest,
          ],
        };
      },
    );
  } catch (e) {
    log.warn("prependPublishedFeedItem failed", e);
  }
}

// Re-exports para consumidores existentes
export { formatTimestamp } from "@/services/feedService";

export function useFeedItem(feedItemId: string) {
  const { user } = useAuth();
  const currentUserId = user?.id;
  const query = useQuery({
    queryKey: feedKeys.item(feedItemId, currentUserId),
    queryFn: () => feedService.getFeedItem(feedItemId, currentUserId),
    enabled: Boolean(feedItemId),
    staleTime: TIMEOUTS.SESSION_REFRESH_MS,
  });

  return {
    item: query.data ?? null,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  };
}