import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { blockService } from "@/services/blockService";
import { logger } from "@/utils/logger";

const log = logger.scoped("useUserBlock");

export function useUserBlock(
  blockerId?: string | null,
  blockedId?: string | null,
) {
  const queryClient = useQueryClient();
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!blockerId || !blockedId || blockerId === blockedId) {
      setIsBlocked(false);
      return false;
    }

    const next = await blockService.isBlocked(blockerId, blockedId);
    setIsBlocked(next);
    return next;
  }, [blockerId, blockedId]);

  useEffect(() => {
    refresh().catch((error) => log.warn("refresh failed", error));
  }, [refresh]);

  const invalidateBlockedContent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    queryClient.invalidateQueries({ queryKey: ["map-properties"] });
    queryClient.invalidateQueries({ queryKey: ["mapFeedItems"] });
    queryClient.invalidateQueries({ queryKey: ["user-blocks"] });
  }, [queryClient]);

  const block = useCallback(async () => {
    if (!blockerId || !blockedId) return;
    setLoading(true);
    try {
      await blockService.blockUser(blockerId, blockedId);
      setIsBlocked(true);
      invalidateBlockedContent();
    } finally {
      setLoading(false);
    }
  }, [blockerId, blockedId, invalidateBlockedContent]);

  const unblock = useCallback(async () => {
    if (!blockerId || !blockedId) return;
    setLoading(true);
    try {
      await blockService.unblockUser(blockerId, blockedId);
      setIsBlocked(false);
      invalidateBlockedContent();
    } finally {
      setLoading(false);
    }
  }, [blockerId, blockedId, invalidateBlockedContent]);

  return {
    isBlocked,
    loading,
    block,
    unblock,
    refresh,
  };
}
