import React, { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { COLORS } from "../../constants/colors";
import { ScreenWrapper } from "../../screens/ScreenWrapper";

import {
  FeedItem,
  Post,
  ProfileContentType,
  Property,
  Reel,
} from "../../types";

import SelectionModal from "../modals/SelectionModal";
import { useProfile } from "../../hooks/profile/useProfile";
import { useGridProfile } from "../../hooks/profile/useGridProfile";
import ReelDetail from "../Reel/ReelDetail";
import FeedDetail from "../Feed/FeedDetail";
import { useChatInitiator } from "@/hooks/messaging/useChatInitiator";
import { useUserBlock } from "@/hooks/useUserBlock";
import { router } from "expo-router";
import ProfileReelItem from "./ProfileReelItem";
import ProfilePostItem from "./ProfilePostItem";
import ProfilePropertyItem from "./ProfilePropertyItem";
import ConfirmDialog from "../shared/ConfirmDialog";
import { ConfirmationModal } from "../modals/ConfirmationModal";
import { supabase } from "../../lib/supabase";
import { logger } from "@/utils/logger";

import {
  formatFullName,
  formatLocation,
  formatPhoneNumber,
  formatRole,
} from "./profileFormatters";
import { mapPostToFeedItem, mapProfileToUser, mapReelToFeedItem } from "./profileMappers";
import { ProfileInfoHeader } from "./ProfileInfoHeader";
import { ProfileEditModals } from "./ProfileEditModals";

const log = logger.scoped("Profile");

interface ProfileProps {
  userId?: string | null;
  onBack?: () => void;
}

const FILTER_OPTIONS = [
  "Todas",
  "Publicada",
  "Suspendida",
  "Rentada",
  "Reservada",
  "Vendida",
];

const Profile: React.FC<ProfileProps> = ({ userId, onBack }) => {
  const { user: authUser } = useAuth();
  const { showToast } = useToast();
  const {
    profile,
    reviewStats,
    properties,
    posts,
    reels,
    loading,
    fetchProfileData,
    loadRecommendedByUsers,
    loadNotRecommendedByUsers,
    updateProfilePhoto,
    handleRecommendation,
    userRecommendation,
    submittingRecommendation,
    isMe,
  } = useProfile(userId);

  const { deletePost, deleteReel } = useGridProfile();
  const { handleContact } = useChatInitiator();
  const {
    isBlocked,
    loading: blockingUser,
    block,
    unblock,
  } = useUserBlock(authUser?.id, userId);

  // Refresh control
  const [refreshing, setRefreshing] = useState(false);

  /** Carga los propiedad_id que ya tienen un Open House activo (una sola query). */
  const loadOpenHouseIds = useCallback(async () => {
    if (!authUser?.id) return;
    try {
      const { data } = await supabase
        .from("posts")
        .select("propiedad_id")
        .eq("publicado_por", authUser.id)
        .eq("tipo", "openhouse")
        .is("deleted_at", null)
        .not("propiedad_id", "is", null);
      if (data) {
        setOpenHousePropertyIds(new Set(data.map((p) => p.propiedad_id as string)));
      }
    } catch {
      // silencioso — el menú simplemente mostrará "Publicar" por defecto
    }
  }, [authUser?.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProfileData(), loadOpenHouseIds()]);
    setRefreshing(false);
  }, [fetchProfileData, loadOpenHouseIds]);

  const handleSilentRefresh = useCallback(async () => {
    await Promise.all([fetchProfileData(), loadOpenHouseIds()]);
  }, [fetchProfileData, loadOpenHouseIds]);

  // Content tabs & filters
  const [activeTab, setActiveTab] = useState<ProfileContentType>("properties");
  const [activeFilter, setActiveFilter] = useState<string>("Todas");
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Modal state
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(
    null,
  );
  const [editProperty, setEditProperty] = useState<Property | null>(null);
  const [editPost, setEditPost] = useState<Post | null>(null);
  const [editReel, setEditReel] = useState<Reel | null>(null);
  const [showEditPropertyModal, setShowEditPropertyModal] = useState(false);
  const [showEditPostModal, setShowEditPostModal] = useState(false);
  const [showEditReelModal, setShowEditReelModal] = useState(false);
  const [showOpenHouseModal, setShowOpenHouseModal] = useState(false);
  const [openHousePost, setOpenHousePost] = useState<Post | null>(null);

  // Set de propiedad_id que ya tienen un Open House activo — para saber si mostrar
  // "Publicar" o "Editar" en el menú de cada propiedad sin hacer una query por card.
  const [openHousePropertyIds, setOpenHousePropertyIds] = useState<Set<string>>(new Set());

  const [showRatingDetails, setShowRatingDetails] = useState(false);
  // Confirmación tras recomendar / no recomendar a otro asesor.
  const [showThanksModal, setShowThanksModal] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showRecommendedByModal, setShowRecommendedByModal] = useState(false);
  const [showNotRecommendedByModal, setShowNotRecommendedByModal] =
    useState(false);
  const [selectedPost, setSelectedPost] = useState<FeedItem | null>(null);
  const [selectedReel, setSelectedReel] = useState<FeedItem | null>(null);

  // Deletion state
  const [itemToDelete, setItemToDelete] = useState<{
    type: "property" | "post" | "reel";
    item: any;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const targetUserId = userId || authUser?.id;

  useFocusEffect(
    useCallback(() => {
      setSelectedProperty(null);
    }, []),
  );

  // Cargar Open House IDs al montar y cuando cambia el usuario
  React.useEffect(() => {
    loadOpenHouseIds();
  }, [loadOpenHouseIds]);

  const handleDeleteItem = useCallback(async () => {
    if (!itemToDelete) return;

    try {
      setDeleting(true);
      if (itemToDelete.type === "property") {
        const { error } = await supabase
          .from("propiedades")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", itemToDelete.item.id);
        if (error) throw error;
      } else if (itemToDelete.type === "post") {
        await deletePost(itemToDelete.item);
      } else if (itemToDelete.type === "reel") {
        await deleteReel(itemToDelete.item);
      }

      await handleRefresh();
      setItemToDelete(null);
    } catch (error: any) {
      log.error("Error deleting item:", error);
      showToast(error.message || "No se pudo eliminar el elemento", "error");
    } finally {
      setDeleting(false);
    }
  }, [itemToDelete, deletePost, deleteReel, handleRefresh]);

  const profileData = useMemo(
    () => ({
      name: formatFullName(profile),
      avatar: profile?.foto || undefined,
      role: profile?.ocupacion || (profile?.rol ? formatRole(profile?.rol) : ""),
      location: formatLocation(
        profile?.estado || null,
        profile?.pais || "México",
      ),
      phone: formatPhoneNumber(
        profile?.prefijo_celular || null,
        profile?.celular || null,
      ),
      anos_experiencia: profile?.fecha_inicio_carrera
        ? new Date().getFullYear() -
          new Date(profile.fecha_inicio_carrera).getFullYear()
        : 0,
      rating: reviewStats?.calificacion_promedio || 0,
      reviewCount: reviewStats?.total_resenas || 0,
      positiveRecommendations: reviewStats?.total_recomiendan || 0,
      negativeRecommendations: reviewStats?.total_no_recomiendan || 0,
      biography: profile?.biografia,
      website: profile?.sitio_web,
      profesionalismo: reviewStats?.promedio_profesionalismo || 0,
      eticaValores: reviewStats?.promedio_etica_valores || 0,
      pagoComisiones: reviewStats?.promedio_pago_comisiones || 0,
      comunicacionServicio: reviewStats?.promedio_comunicacion_servicio || 0,
    }),
    [profile, reviewStats],
  );

  const filteredProperties = useMemo(
    () =>
      activeFilter === "Todas"
        ? properties
        : properties.filter((p) => p.status === activeFilter),
    [properties, activeFilter],
  );

  const listData = useMemo(() => {
    if (!isMe && isBlocked) return [];
    switch (activeTab) {
      case "properties":
        return filteredProperties;
      case "posts":
        return posts;
      case "reels":
        return reels;
      default:
        return [];
    }
  }, [activeTab, filteredProperties, posts, reels, isMe, isBlocked]);

  const contentCounts = {
    properties: !isMe && isBlocked ? 0 : properties.length,
    posts: !isMe && isBlocked ? 0 : posts.length,
    reels: !isMe && isBlocked ? 0 : reels.length,
  };

  const userProfileMapped = useMemo(
    () => (profile ? mapProfileToUser(profile) : undefined),
    [profile],
  );

  const handlePostPress = useCallback(
    (post: Post) => {
      const targetId = post.feed_item_id || post.id;

      router.push({
        pathname: "/post/[id]",
        params: {
          id: targetId,
          item: JSON.stringify(mapPostToFeedItem(post, profile, targetUserId)),
        },
      });
    },
    [profile, targetUserId],
  );

  const handlePropertyPress = useCallback((property: Property) => {
    setSelectedProperty(property);
  }, []);

  const handleEditProperty = useCallback((property: Property) => {
    setEditProperty(property);
    setShowEditPropertyModal(true);
  }, []);

  const handleDeleteProperty = useCallback((property: Property) => {
    setItemToDelete({ type: "property", item: property });
  }, []);

  const handleEditPost = useCallback((post: Post) => {
    setEditPost(post);
    setShowEditPostModal(true);
  }, []);

  const handlePublishOpenHouse = useCallback(async (property: Property) => {
    try {
      const { data: existingPost } = await supabase
        .from("posts")
        .select("*")
        .eq("propiedad_id", property.id)
        .eq("tipo", "openhouse")
        .is("deleted_at", null)
        .maybeSingle();

      if (existingPost) {
        setOpenHousePost(existingPost as Post);
      } else {
        const { data: newPost, error } = await supabase
          .from("posts")
          .insert({
            publicado_por: authUser?.id,
            tipo: "openhouse",
            propiedad_id: property.id,
            ubicacion: [property.location?.address, property.location?.city, property.location?.state]
              .filter(Boolean).join(" - "),
            foto_propiedad: property.images?.[0] ?? null,
            contenido: `Open House: ${property.codigo_propiedad ?? ""}`.trim(),
            fecha_hora: new Date().toISOString(),
            status: "oculto",
          })
          .select()
          .single();
        if (error) throw error;
        setOpenHousePost(newPost as Post);
        // Marcar esta propiedad como que ya tiene Open House para reflejar en el menú
        setOpenHousePropertyIds((prev) => new Set([...prev, property.id]));
      }
      setShowOpenHouseModal(true);
    } catch (err: any) {
      showToast(err.message || "No se pudo abrir el Open House", "error");
    }
  }, [authUser?.id]);

  const handleDeletePost = useCallback((post: Post) => {
    setItemToDelete({ type: "post", item: post });
  }, []);

  const handleEditReel = useCallback((reel: Reel) => {
    setEditReel(reel);
    setShowEditReelModal(true);
  }, []);

  const handleDeleteReel = useCallback((reel: Reel) => {
    setItemToDelete({ type: "reel", item: reel });
  }, []);

  const handleReelPress = useCallback(
    (reel: Reel) => {
      console.log("[RDBG] Profile.handleReelPress", {
        id: reel.id,
        feed_item_id: reel.feed_item_id,
      });
      try {
        const payload = JSON.stringify(
          mapReelToFeedItem(reel, profile, targetUserId),
        );
        console.log("[RDBG] Profile reel -> router.push", {
          id: reel.feed_item_id || reel.id,
          itemLen: payload.length,
        });
        router.push({
          pathname: "/(stack)/reel/[id]",
          params: {
            id: reel.feed_item_id || reel.id,
            item: payload,
          },
        });
        console.log("[RDBG] Profile reel router.push OK");
      } catch (e) {
        console.log("[RDBG] Profile reel router.push ERROR", String(e));
      }
    },
    [profile, targetUserId],
  );

  const handleMessage = useCallback(() => {
    if (isBlocked) {
      showToast("Desbloquea a este usuario para enviarle mensajes", "info");
      return;
    }
    if (!targetUserId) return;
    handleContact(targetUserId, null, {
      id: targetUserId,
      nombre: profile?.nombre || "",
      apellido_paterno: profile?.apellido_paterno || "",
      foto: profile?.foto || null,
    });
  }, [handleContact, targetUserId, profile, isBlocked, showToast]);

  const handleToggleBlock = useCallback(() => {
    if (isBlocked) {
      unblock()
        .then(() => {
          showToast("Usuario desbloqueado", "success");
          handleRefresh();
        })
        .catch((error: any) => {
          log.error("Error unblocking user:", error);
          showToast(error?.message || "No se pudo desbloquear", "error");
        });
      return;
    }

    setShowBlockConfirm(true);
  }, [isBlocked, unblock, showToast, handleRefresh]);

  const handleConfirmBlock = useCallback(async () => {
    try {
      await block();
      setShowBlockConfirm(false);
      showToast("Usuario bloqueado", "success");
      await handleRefresh();
    } catch (error: any) {
      log.error("Error blocking user:", error);
      showToast(error?.message || "No se pudo bloquear", "error");
    }
  }, [block, showToast, handleRefresh]);

  // Recomendar/No recomendar: el botón ya reacciona al instante (optimista en
  // useProfile). Al registrarse el voto, mostramos la confirmación de gracias.
  // Si el usuario alterna y quita su voto (resultado null), no se muestra.
  const handleRecommendWithThanks = useCallback(
    async (recomienda: boolean) => {
      const result = await handleRecommendation(recomienda);
      if (result === true || result === false) {
        setShowThanksModal(true);
      }
    },
    [handleRecommendation],
  );

  const renderHeader = useCallback(
    () => (
      <ProfileInfoHeader
        profile={profile}
        profileData={profileData}
        targetUserId={targetUserId!}
        isMe={isMe}
        onBack={onBack}
        onSupport={() => router.push("/support")}
        onSettings={() => router.push("/settings")}
        onUpdatePhoto={updateProfilePhoto}
        onMessage={handleMessage}
        onToggleBlock={handleToggleBlock}
        isBlocked={isBlocked}
        blockingUser={blockingUser}
        onRecommend={handleRecommendWithThanks}
        isRecommended={userRecommendation}
        submittingRecommendation={submittingRecommendation}
        showRatingDetails={showRatingDetails}
        onToggleRatingDetails={() => setShowRatingDetails((v) => !v)}
        showRecommendedByModal={showRecommendedByModal}
        setShowRecommendedByModal={setShowRecommendedByModal}
        showNotRecommendedByModal={showNotRecommendedByModal}
        setShowNotRecommendedByModal={setShowNotRecommendedByModal}
        formatRole={formatRole}
        loadRecommendedByUsers={loadRecommendedByUsers}
        loadNotRecommendedByUsers={loadNotRecommendedByUsers}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        contentCounts={contentCounts}
        activeFilter={activeFilter}
        onOpenFilter={() => setShowFilterModal(true)}
        filteredPropertiesCount={filteredProperties.length}
      />
    ),
    [
      profile,
      profileData,
      targetUserId,
      isMe,
      onBack,
      updateProfilePhoto,
      handleMessage,
      handleToggleBlock,
      isBlocked,
      blockingUser,
      showRatingDetails,
      showRecommendedByModal,
      showNotRecommendedByModal,
      loadRecommendedByUsers,
      loadNotRecommendedByUsers,
      activeTab,
      contentCounts,
      activeFilter,
      filteredProperties.length,
      userRecommendation,
      submittingRecommendation,
      handleRecommendWithThanks,
    ],
  );

  const renderItem: ListRenderItem<any> = useCallback(
    ({ item, index }) => {
      switch (activeTab) {
        case "properties":
          return (
            <ProfilePropertyItem
              item={item}
              onPress={handlePropertyPress}
              isOwnProfile={isMe}
              onEdit={handleEditProperty}
              onDelete={handleDeleteProperty}
              onPublishOpenHouse={handlePublishOpenHouse}
              hasOpenHouse={openHousePropertyIds.has(item.id)}
              isLastInRow={(index + 1) % 3 === 0}
            />
          );
        case "posts":
          return (
            <ProfilePostItem
              item={item}
              user={userProfileMapped}
              onPress={handlePostPress}
              isOwnProfile={isMe}
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
            />
          );
        case "reels":
          return (
            <ProfileReelItem
              item={item}
              onPress={handleReelPress}
              isOwnProfile={isMe}
              onEdit={handleEditReel}
              onDelete={handleDeleteReel}
            />
          );
        default:
          return null;
      }
    },
    [
      activeTab,
      isMe,
      handlePropertyPress,
      handleEditProperty,
      handleDeleteProperty,
      handlePublishOpenHouse,
      openHousePropertyIds,
      userProfileMapped,
      handlePostPress,
      handleEditPost,
      handleDeletePost,
      handleReelPress,
      handleEditReel,
      handleDeleteReel,
    ],
  );

  const getEmptyMessage = () => {
    if (!isMe && isBlocked) {
      return "Usuario bloqueado";
    }

    switch (activeTab) {
      case "properties":
        return "No hay propiedades aún";
      case "posts":
        return "No hay posts aún";
      case "reels":
        return "No hay reels aún";
      default:
        return "No hay contenido";
    }
  };

  const getEmptyIcon = () => {
    if (!isMe && isBlocked) {
      return "ban-outline";
    }

    switch (activeTab) {
      case "properties":
        return "home-outline";
      case "posts":
        return "images-outline";
      case "reels":
        return "film-outline";
      default:
        return "alert-circle-outline";
    }
  };

  if (loading && !refreshing && !profile) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  return (
    <ScreenWrapper withHeader={false} style={styles.container}>
      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        key={activeTab}
        ListHeaderComponent={renderHeader}
        columnWrapperStyle={
          activeTab === "properties" ? styles.columnWrapper : undefined
        }
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name={getEmptyIcon()}
              size={48}
              color={COLORS.textTertiary}
            />
            <Text style={styles.emptyText}>{getEmptyMessage()}</Text>
          </View>
        }
      />

      {selectedPost && (
        <FeedDetail
          item={selectedPost}
          onClose={() => setSelectedPost(null)}
          currentUserId={authUser?.id}
        />
      )}

      {selectedReel && (
        <ReelDetail
          item={selectedReel}
          onClose={() => setSelectedReel(null)}
          currentUserId={authUser?.id}
        />
      )}

      <SelectionModal
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        onSelect={(value) => setActiveFilter(value)}
        title="Filtrar Propiedades"
        options={FILTER_OPTIONS}
        currentValue={activeFilter}
        searchable={false}
      />

      <ProfileEditModals
        selectedProperty={selectedProperty}
        onCloseProperty={() => setSelectedProperty(null)}
        handleSilentRefresh={handleSilentRefresh}
        showEditPropertyModal={showEditPropertyModal}
        editProperty={editProperty}
        onCloseEditProperty={(shouldRefresh) => {
          setShowEditPropertyModal(false);
          setEditProperty(null);
          if (shouldRefresh) handleRefresh();
        }}
        showEditPostModal={showEditPostModal}
        editPost={editPost}
        onCloseEditPost={() => {
          setShowEditPostModal(false);
          setEditPost(null);
          handleRefresh();
        }}
        showOpenHouseModal={showOpenHouseModal}
        openHousePost={openHousePost}
        onCloseOpenHouseModal={() => {
          setShowOpenHouseModal(false);
          setOpenHousePost(null);
          handleRefresh();
        }}
        showEditReelModal={showEditReelModal}
        editReel={editReel}
        onCloseEditReel={() => {
          setShowEditReelModal(false);
          setEditReel(null);
          handleRefresh();
        }}
      />

      <ConfirmDialog
        visible={!!itemToDelete}
        title="Eliminar elemento"
        message="¿Estás seguro de que deseas eliminar este elemento? Esta acción no se puede deshacer."
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={handleDeleteItem}
        onCancel={() => setItemToDelete(null)}
        danger
        loading={deleting}
      />

      <ConfirmDialog
        visible={showBlockConfirm}
        title="Bloquear usuario"
        message="Dejarás de ver sus propiedades y sus recomendaciones no contarán en tus mediciones visibles."
        confirmText="Bloquear"
        cancelText="Cancelar"
        onConfirm={handleConfirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
        danger
        loading={blockingUser}
      />

      {/* Confirmación tras recomendar / no recomendar (solo botón Aceptar) */}
      <ConfirmationModal
        visible={showThanksModal}
        title="¡Gracias!"
        message="Gracias por tu contribución, esta información será visible en todos los perfiles."
        confirmText="Aceptar"
        confirmVariant="primary"
        onConfirm={() => setShowThanksModal(false)}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: "flex-start",
    paddingHorizontal: 12,
  },
  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textTertiary,
  },
});

export default Profile;