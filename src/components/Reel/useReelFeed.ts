import { useState, useEffect, useCallback, useRef } from "react";
import { PAGINATION } from "@/constants";
import { reelService, ReelFeedRow } from "@/services/reelService";
import { FeedItem } from "../../types";
import { useAuth } from "@/context/AuthContext";

const mapRowToFeedItem = (r: ReelFeedRow): FeedItem => ({
  id: r.feed_item_id,
  type: "reel",
  content: r.descripcion || "",
  timestamp: new Date().toISOString(),
  images: r.thumbnail_url && r.thumbnail_url !== "" ? [r.thumbnail_url] : [],
  videoUrl: r.video_url || "",
  likes: r.likes_count || 0,
  comments: r.comentarios_count || 0,
  user: {
    id: r.autor_id,
    name: r.autor_nombre || "Usuario",
    avatar: r.autor_foto && r.autor_foto !== "" ? r.autor_foto : undefined,
  } as any,
  reelDetails: {
    id: r.reel_id,
  } as any,
});

/**
 * Feed lineal de reels para el visor.
 *
 * El reel abierto (`initialItem`) queda fijo en el índice 0; al deslizar
 * hacia abajo se cargan TODOS los demás reels en el mismo orden que el feed
 * principal (RPC get_reels_feed_paged). La paginación es por offset y los
 * reels ya presentes se deduplican por feed_item id (incluido el abierto).
 */
export const useReelFeed = (initialItem?: any) => {
  const { user } = useAuth();
  const [reels, setReels] = useState<FeedItem[]>(
    initialItem ? [initialItem] : [],
  );
  const [loading, setLoading] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  // ids de feed_item ya presentes en la lista (evita duplicar el reel abierto)
  const seenIdsRef = useRef<Set<string>>(
    new Set(initialItem?.id ? [initialItem.id] : []),
  );
  const pageSize = PAGINATION.REEL_PAGE_SIZE;

  const appendPage = useCallback(async () => {
    const rows = await reelService.getReelsFeed(
      pageSize,
      offsetRef.current,
      user?.id,
    );
    offsetRef.current += rows.length;

    if (rows.length < pageSize) setHasMore(false);

    const fresh = rows
      .filter((r) => !seenIdsRef.current.has(r.feed_item_id))
      .map(mapRowToFeedItem);

    if (fresh.length > 0) {
      fresh.forEach((item) => seenIdsRef.current.add(item.id));
      setReels((prev) => [...prev, ...fresh]);
    }
  }, [pageSize, user?.id]);

  // Carga inicial (una sola vez por montaje del visor)
  useEffect(() => {
    (async () => {
      setLoading(true);
      await appendPage();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMoreReels = async () => {
    if (isFetchingMore || !hasMore) return;
    setIsFetchingMore(true);
    await appendPage();
    setIsFetchingMore(false);
  };

  return { reels, loading, fetchMoreReels, isFetchingMore };
};