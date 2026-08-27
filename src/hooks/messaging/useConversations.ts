/**
 * useConversations.ts
 * Hook para la lista de conversaciones agrupadas del usuario.
 *
 * Usa React Query (useQuery) para cache + deduplicación, y Supabase
 * Realtime para invalidar la key cuando hay cambios en la tabla
 * conversaciones. También sincroniza el total de no leídos con
 * useChatStore.
 */

import { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  conversationsService,
  GroupedConversation,
} from "@/services/conversationsService";
import { useChatStore } from "@/store/chatStore";
import { logger } from "@/utils/logger";

const log = logger.scoped("useConversations");

// Re-export para consumidores existentes
export type Conversation = GroupedConversation;

const conversationKeys = {
  all: ["conversations"] as const,
  list: (userId: string) => [...conversationKeys.all, userId] as const,
};

export function useConversations(userId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: userId
      ? conversationKeys.list(userId)
      : [...conversationKeys.all, "anonymous"],
    queryFn: () => conversationsService.listConversations(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
    // Red de seguridad: si el canal Realtime cae (CHANNEL_ERROR más abajo), el
    // contador de no leídos se congelaría hasta reiniciar la app.
    refetchInterval: 60_000,
  });

  const conversations = query.data ?? [];

  // Realtime: al recibir cambios en conversaciones que involucren al usuario,
  // invalidar la query para refetch (debounced en la suscripción misma).
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scheduleInvalidation = useCallback(() => {
    if (!userId) return;
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: conversationKeys.list(userId),
      });
    }, 500);
  }, [queryClient, userId]);

  useEffect(() => {
    if (!userId) return;

    // Dos suscripciones con filtro explícito (requerido por Supabase Realtime v2 con RLS).
    // No se puede hacer OR en un solo filtro, por eso se crean dos listeners en el mismo canal.
    const channel = supabase
      .channel(`conversations-realtime-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversaciones",
          filter: `usuario1_id=eq.${userId}`,
        },
        () => scheduleInvalidation(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversaciones",
          filter: `usuario2_id=eq.${userId}`,
        },
        () => scheduleInvalidation(),
      )
      .subscribe((status, err) => {
        if (err) {
          log.warn("Realtime subscription error", err);
        }
        if (status === "CHANNEL_ERROR") {
          log.warn("Channel error en conversaciones Realtime — retrying via polling");
        }
      });

    channelRef.current = channel;

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).catch((e) => {
          log.warn("Error removing channel", e);
        });
        channelRef.current = null;
      }
    };
  }, [userId, scheduleInvalidation]);

  // Recargar cuando la app vuelve al foreground
  useEffect(() => {
    if (!userId) return;
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        scheduleInvalidation();
      }
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [userId, scheduleInvalidation]);

  // Sincronizar el total de no leídos con el store global
  useEffect(() => {
    if (!userId) {
      useChatStore.getState().setTotalUnreadCount(0);
      return;
    }
    const totalUnread = conversations.reduce(
      (sum, conv) => sum + (conv.total_mensajes_no_leidos || 0),
      0,
    );
    useChatStore.getState().setTotalUnreadCount(totalUnread);
  }, [conversations, userId]);

  const getConversationsForUser = useCallback(
    (otherUserId: string) => {
      if (!userId) return Promise.resolve([]);
      return conversationsService.getConversationsForUser(userId, otherUserId);
    },
    [userId],
  );

  return {
    conversations,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refresh: () => query.refetch(),
    getConversationsForUser,
  };
}