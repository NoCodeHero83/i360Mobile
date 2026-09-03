/**
 * ConversationsList.tsx
 * Lista de conversaciones con soporte de etiquetas
 */

import React, { useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppInput } from "../../design-system/components/AppInput";
import ConversationsSelectionModal from "./ConversationsSelectionModal";
import TagFilterBar from "./TagFilterBar";
import TagsModal from "./TagsModal";
import { NotificationItem } from "../Notificaciones/NotificationItem";
import { useRouter } from "expo-router";
import { useTags } from "../../hooks/messaging/useTags";
import { COLORS } from "../../constants";
import { Avatar } from "../shared";

interface ConversationsListProps {
  userId: string;
  onSelectConversation: (
    conversationId: string,
    otherUser: any,
    propertyId?: string | null,
  ) => void;
  // Nuevos props para recibir datos del hook desde MessagingScreen
  conversations: any[];
  loading: boolean;
  getConversationsForUser: (otherUserId: string) => Promise<any[]>;
  refresh: () => void;
}

export default function ConversationsList({
  userId,
  onSelectConversation,
  conversations,
  loading,
  getConversationsForUser,
  refresh,
}: ConversationsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectedGroupingUser, setSelectedGroupingUser] = useState<any>(null);
  const [specificConversations, setSpecificConversations] = useState<any[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showTagsManager, setShowTagsManager] = useState(false);
  const [longPressedGrouping, setLongPressedGrouping] = useState<any>(null);
  const [longPressedConvTags, setLongPressedConvTags] = useState<any[]>([]);
  const [showTagsAssignModal, setShowTagsAssignModal] = useState(false);
  // Override optimista de etiquetas por agrupación: la fila muestra la etiqueta
  // al instante sin esperar el refetch completo de la lista (3 consultas). Se
  // limpia cuando `refresh()` reconcilia con la data real.
  const [optimisticTags, setOptimisticTags] = useState<Record<string, any[]>>({});

  const { tags, createTag, deleteTag, updateTag, assignTag, removeTag, getConversationTags } = useTags(userId);

  const router = useRouter();

  // Aplica el refetch en segundo plano y, al terminar, suelta el override
  // optimista de esa agrupación (la data real ya trae la etiqueta).
  const reconcileTagsFor = (groupingId: string) => {
    Promise.resolve((refresh as any)()).finally(() => {
      setOptimisticTags((prev) => {
        if (!(groupingId in prev)) return prev;
        const next = { ...prev };
        delete next[groupingId];
        return next;
      });
    });
  };

  // Filtrar conversaciones por búsqueda y etiquetas
  const filteredConversations = React.useMemo(() => {
    // Aplicar overrides optimistas antes de filtrar/renderizar.
    let result = conversations.map((conv) =>
      optimisticTags[conv.id]
        ? { ...conv, etiquetas: optimisticTags[conv.id] }
        : conv,
    );

    // Filtro de búsqueda
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((conv) => {
        const otherUser = conv.other_user;
        const fullName = `${otherUser?.nombre || ""} ${otherUser?.apellido_paterno || ""
          }`.toLowerCase();
        return (
          fullName.includes(query) ||
          conv.ultimo_mensaje_preview?.toLowerCase().includes(query)
        );
      });
    }

    // Filtro de etiquetas
    if (selectedTagIds.length > 0) {
      result = result.filter((conv) => {
        // Cada agrupación tiene múltiples conversaciones
        // Necesitamos verificar si alguna de sus conversaciones tiene las etiquetas
        const convTags = conv.etiquetas || [];
        return selectedTagIds.some((tagId) =>
          convTags.some((tag: any) => tag.id === tagId),
        );
      });
    }

    return result;
  }, [conversations, searchQuery, selectedTagIds, optimisticTags]);

  const handleGroupingPress = async (grouping: any) => {
    const otherUserId = grouping.other_user?.id;
    if (!otherUserId) return;

    // Obtener las conversaciones específicas con este usuario
    const specificConvs = await getConversationsForUser(otherUserId);

    setSpecificConversations(specificConvs);
    setSelectedGroupingUser(grouping.other_user);
    setShowSelectionModal(true);
  };

  const handleGroupingLongPress = async (item: any) => {
    const recentConvId = item.conversacion_mas_reciente_id;
    if (!recentConvId) return;

    const convTags = await getConversationTags(recentConvId);
    setLongPressedGrouping(item);
    setLongPressedConvTags(convTags);
    setShowTagsAssignModal(true);
  };

  const handleToggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId],
    );
  };

  const handleUpdateTag = async (id: string, name: string, color: string) => {
    const success = await updateTag(id, name, color);
    if (success) {
      refresh();
    }
    return success;
  };

  const handleDeleteTag = async (tagId: string) => {
    const success = await deleteTag(tagId);
    if (success) {
      refresh();
    }
    return success;
  };

  const formatTime = (dateString: string | null) => {
    if (!dateString) return "";

    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (days === 1) {
      return "Ayer";
    } else if (days < 7) {
      return date.toLocaleDateString("es-MX", { weekday: "short" });
    } else {
      return date.toLocaleDateString("es-MX", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const renderConversation = ({ item }: { item: any }) => {
    const otherUser = item.other_user;
    const fullName = `${otherUser?.nombre || "Usuario"} ${otherUser?.apellido_paterno || ""
      }`;
    const unreadCount = item.total_mensajes_no_leidos || 0;
    const totalConvs = item.total_conversaciones || 0;
    const conversationTags = item.etiquetas || [];

    return (
      <TouchableOpacity
        style={styles.conversationItem}
        onPress={() => handleGroupingPress(item)}
        onLongPress={() => handleGroupingLongPress(item)}
        delayLongPress={400}
      >
        <Avatar uri={otherUser?.foto} name={otherUser?.nombre} size={56} />

        <View style={styles.conversationInfo}>
          <View style={styles.conversationHeader}>
            <Text style={styles.userName} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={styles.time}>
              {formatTime(item.ultima_actividad || item.ultimo_mensaje_en)}
            </Text>
          </View>

          <View style={styles.conversationFooter}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.ultimo_mensaje_preview || "Sin mensajes"}
              </Text>

              {/* Tags badges */}
              {conversationTags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {conversationTags.slice(0, 3).map((tag: any) => (
                    <View
                      key={tag.id}
                      style={[styles.tagBadge, { backgroundColor: tag.color }]}
                    >
                      <Text style={styles.tagBadgeText}>{tag.nombre}</Text>
                    </View>
                  ))}
                  {conversationTags.length > 3 && (
                    <Text style={styles.moreTagsText}>
                      +{conversationTags.length - 3}
                    </Text>
                  )}
                </View>
              )}

              {totalConvs > 0 && (
                <Text style={styles.propertiesCount}>
                  {totalConvs}{" "}
                  {totalConvs === 1 ? "conversación" : "conversaciones"}
                </Text>
              )}
            </View>

            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <AppInput
        containerStyle={styles.searchContainer}
        placeholder="Buscar conversaciones..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        leftIcon={
          <Ionicons name="search" size={20} color={COLORS.textTertiary} />
        }
        rightIcon={
          searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={COLORS.textTertiary}
              />
            </TouchableOpacity>
          ) : undefined
        }
      />

      {/* Tag Filter Bar */}
      <TagFilterBar
        tags={tags}
        selectedTagIds={selectedTagIds}
        onToggleTag={handleToggleTag}
        onManageTags={() => setShowTagsManager(true)}
      />

      {/* Notification Item */}
      <NotificationItem onPress={() => router.push('/(stack)/NotificationHistoryScreen')} />

      {/* Conversations List */}
      <FlatList
        data={filteredConversations}
        extraData={conversations} // Force update when conversations change
        keyExtractor={(item) => item.id}
        renderItem={renderConversation}
        contentContainerStyle={styles.listContent}
        onRefresh={refresh}
        refreshing={loading}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons
              name="chatbubbles-outline"
              size={64}
              color={COLORS.cardBorder}
            />
            <Text style={styles.emptyTitle}>
              {selectedTagIds.length > 0
                ? "No hay conversaciones con estas etiquetas"
                : "No hay conversaciones"}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery
                ? "No se encontraron resultados"
                : selectedTagIds.length > 0
                  ? "Intenta con otras etiquetas"
                  : "Tus conversaciones aparecerán aquí"}
            </Text>
          </View>
        }
      />

      {/* Conversations Selection Modal */}
      {selectedGroupingUser && (
        <ConversationsSelectionModal
          visible={showSelectionModal}
          onClose={() => {
            setShowSelectionModal(false);
            setSelectedGroupingUser(null);
          }}
          conversations={specificConversations}
          otherUserName={selectedGroupingUser.nombre}
          onSelectConversation={(conv) => {
            setShowSelectionModal(false);
            onSelectConversation(
              conv.id,
              selectedGroupingUser,
              conv.propiedad?.id || null,
            );
          }}
        />
      )}

      {/* Tags Manager Modal */}
      <TagsModal
        visible={showTagsManager}
        onClose={() => setShowTagsManager(false)}
        availableTags={tags}
        assignedTags={[]}
        onCreateTag={createTag}
        onDeleteTag={handleDeleteTag}
        onUpdateTag={handleUpdateTag}
      />

      {/* Tags Assign Modal (long press) */}
      <TagsModal
        visible={showTagsAssignModal}
        onClose={() => {
          setShowTagsAssignModal(false);
          setLongPressedGrouping(null);
          setLongPressedConvTags([]);
        }}
        availableTags={tags}
        assignedTags={longPressedConvTags}
        onAssignTag={async (tagId) => {
          const grouping = longPressedGrouping;
          const recentConvId = grouping?.conversacion_mas_reciente_id;
          if (!recentConvId) return false;
          const ok = await assignTag(recentConvId, tagId);
          if (ok) {
            const newTag = tags.find((t) => t.id === tagId)!;
            setLongPressedConvTags((prev) => [...prev, newTag]);
            // Fila actualizada al instante.
            setOptimisticTags((prev) => {
              const base = prev[grouping.id] ?? grouping.etiquetas ?? [];
              return { ...prev, [grouping.id]: [...base, newTag] };
            });
            reconcileTagsFor(grouping.id);
          }
          return ok;
        }}
        onRemoveTag={async (tagId) => {
          const grouping = longPressedGrouping;
          const recentConvId = grouping?.conversacion_mas_reciente_id;
          if (!recentConvId) return false;
          const ok = await removeTag(recentConvId, tagId);
          if (ok) {
            setLongPressedConvTags((prev) => prev.filter((t) => t.id !== tagId));
            setOptimisticTags((prev) => {
              const base = prev[grouping.id] ?? grouping.etiquetas ?? [];
              return {
                ...prev,
                [grouping.id]: base.filter((t: any) => t.id !== tagId),
              };
            });
            reconcileTagsFor(grouping.id);
          }
          return ok;
        }}
        onCreateTag={createTag}
        onUpdateTag={handleUpdateTag}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  searchContainer: {
    margin: 16,
    marginBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingBottom: 20,
  },
  conversationItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
    gap: 12,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  userName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  time: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginLeft: 8,
  },
  conversationFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  lastMessage: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 4,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.white,
  },
  moreTagsText: {
    fontSize: 10,
    color: COLORS.textTertiary,
    alignSelf: "center",
  },
  propertiesCount: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "500",
  },
  unreadBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: "center",
    marginLeft: 8,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: "bold",
    color: COLORS.white,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textTertiary,
    marginTop: 8,
    textAlign: "center",
  },
});
