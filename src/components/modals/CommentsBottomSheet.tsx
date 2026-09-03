/**
 * CommentsBottomSheet
 *
 * Modal de comentarios estilo bottom sheet con:
 * - Lista de comentarios con respuestas anidadas
 * - Input para nuevo comentario con soporte de imágenes
 * - Animación suave del teclado
 * - Optimistic updates via useComments hook
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  FlatList,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { AppBottomSheet } from "@/design-system/components/AppBottomSheet";
import { Ionicons } from "@expo/vector-icons";
import {
  KeyboardProvider,
  KeyboardAvoidingView,
} from "react-native-keyboard-controller";

import { useComments } from "../../hooks";
import { COLORS } from "../../constants";
import { Avatar } from "../shared";
import { ViewImage } from "./ViewImage";
import { Comment } from "../../types";
import { ScreenWrapper } from "../../screens/ScreenWrapper";
import MessageInput from "../Messaging/MessageInput";
import { supabase } from "../../lib/supabase";

// ============================================================================
// Types
// ============================================================================

interface CommentsBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  feedItemId: string;
  currentUserId?: string;
}

interface CommentItemProps {
  comment: Comment;
  replies: Comment[];
  isLiked: boolean;
  onLike: () => void;
  onReply: () => void;
}

// ============================================================================
// Constants
// ============================================================================


// ============================================================================
// Subcomponents
// ============================================================================

const CommentItem = React.memo<CommentItemProps>(
  ({ comment, replies, isLiked, onLike, onReply }) => (
    <ScreenWrapper withHeader={false}>
      <View style={styles.commentContainer}>
        {/* Comentario principal */}
        <View style={styles.commentMain}>
          <Avatar
            uri={comment.user.avatar}
            name={comment.user.nombre}
            size={36}
          />
          <View style={styles.commentBody}>
            <View style={styles.bubble}>
              <View style={styles.bubbleHeader}>
                <Text style={styles.userName}>{comment.user.nombre}</Text>
                <Text style={styles.timestamp}>{comment.timestamp}</Text>
              </View>
              {!!comment.text && (
                <Text style={styles.commentText}>{comment.text}</Text>
              )}
              {!!comment.imageUrl && (
                <ViewImage
                  src={comment.imageUrl}
                  containerStyle={styles.commentImageContainer}
                  imageStyle={styles.commentImage}
                />
              )}
            </View>

            <View style={styles.commentActions}>
              <TouchableOpacity onPress={onLike} style={styles.actionButton}>
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={16}
                  color={isLiked ? COLORS.error : COLORS.textTertiary}
                />
                {isLiked && <Text style={styles.actionText}>Like</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onReply} style={styles.actionButton}>
                <Text style={styles.actionText}>Responder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Respuestas */}
        {replies.map((reply) => (
          <View key={reply.id} style={styles.replyContainer}>
            <Avatar
              uri={reply.user.avatar}
              name={reply.user.nombre}
              size={28}
            />
            <View style={styles.commentBody}>
              <View style={styles.bubble}>
                <View style={styles.bubbleHeader}>
                  <Text style={styles.userName}>{reply.user.nombre}</Text>
                  <Text style={styles.timestamp}>{reply.timestamp}</Text>
                </View>
                {!!reply.text && (
                  <Text style={styles.commentText}>{reply.text}</Text>
                )}
                {!!reply.imageUrl && (
                  <ViewImage
                    src={reply.imageUrl}
                    containerStyle={styles.commentImageContainer}
                    imageStyle={styles.commentImage}
                  />
                )}
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScreenWrapper>
  ),
);

CommentItem.displayName = "CommentItem";

// ============================================================================
// Main Component
// ============================================================================

export default function CommentsBottomSheet({
  visible,
  onClose,
  feedItemId,
  currentUserId,
}: CommentsBottomSheetProps) {
  const { height: screenHeight } = useWindowDimensions();
  const modalHeight = screenHeight * 0.95;

  // State
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Refs
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  // Data
  const { comments, loading, posting, addComment, toggleCommentLike } =
    useComments({
      feedItemId,
      userId: currentUserId,
      userProfile: currentUserId
        ? { id: currentUserId, nombre: "Tú", foto: null }
        : undefined,
    });

  // Derived data
  const parentComments = useMemo(
    () => comments.filter((c) => c.parentId == null),
    [comments],
  );

  const replyToUser = useMemo(
    () => comments.find((c) => c.id === replyTo)?.user.nombre,
    [replyTo, comments],
  );

  // ============================================================================
  // Effects
  // ============================================================================

  // Focus input when replying
  useEffect(() => {
    if (replyTo && visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [replyTo, visible]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setReplyTo(null);
    } else if (visible && feedItemId && currentUserId) {
      // Marcar post como visto para cancelar notificaciones duplicadas
      supabase.rpc('mark_post_as_seen', {
        p_feed_item_id: feedItemId,
        p_user_id: currentUserId
      });
    }
  }, [visible, feedItemId, currentUserId]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSendCombined = useCallback(
    async (text?: string, imageUri?: string) => {
      const success = await addComment(
        text || undefined,
        imageUri || undefined,
        replyTo || undefined,
      );

      if (success) {
        setReplyTo(null);
        setTimeout(
          () => flatListRef.current?.scrollToEnd({ animated: true }),
          100,
        );
      }
    },
    [replyTo, addComment],
  );

  const handleLikeComment = useCallback(
    (commentId: string) => {
      toggleCommentLike(commentId);
    },
    [toggleCommentLike],
  );

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderComment = useCallback(
    ({ item }: { item: Comment }) => (
      <CommentItem
        comment={item}
        replies={comments.filter((c) => c.parentId === item.id)}
        isLiked={!!item.isLiked}
        onLike={() => handleLikeComment(item.id)}
        onReply={() => setReplyTo(item.id)}
      />
    ),
    [comments, handleLikeComment],
  );

  const ListEmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>¡Sé el primero en comentar!</Text>
      </View>
    );
  }, [loading]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <AppBottomSheet visible={visible} onClose={handleClose} statusBarTranslucent>
      <View style={[styles.sheet, { height: modalHeight }]}>
          <KeyboardProvider>
            <KeyboardAvoidingView
              style={styles.container}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={100}
            >
              {/* Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>
                  Comentarios ({comments.length})
                </Text>
                <TouchableOpacity
                  onPress={handleClose}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* Comments List */}
              <FlatList
                ref={flatListRef}
                data={parentComments}
                renderItem={renderComment}
                keyExtractor={(item) => item.id}
                style={styles.list}
                contentContainerStyle={[
                  styles.listContent,
                  parentComments.length === 0 && styles.listContentEmpty,
                ]}
                ListEmptyComponent={ListEmptyComponent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              />

              {/* Context bar (reply) */}
              {replyTo && (
                <View style={styles.contextBar}>
                  <View style={styles.replyBadge}>
                    <Text style={styles.replyBadgeText}>
                      Respondiendo a:{" "}
                      <Text style={styles.replyBadgeName}>{replyToUser}</Text>
                    </Text>
                    <TouchableOpacity onPress={() => setReplyTo(null)}>
                      <Ionicons
                        name="close"
                        size={20}
                        color={COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* MessageInput */}
              <View style={{ marginBottom: 30 }}>
                <MessageInput
                  ref={inputRef}
                  onSendCombined={handleSendCombined}
                  sending={posting}
                  mediaType="Images"
                />
              </View>
            </KeyboardAvoidingView>
          </KeyboardProvider>
      </View>
    </AppBottomSheet>
  );
}
const styles = StyleSheet.create({
  // Modal structure
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },

  // Handle
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: COLORS.cardBorder,
    borderRadius: 3,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  closeButton: {
    padding: 4,
  },

  // List
  list: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: COLORS.textTertiary,
    fontSize: 15,
  },

  // Comment item
  commentContainer: {
    marginBottom: 5,
  },
  commentMain: {
    flexDirection: "row",
    gap: 12,
  },
  commentBody: {
    flex: 1,
  },
  bubble: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
  },
  bubbleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  userName: {
    fontWeight: "600",
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  timestamp: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  commentText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  commentImageContainer: {
    marginTop: 8,
    width: "100%",
    borderRadius: 8,
    overflow: "hidden",
  },
  commentImage: {
    width: "100%",
    height: "100%",
  },

  commentActions: {
    flexDirection: "row",
    gap: 16,
    marginTop: 6,
    paddingLeft: 8,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textTertiary,
  },
  replyContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    paddingLeft: 48,
  },

  // Input area (legacy styles removed, keeping contextBar for reply)
  contextBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: COLORS.white,
  },
  replyBadge: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.background,
    padding: 10,
    borderRadius: 8,
  },
  replyBadgeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  replyBadgeName: {
    fontWeight: "bold",
  },
});
