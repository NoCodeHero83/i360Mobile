/**
 * useCommunityBuilderViewTracker.ts
 * Hook para trackear visualizaciones de community builders en carousel
 *
 * Flujo:
 *   FlatList (70% visible + 800ms) → useViewTracker → Set pending → debounce 2s → RPC batch
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { ViewToken } from "react-native";
import { logger } from "@/utils/logger";

const log = logger.scoped("ViewTracker");

export interface UseViewTrackerOptions {
  onBatchReady: (builderIds: string[]) => Promise<void>;
  debounceMs?: number;
  maxBatchSize?: number;
  minimumViewTime?: number;
  threshold?: number;
}

export interface ViewTrackerResult {
  handleViewableItemsChanged: (info: { viewableItems: ViewToken[] }) => void;
  viewabilityConfig: {
    itemVisiblePercentThreshold: number;
    minimumViewTime: number;
  };
  flush: () => Promise<void>;
}

export function useViewTracker(options: UseViewTrackerOptions): ViewTrackerResult {
  const {
    onBatchReady,
    debounceMs = 2000,
    maxBatchSize = 15,
    minimumViewTime = 800,
    threshold = 70,
  } = options;

  const pendingIdsRef = useRef(new Set<string>());
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    clearTimer();
    debounceTimerRef.current = setTimeout(() => {
      log.info(`[ViewTracker] Debounce expired, flushing ${pendingIdsRef.current.size} items`);
      flush();
    }, debounceMs);
  }, [clearTimer, debounceMs]);

  const flush = useCallback(async () => {
    if (isFlushingRef.current) {
      log.info("[ViewTracker] Already flushing, skipping");
      return;
    }
    if (pendingIdsRef.current.size === 0) {
      log.info("[ViewTracker] No pending items to flush");
      return;
    }

    isFlushingRef.current = true;
    clearTimer();

    const ids = Array.from(pendingIdsRef.current);
    pendingIdsRef.current.clear();

    log.info(`[ViewTracker] Flushing ${ids.length} views:`, ids);

    try {
      await onBatchReady(ids);
      log.info(`[ViewTracker] Successfully recorded ${ids.length} views`);
    } catch (error) {
      log.warn("[ViewTracker] Error recording views:", error);
    } finally {
      isFlushingRef.current = false;
      if (pendingIdsRef.current.size > 0) {
        log.info(`[ViewTracker] ${pendingIdsRef.current.size} items accumulated during flush, scheduling another`);
        scheduleFlush();
      }
    }
  }, [onBatchReady, clearTimer, scheduleFlush]);

  const handleViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const previousSize = pendingIdsRef.current.size;

      viewableItems.forEach((viewable) => {
        const item = viewable.item as { type?: string; id?: string };
        if (item?.type === "builder" && item?.id) {
          pendingIdsRef.current.add(item.id);
        }
      });

      const newItems = pendingIdsRef.current.size - previousSize;

      if (newItems > 0) {
        log.info(`[ViewTracker] ${newItems} new viewable items detected. Total pending: ${pendingIdsRef.current.size}`);
      }

      if (pendingIdsRef.current.size >= maxBatchSize) {
        log.info(`[ViewTracker] Batch size reached (${pendingIdsRef.current.size}), triggering immediate flush`);
        clearTimer();
        flush();
      } else {
        scheduleFlush();
      }
    },
    [flush, scheduleFlush, clearTimer, maxBatchSize]
  );

  const viewabilityConfig = useMemo(
    () => ({
      itemVisiblePercentThreshold: threshold,
      minimumViewTime,
    }),
    [threshold, minimumViewTime]
  );

  useEffect(() => {
    return () => {
      log.info("[ViewTracker] Component unmounting, cleaning up");
      clearTimer();
      pendingIdsRef.current.clear();
    };
  }, [clearTimer]);

  return {
    handleViewableItemsChanged,
    viewabilityConfig,
    flush,
  };
}
