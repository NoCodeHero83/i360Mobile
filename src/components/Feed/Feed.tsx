import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ViewToken,
  RefreshControl,
  Platform,
} from "react-native";
import { FlashList, FlashListRef } from "@shopify/flash-list";
import { FeedItem, User } from "../../types";
import CommunityBuildersCarousel from "../CommunityBuildersCarousel";
import UsersSlider from "../UsersSlider";
import { ReelCard, PropertyCard, PostCard } from "../cards";

import {
  useFocusEffect,
  useNavigation,
  useIsFocused,
} from "@react-navigation/native";
import { useRouter } from "expo-router";
import { COLORS } from "../../constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CommentsBottomSheet from "../modals/CommentsBottomSheet";
import { useFeed, useUserApprovals } from "@/hooks";

interface FeedProps {
  currentUserId?: string;
  currentUserState?: string;
  onUserClick?: (user: User) => void;
  onScroll?: (offset: number) => void;
  scrollEnabled?: boolean;
  refreshTimestamp?: number;
}

const Feed: React.FC<FeedProps> = ({
  currentUserId,
  currentUserState,
  onUserClick,
  onScroll,
  scrollEnabled = true,
  refreshTimestamp,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const [activeCommentItem, setActiveCommentItem] = useState<FeedItem | null>(
    null,
  );
  const flatListRef = useRef<FlashListRef<FeedItem>>(null);

  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [communityRefreshSignal, setCommunityRefreshSignal] = useState(0);

  // Hooks de datos reales
  const {
    items,
    loading,
    refreshing,
    hasMore,
    loadMore,
    refresh,
    refreshUserStats,
    error,
  } = useFeed({
    userId: currentUserId,
    pageSize: 20,
    // El feed solo se actualiza por acción del usuario (pull-to-refresh, tocar la
    // pestaña o reentrar). Sin auto-refresh periódico.
    enableAutoRefresh: false,
  });

  const handleRefresh = useCallback(async () => {
    setCommunityRefreshSignal((value) => value + 1);
    await refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      refreshUserStats();
      setCommunityRefreshSignal((value) => value + 1);
    }, [refreshUserStats]),
  );

  const lastRefreshTimestampRef = useRef<number | null>(null);
  useEffect(() => {
    if (refreshTimestamp && refreshTimestamp !== lastRefreshTimestampRef.current) {
      lastRefreshTimestampRef.current = refreshTimestamp;
      // La publicación recién creada ya está arriba en la cache (prepend optimista).
      // Solo llevamos la vista al inicio. NO refetch aquí: reordenaría por
      // engagement_score; ese orden se reaplica en pull-to-refresh / cambio de
      // pestaña / auto-refresh / reentrar.
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    }
  }, [refreshTimestamp]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", (e: any) => {
      if (navigation.isFocused()) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        handleRefresh();
      }
    });

    return unsubscribe;
  }, [navigation, handleRefresh]);

  const dynamicPaddingTop = useMemo(() => {
    return Platform.OS === "ios" ? insets.top + 140 : insets.top + 130;
  }, [insets.top]);

  const {
    pendingUsers,
    approveUser,
    rejectUser,
  } = useUserApprovals(currentUserId, currentUserState);

  // Banner de notificación
  const [bannerText, setBannerText] = useState("");
  const [bannerVisible, setBannerVisible] = useState(false);
  const bannerAnim = useRef(new Animated.Value(0)).current;

  // El feed home muestra siempre todo el contenido. El filtrado por búsqueda de
  // propiedades (filtros del store global) vive en el mapa / map-results, no aquí:
  // acoplarlo dejaba el feed vacío al volver tras publicar si quedaban filtros activos.

  // Viewability config

  const onViewableItemsChanged = useRef(
    ({
      viewableItems,
      changed,
    }: {
      viewableItems: ViewToken[];
      changed: ViewToken[];
    }) => {
      if (viewableItems.length > 0) {
        const firstVisible = viewableItems[0];
        setFocusedItemId((prevId) => {
          if (prevId !== firstVisible.item.id) {
            return firstVisible.item.id;
          }
          return prevId;
        });
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 200,
  }).current;

  const showBanner = useCallback(
    (text: string) => {
      setBannerText(text);
      setBannerVisible(true);
      Animated.timing(bannerAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => {
          Animated.timing(bannerAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setBannerVisible(false);
          });
        }, 1200);
      });
    },
    [bannerAnim],
  );

  const handleOpenDetail = useCallback(
    (item: FeedItem) => {
      console.log("[RDBG] Feed.handleOpenDetail", {
        id: item.id,
        type: item.type,
      });
      if (item.type === "property" && item.propertyDetails?.id) {
        navigation.navigate("(stack)", {
          screen: "property/[id]",
          params: { id: item.propertyDetails.id },
        });
      } else if (item.type === "reel") {
        // `router.push` siempre monta una pantalla nueva (a diferencia de
        // `navigate`, que reutiliza una instancia previa de reel/[id] y dejaba
        // el visor con el reel anterior). Coincide con cómo abre el perfil.
        try {
          const payload = JSON.stringify(item);
          console.log("[RDBG] Feed reel -> router.push", {
            id: item.id,
            itemLen: payload.length,
          });
          router.push({
            pathname: "/(stack)/reel/[id]",
            params: {
              id: item.id,
              item: payload,
            },
          });
          console.log("[RDBG] Feed reel router.push OK");
        } catch (e) {
          console.log("[RDBG] Feed reel router.push ERROR", String(e));
        }
      } else if (item.type === "post") {
        navigation.push("(stack)", {
          screen: "post/[id]",
          params: { id: item.id },
        });
      }
    },
    [navigation, router],
  );

  const handleScroll = useCallback(
    (event: any) => {
      const currentOffset = event.nativeEvent.contentOffset.y;
      onScroll?.(currentOffset);
    },
    [onScroll],
  );

  const handleOpenComments = useCallback((item: FeedItem) => {
    setActiveCommentItem(item);
  }, []);

  const handleCloseComments = useCallback(() => {
    setActiveCommentItem(null);
  }, []);

  const handleApproveUser = useCallback(
    async (user: User) => {
      const success = await approveUser(user.id);
      if (success) {
        showBanner("¡Aprobación enviada!");
      }
    },
    [approveUser, showBanner, onUserClick],
  );

  const handleRejectUser = useCallback(
    (user: User) => {
      rejectUser(user.id);
      showBanner("Aprobación rechazada");
    },
    [rejectUser, showBanner],
  );

  // Renderizar item según su tipo
  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      const isVisible = item.id === focusedItemId && isFocused;

      switch (item.type) {
        case "reel":
          return (
            <ReelCard
              item={item}
              onClick={() => handleOpenDetail(item)}
              onUserClick={onUserClick}
              onCommentClick={() => handleOpenComments(item)}
              isVisible={isVisible}
              currentUserId={currentUserId}
              onReelUpdated={refresh}
            />
          );
        case "property":
          return (
            <PropertyCard
              item={item}
              onClick={() => {
                handleOpenDetail(item);
              }}
              onUserClick={onUserClick}
              onCommentClick={() => handleOpenComments(item)}
              currentUserId={currentUserId}
              onPropertyUpdated={refresh}
            />
          );
        default:
          return (
            <PostCard
              item={item}
              onClick={() => {
                handleOpenDetail(item);
              }}
              onUserClick={onUserClick}
              onCommentClick={() => handleOpenComments(item)}
              currentUserId={currentUserId}
              onPostUpdated={refresh}
            />
          );
      }
    },
    [
      handleOpenDetail,
      handleOpenComments,
      onUserClick,
      focusedItemId,
      currentUserId,
      refresh,
    ],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  const ListHeader = useMemo(
    () => (
      <>
        <CommunityBuildersCarousel
          currentUserId={currentUserId}
          onUserClick={onUserClick}
          refreshSignal={communityRefreshSignal}
        />
        <UsersSlider
          users={pendingUsers}
          onUserClick={onUserClick}
          onApprove={handleApproveUser}
          onReject={handleRejectUser}
        />
      </>
    ),
    [
      currentUserId,
      communityRefreshSignal,
      pendingUsers,
      onUserClick,
      handleApproveUser,
      handleRejectUser,
    ],
  );

  const ListFooter = useMemo(() => {
    if (!hasMore && items.length > 0) {
      return (
        <View style={styles.endMessage}>
          <Text style={styles.endMessageText}>¡Has visto todo! 🎉</Text>
        </View>
      );
    }
    if (loading && items.length > 0) {
      return (
        <View style={styles.loadingMore}>
          <Text style={styles.loadingMoreText}>Cargando más...</Text>
        </View>
      );
    }
    return null;
  }, [hasMore, loading, items.length]);

  const ListEmpty = useMemo(() => {
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No se pudo cargar el feed</Text>
          <Text style={styles.emptySubtext}>{error}</Text>
          <Text style={styles.retryButton} onPress={refresh}>
            Reintentar
          </Text>
        </View>
      );
    }
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Cargando feed...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No hay contenido aún</Text>
        <Text style={styles.emptySubtext}>¡Sé el primero en publicar!</Text>
      </View>
    );
  }, [loading, error, refresh]);

  return (
    <>
      <FlashList
        ref={flatListRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={focusedItemId}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        // FlashList v2 (New Arch) ancla por defecto la posición del contenido visible
        // al insertar items arriba (maintainVisibleContentPosition). En un feed eso deja
        // la publicación recién creada / lo recién refrescado FUERA de vista por arriba
        // (había que hacer scroll hacia arriba para verlo). Lo desactivamos para que el
        // contenido nuevo en index 0 se muestre desde el top.
        maintainVisibleContentPosition={{ disabled: true }}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: dynamicPaddingTop },
        ]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressViewOffset={dynamicPaddingTop}
          />
        }
      />

      {/* Modal de comentarios */}
      {activeCommentItem && (
        <CommentsBottomSheet
          visible={activeCommentItem !== null}
          onClose={handleCloseComments}
          feedItemId={activeCommentItem.id}
          currentUserId={currentUserId}
        />
      )}

      {/* Banner de notificación */}
      {bannerVisible && (
        <Animated.View
          style={[
            styles.banner,
            {
              opacity: bannerAnim,
              transform: [
                {
                  translateY: bannerAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.bannerText}>{bannerText}</Text>
        </Animated.View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 100,
  },
  banner: {
    position: "absolute",
    top: 10,
    left: 16,
    right: 16,
    backgroundColor: COLORS.success,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bannerText: {
    color: COLORS.white,
    fontSize: 14,
    textAlign: "center",
    fontWeight: "700",
  },
  endMessage: {
    padding: 40,
    alignItems: "center",
  },
  endMessageText: {
    color: COLORS.textTertiary,
    fontSize: 14,
    fontWeight: "600",
  },
  loadingMore: {
    padding: 20,
    alignItems: "center",
  },
  loadingMoreText: {
    color: COLORS.textTertiary,
    fontSize: 12,
  },
  emptyContainer: {
    padding: 60,
    alignItems: "center",
  },
  emptyText: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptySubtext: {
    color: COLORS.textTertiary,
    fontSize: 14,
  },
  retryButton: {
    marginTop: 16,
    color: COLORS.primary,
    fontSize: 15,
    fontWeight: "600",
  },
});

export default Feed;