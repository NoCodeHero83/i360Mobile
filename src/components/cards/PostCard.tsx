/**
 * PostCard - Tarjeta de post para el feed
 * ACTUALIZADO: Usa hooks reales para likes y share
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Modal } from "react-native";
import { FeedItem, User } from "../../types";

import { DIMENSIONS, COLORS } from "../../constants";
import { commonStyles } from "../../../styles";
import {
  UserHeader,
  ImageGallery,
  ReportModal,
  Avatar,
  RichText,
} from "../shared";
import ThreeDotsMenu, { MenuOption } from "../shared/ThreeDotsMenu";
import ConfirmDialog from "../shared/ConfirmDialog";
import CreatePost from "../CreateContent/CreatePost/CreatePost";
import { PublishSearchPostModal } from "../map/PublishSearchPostModal";
import { postsService } from "../../services/postsService";
import ActionButtons from "../ActionButtons";

import RecommendedUsersModal from "../modals/RecommendedUsersModal";
import { useFeedInteractions, useViewTracking } from "@/hooks";
import { useUserRecommendations } from "@/hooks/useUserRecommendations";
import { SpecialPostCard } from "../Feed/SpecialPostCard";
import { buildRecommendedText } from "./recommendedText";

interface PostCardProps {
  item: FeedItem;
  onClick: () => void;
  onUserClick?: (user: User) => void;
  onCommentClick: () => void;
  currentUserId?: string;
  onPostUpdated?: () => void;
}

const PostCard: React.FC<PostCardProps> = ({
  item,
  onClick,
  onUserClick,
  onCommentClick,
  currentUserId,
  onPostUpdated,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Hook de interacciones (reportes, opciones)
  const {
    showOptions,
    showReportModal,
    setShowOptions,
    setShowReportModal,
    handleReport,
  } = useFeedInteractions();

  // Hook de view tracking
  const { trackInteraction } = useViewTracking({
    feedItemId: item.id,
    userId: currentUserId,
    isVisible: true,
  });
  const isOwner = !!(currentUserId && currentUserId === item.user.id);

  const handleDelete = async () => {
    if (!item.postDetails) return;
    try {
      setDeleting(true);
      await postsService.deletePost(item.postDetails);
      setShowDeleteConfirm(false);
      onPostUpdated?.();
    } catch {
      // postsService.deletePost shows toast on success; errors bubble silently
    } finally {
      setDeleting(false);
    }
  };

  const ownerMenuOptions: MenuOption[] = [
    {
      icon: "pencil-outline",
      label: "Editar",
      onPress: () => setShowEditModal(true),
    },
    {
      icon: "trash-outline",
      label: "Eliminar",
      onPress: () => setShowDeleteConfirm(true),
      danger: true,
    },
  ];

  const isSpecialPost =
    ["openhouse", "aniversario", "sold"].includes(item.postType ?? "") ||
    (item.postType === "busqueda" && !!item.postDetails?.busquedas_json);

  const images = item.images || [];
  const hasImages = images.length > 0;
  const isShortContent = item.content.length < 100;
  const positiveRecommendations = item.user.positiveRecommendations ?? 0;
  const recommendedByPreview = item.user.recommendedByPreview ?? [];
  const recommendedText = buildRecommendedText(item.user);
  const [showRecommendedModal, setShowRecommendedModal] = React.useState(false);

  const { recommendedList, loadingRecommended, fetchRecommendations } =
    useUserRecommendations(item.user.id);

  const openRecommendedModal = async () => {
    setShowRecommendedModal(true);
    fetchRecommendations();
  };

  return (
    <View style={commonStyles.card}>
      <View style={styles.contentCard}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.headerFill} activeOpacity={0.9} onPress={onClick}>
            <UserHeader
              user={item.user}
              timestamp={item.timestamp}
              onUserClick={onUserClick}
              showOptions={showOptions}
              setShowOptions={setShowOptions}
              onReport={() => setShowReportModal(true)}
              totalRatings={item.user.totalRatings}
              showRecommendedPreview={false}
            />
          </TouchableOpacity>
          {isOwner && (
            <View style={styles.headerMenuWrapper}>
              <ThreeDotsMenu
                options={ownerMenuOptions}
                iconColor={COLORS.textSecondary}
                menuPosition="top-right"
                buttonStyle={styles.menuButtonTransparent}
              />
            </View>
          )}
        </View>

        {positiveRecommendations > 0 && (
          <TouchableOpacity
            style={styles.recommendedRow}
            onPress={openRecommendedModal}
            activeOpacity={0.85}
          >
            <View style={styles.recommendedAvatars}>
              {recommendedByPreview.slice(0, 2).map((u, idx) => (
                <View
                  key={`${u.id}-${idx}`}
                  style={[
                    styles.recommendedAvatarWrapper,
                    idx > 0 && styles.recommendedAvatarOverlap,
                  ]}
                >
                  <Avatar
                    uri={u.avatar || undefined}
                    name={u.name}
                    size={18}
                    style={{ borderWidth: 1, borderColor: COLORS.white }}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.recommendedText}>{recommendedText}</Text>
          </TouchableOpacity>
        )}

        {/* Imágenes o Contenido de Texto */}
        <View style={styles.contentContainer}>
          {isSpecialPost ? (
            <TouchableOpacity activeOpacity={0.95} onPress={onClick}>
              <SpecialPostCard item={item} mode="preview" />
            </TouchableOpacity>
          ) : !hasImages ? (
            <TouchableOpacity activeOpacity={0.95} onPress={onClick}>
              <View
                style={[
                  styles.textPostContainer,
                  isShortContent && styles.textPostGradient,
                  item.postType === "busqueda" && commonStyles.cardDetail,
                ]}
              >
                {/* La descripción se muestra COMPLETA, corta o larga: antes el
                    post largo se recortaba a 2 líneas con "ver más" y las frases
                    quedaban a medias. Solo cambia el tamaño de fuente. */}
                <RichText
                  style={[
                    isShortContent
                      ? styles.textPostLarge
                      : styles.textPostNormal,
                    item.postType === "busqueda" && commonStyles.textDetail,
                  ]}
                  content={item.content}
                />
              </View>
            </TouchableOpacity>
          ) : (
            <ImageGallery
              images={images}
              aspectRatio={DIMENSIONS.POST_ASPECT_RATIO}
              showDots={true}
              showImageCount={false}
              onImagePress={onClick}
            />
          )}
        </View>

        {/* Botones de acción - Estilo Instagram */}
        <View style={styles.actionsContainer}>
          <ActionButtons
            feedItemId={item.id}
            feedItemType="post"
            initialLikes={item.likes}
            comments={item.comments}
            userId={currentUserId}
            onCommentClick={() => {
              trackInteraction("comentario");
              onCommentClick();
            }}
            onTrackInteraction={trackInteraction}
            shareTitle={
              item.propertyDetails?.title ||
              (item.postDetails?.busquedas_json?.filtros?.tipo_propiedad
                ? `Se busca ${item.postDetails.busquedas_json.filtros.tipo_propiedad} en ${
                    item.postDetails.busquedas_json.filtros.ubicacion?.ciudad ||
                    item.postDetails.busquedas_json.filtros.ubicacion?.municipio ||
                    item.postDetails.busquedas_json.filtros.ubicacion?.estado ||
                    ""
                  }`.trim()
                : "Búsqueda de propiedad en Ilyrox")
            }
            shareDescription={item.content.substring(0, 100)}
            shareImageUrl={hasImages ? images[0] : undefined}
            orientation="horizontal"
            authorId={item.user.id}
            contentId={item.postDetails?.id}
            initialViews={item.views}
            initialShares={item.shares}
          />
        </View>

        {/* Modal de reporte */}
        <ReportModal
          visible={showReportModal}
          reportType="post"
          onClose={() => setShowReportModal(false)}
          onReport={handleReport}
        />
        <RecommendedUsersModal
          visible={showRecommendedModal}
          onClose={() => setShowRecommendedModal(false)}
          loading={loadingRecommended}
          users={recommendedList}
          totalCount={positiveRecommendations}
        />
        <ConfirmDialog
          visible={showDeleteConfirm}
          title="¿Eliminar post?"
          message="Esta acción no se puede deshacer."
          confirmText="Eliminar"
          cancelText="Cancelar"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          danger
          loading={deleting}
        />
      </View>
      {hasImages && (
        <View style={styles.captionContainer}>
          {/* Pie completo, sin recorte ni "ver más". */}
          <Text style={styles.captionText}>
            <Text style={styles.captionUser}>
              {item.user.nombre || item.user.name}{" "}
            </Text>
            {item.content}
          </Text>
        </View>
      )}
      {item.postType === "busqueda" && item.postDetails?.busquedas_json ? (
        <PublishSearchPostModal
          visible={showEditModal}
          editPost={item.postDetails}
          initialMetadata={item.postDetails?.busquedas_json}
          onClose={() => setShowEditModal(false)}
          onPublished={() => {
            setShowEditModal(false);
            onPostUpdated?.();
          }}
          userId={currentUserId}
        />
      ) : (
        <Modal visible={showEditModal} animationType="slide">
          <CreatePost
            post={item.postDetails}
            onBack={() => {
              setShowEditModal(false);
              onPostUpdated?.();
            }}
          />
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerFill: {
    flex: 1,
  },
  headerMenuWrapper: {
    paddingRight: 12,
    paddingTop: 8,
  },
  menuButtonTransparent: {
    backgroundColor: "transparent",
  },
  imageContainer: {
    width: "100%",
    backgroundColor: COLORS.white,
  },
  contentContainer: {
    width: "100%",
    backgroundColor: COLORS.white,
  },
  contentCard: {
    backgroundColor: COLORS.white,
    marginBottom: 2,
  },
  actionsContainer: {
    paddingHorizontal: 12,
    width: "100%",
    backgroundColor: COLORS.white,
    paddingVertical: 4,
  },
  captionContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  captionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  captionUser: {
    fontWeight: "bold",
  },
  textPostContainer: {
    padding: 20,
    minHeight: 120,
    justifyContent: "center",
  },
  textPostGradient: {
    backgroundColor: COLORS.gradientBackground,
    alignItems: "center",
    minHeight: 200,
  },
  textPostLarge: {
    fontSize: 24,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  textPostNormal: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },
  recommendedRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.white,
  },
  recommendedAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },
  recommendedAvatarWrapper: {
    borderRadius: 999,
    backgroundColor: COLORS.white,
  },
  recommendedAvatarOverlap: {
    marginLeft: -8,
  },
  recommendedText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
    maxWidth: 220,
  },
});

export default React.memo(PostCard);
