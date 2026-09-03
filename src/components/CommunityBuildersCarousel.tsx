import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import Avatar from "./shared/Avatar";
import { ShimmerCard } from "./shared/Shimmer";
import { User } from "@/types";
import {
  buildAdvisorInviteLink,
  bulkRecordConstructorViews,
  CommunityBuilder,
  getCommunityBuildersV2,
  getOrCreateAdvisorInviteCode,
} from "@/services/communityService";
import { useViewTracker } from "@/hooks/useCommunityBuilderViewTracker";
import { logger } from "@/utils/logger";
import { Image } from "expo-image";

const log = logger.scoped("CommunityBuildersCarousel");
const COHETE_SOURCE = require("../assets/cohete_ilyrox.png");

type InviteCard = { type: "invite"; id: "invite" };
type BuilderCard = { type: "builder"; id: string; builder: CommunityBuilder };
type ShimmerCard = { type: "shimmer"; id: string };
type CarouselItem = InviteCard | BuilderCard | ShimmerCard;

interface CommunityBuildersCarouselProps {
  currentUserId?: string;
  onUserClick?: (user: User) => void;
  refreshSignal?: number;
}

function formatCompactNumber(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function toUser(builder: CommunityBuilder): User {
  return {
    id: builder.id,
    nombre: builder.nombre,
    name: builder.nombre,
    avatar: builder.avatar || "",
    isFollowing: false,
    role: "User",
    ocupacion: builder.ocupacion || undefined,
    rating: builder.rating || undefined,
  };
}

const CommunityBuildersCarousel: React.FC<CommunityBuildersCarouselProps> = ({
  currentUserId,
  onUserClick,
  refreshSignal,
}) => {
  const { width } = useWindowDimensions();
  const [builders, setBuilders] = useState<CommunityBuilder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const isMountedRef = useRef(true);
  const refreshSignalRef = useRef(refreshSignal);

  const cardWidth = Math.min(132, Math.max(116, Math.floor(width * 0.32)));
  const inviteCardWidth = Math.min(128, Math.max(148, Math.floor(width * 0.36)));
  const PAGE_SIZE = 4;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    refreshSignalRef.current = refreshSignal;
  }, [refreshSignal]);

  const loadBuilders = useCallback(async () => {
    if (!isMountedRef.current) return;
    if (isLoadingRef.current) return;
    if (refreshSignalRef.current !== refreshSignal) return;

    isLoadingRef.current = true;
    setLoading(true);
    offsetRef.current = 0;

    try {
      const result = await getCommunityBuildersV2(PAGE_SIZE, 0);
      if (!isMountedRef.current) return;
      if (refreshSignalRef.current !== refreshSignal) return;
      setBuilders(result.builders);
      setHasMore(result.hasMore);
    } catch (error) {
      if (!isMountedRef.current) return;
      log.warn("Could not load community builders v2", error);
    } finally {
      if (!isMountedRef.current) return;
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [refreshSignal]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadingMore(true);
    try {
      offsetRef.current += PAGE_SIZE;
      const result = await getCommunityBuildersV2(PAGE_SIZE, offsetRef.current);
      if (!isMountedRef.current) return;
      setBuilders((prev) => [...prev, ...result.builders]);
      setHasMore(result.hasMore);
    } catch (error) {
      if (!isMountedRef.current) return;
      log.warn("Could not load more community builders", error);
      offsetRef.current -= PAGE_SIZE;
    } finally {
      if (!isMountedRef.current) return;
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [loadingMore, hasMore]);

  useEffect(() => {
    isLoadingRef.current = false;
    loadBuilders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const shimmerBuilderItems = useMemo<CarouselItem[]>(
    () =>
      Array.from({ length: PAGE_SIZE }, (_, i) => ({
        type: "shimmer" as const,
        id: `shimmer-${i}`,
      })),
    [PAGE_SIZE]
  );

  const items = useMemo<CarouselItem[]>(
    () => [
      { type: "invite", id: "invite" },
      ...builders.map((builder) => ({
        type: "builder" as const,
        id: builder.id,
        builder,
      })),
    ],
    [builders]
  );

  const displayItems = useMemo<CarouselItem[]>(
    () => (loading ? [{ type: "invite" as const, id: "invite" }, ...shimmerBuilderItems] : items),
    [loading, items, shimmerBuilderItems]
  );

  const shareInvite = useCallback(async () => {
    if (!currentUserId || sharing) return;

    setSharing(true);
    try {
      const code = await getOrCreateAdvisorInviteCode(currentUserId);
      const link = buildAdvisorInviteLink(code);
      await Clipboard.setStringAsync(link);

      const message =
        "Bienvenido a ILYROX. Te invito a unirte a una comunidad de asesores inmobiliarios. Regístrate con este enlace y entrarás a mi red.";
      const fullMessage = `${message}\n\n${link}`;

      await Share.share({
        title: "Invitación a ILYROX",
        message: fullMessage,
        url: Platform.OS === "ios" ? link : undefined,
      });
    } catch (error) {
      log.warn("Could not share advisor invite", error);
    } finally {
      setSharing(false);
    }
  }, [currentUserId, sharing]);

  const renderItem = useCallback(
    ({ item }: { item: CarouselItem }) => {
      if (item.type === "invite") {
        return (
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.inviteCard, { width: inviteCardWidth,backgroundColor:"#f8f8fa" }]}
            onPress={() => setInviteVisible(true)}
          >
            <View style={{flexDirection:'row',justifyContent:'center'}}>
              <Image source={COHETE_SOURCE}
              style={{height:90,width:90}}
            resizeMode="contain"
              />
            </View>
            <Text style={styles.inviteTitle}>Invita asesores</Text>
            <Text style={styles.inviteText}>
              a <Text style={{color:COLORS.primary}}>ILYROX</Text> y aparece aquí en constructores de comunidad
            </Text>
            <View style={styles.inviteButton}>
              <Text style={styles.inviteButtonText}>Invitar asesores</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.white} />
            </View>
          </TouchableOpacity>
        );
      }

      if (item.type === "shimmer") {
        return <ShimmerCard width={cardWidth} />;
      }

      const { builder } = item;
      return (
        <TouchableOpacity
          activeOpacity={0.9}
          style={[styles.builderCard, { width: cardWidth }]}
          onPress={() => onUserClick?.(toUser(builder))}
        >
          <View style={styles.avatarWrap}>
            <Avatar
              uri={builder.avatar || undefined}
              name={builder.nombre}
              size={72}
              style={styles.avatar}
            />
            {builder.rating ? (
              <View style={styles.ratingPill}>
                <Ionicons name="star" size={10} color={COLORS.chartGold} />
                <Text style={styles.ratingText}>{builder.rating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.builderName} numberOfLines={1}>
            {builder.nombre}
          </Text>
          <View style={styles.metricRow}>
            <Ionicons name="eye-outline" size={15} color={COLORS.textSecondary} />
            <Text style={styles.metricStrong}>
              {formatCompactNumber(builder.totalViews)}
            </Text>
          </View>
          <Text style={styles.metricLabel}>visualizaciones</Text>
          <View style={styles.divider} />
          <View style={styles.metricRow}>
            <Ionicons name="people-outline" size={16} color={COLORS.primaryDark} />
            <Text style={styles.metricStrong}>{builder.invitedAdvisors}</Text>
          </View>
          <Text style={styles.metricLabel}>asesores</Text>
          {builder.isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>Nuevo</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [cardWidth, inviteCardWidth, onUserClick],
  );

  const renderLoadMoreShimmer = useCallback(
    () => (
      <View style={styles.loadMoreShimmerContainer}>
        <ShimmerCard width={cardWidth} />
        <ShimmerCard width={cardWidth} />
      </View>
    ),
    [cardWidth]
  );

  const { handleViewableItemsChanged, viewabilityConfig } = useViewTracker({
    onBatchReady: bulkRecordConstructorViews,
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>CONSTRUCTORES DE COMUNIDAD</Text>
        <Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} />
      </View>
      <FlatList
        data={displayItems}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? renderLoadMoreShimmer() : null
        }
      />
      <View style={styles.infoBanner}>
<MaterialCommunityIcons
  name="account-group-outline"
  size={32}
  color={COLORS.primary}
/>

        <Text style={styles.infoText}>
          Los constructores de comunidad te ayudan a{" "}
          <Text style={styles.infoStrong}>encontrar más propiedades</Text> para
          tus clientes.
        </Text>
      </View>

      <Modal
        visible={inviteVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setInviteVisible(false)}
        />
        <SafeAreaView edges={["bottom"]} style={styles.sheet}>
          <View style={styles.handle} />
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setInviteVisible(false)}
            accessibilityLabel="Cerrar invitación"
          >
            <Ionicons name="close" size={26} color={COLORS.backgroundDeep} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.sheetScrollContent}
          >
            <Text style={styles.sheetTitle}>
              Invita asesores y{"\n"}
              <Text style={styles.sheetTitleAccent}>destaca tu perfil</Text>
            </Text>
            <Text style={styles.sheetSubtitle}>
              Cada asesor que invites se unirá a tu red y te ayudará a tener más
              exposición.
            </Text>

            <View style={styles.steps}>
              <InviteStep
                icon="link-outline"
                title="Comparte este enlace"
                text={"Generas un enlace único\ny lo compartes con otros asesores."}
                isLast={false}
              />
              <InviteStep
                icon="phone-portrait-outline"
                title="Instala ILYROX"
                text={"Tu invitado instala ILYROX\ndesde la App Store o Google Play." }
                isLast={false}
              />
              <InviteStep
                icon="person-add-outline"
                title="Registro automático"
                text={"Al abrir ILYROX por primera vez,\nel enlace se detecta automáticamente." }
                isLast={false}
              />
              <InviteStep
                icon="people-outline"
                title="Ya tiene tu aprobación"
                text={"Solo necesitará 2 aprobaciones más\npara unirse a la comunidad."}
                isLast
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.shareButton, (!currentUserId || sharing) && styles.disabledButton]}
              disabled={!currentUserId || sharing}
              onPress={shareInvite}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Ionicons name="share-outline" size={28} color={COLORS.white} />
              )}
              <Text style={styles.shareButtonText}>Compartir mi invitación</Text>
            </TouchableOpacity>

            <View style={styles.noteRow}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.noteText}>
                Se copiará automáticamente y podrás compartirlo.
              </Text>
            </View>
            <View style={styles.bottomNoteRow}>
              <Ionicons name="lock-closed-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.noteText}>Solo para asesores inmobiliarios.</Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

function InviteStep({
  icon,
  title,
  text,
  isLast,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  isLast: boolean;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIconColumn}>
        <View style={styles.stepIcon}>
                    {
            title=="Comparte este enlace"&&
           <Ionicons name={icon} size={30} color={COLORS.white} />

          }
          {
            title=="Instala ILYROX"&&
              <MaterialCommunityIcons
                name="cellphone-arrow-down"
                size={30}
                color={COLORS.white}
              />
          }
                    {
            title=="Registro automático"&&
<MaterialCommunityIcons
  name="account-check-outline"
  size={30}
  color={COLORS.white}
/>
          }
                              {
            title=="Ya tiene tu aprobación"&&
<MaterialCommunityIcons
  name="account-group-outline"
  size={32}
  color={COLORS.white}
/>

          }


        </View>
        {!isLast && <View style={styles.stepLine} />}
      </View>
      <View style={styles.stepTextWrap}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
  },
  headerRow: {
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
    letterSpacing: 0,
  },
  summary: {
    marginTop: 8,
    paddingHorizontal: 24,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  loadMoreShimmerContainer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
  },
  inviteCard: {
    minHeight: 206,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    padding: 6,
    backgroundColor: COLORS.white,
    justifyContent: "space-between",
  },

  inviteTitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
  },
  inviteText: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "500",
    color: COLORS.backgroundDeep,
  },
  inviteButton: {
    marginTop: 8,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  inviteButtonText: {
    color: COLORS.white,
    fontSize: 11
  },
  builderCard: {
    minHeight: 206,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  avatarWrap: {
    width: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    backgroundColor: COLORS.backgroundDark,
  },
  ratingPill: {
    position: "absolute",
    right: -4,
    bottom: 0,
    minHeight: 22,
    borderRadius: 12,
    paddingHorizontal: 6,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
  },
  builderName: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
    textAlign: "center",
  },
  metricRow: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  metricStrong: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.textSecondary,
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  divider: {
    marginTop: 10,
    width: "72%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.cardBorder,
  },
  newBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: COLORS.infoLight,
  },
  newBadgeText: {
    color: COLORS.infoDark,
    fontSize: 10,
    fontWeight: "800",
  },
  infoBanner: {
    marginHorizontal: 24,
    marginTop: 8,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: COLORS.lightGray,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight:'500',
    color: COLORS.backgroundDeep,
  },
  infoStrong: {
    color: COLORS.primaryDark,
    fontWeight: "800",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: COLORS.blackTransparent,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "94%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: COLORS.white,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 18,
  },
  sheetScrollContent: {
    paddingBottom: 4,
  },
  handle: {
    alignSelf: "center",
    width: 68,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.mediumGray,
    marginBottom: 24,
  },
  closeButton: {
    position: "absolute",
    right: 10,
    top: 10,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    textAlign: "center",
    fontSize: 33,
    lineHeight: 39,
    fontWeight: "700",
    color: COLORS.backgroundDeep,
    letterSpacing: 0,
  },
  sheetTitleAccent: {
    color: COLORS.primaryDark,
  },
  sheetSubtitle: {
    marginTop: 16,
    textAlign: "center",
    paddingHorizontal:28,
    fontSize: 14,
    lineHeight: 22,
    color: COLORS.textSecondary,
  },
  steps: {
    marginTop: 24,
  },
  stepRow: {
    flexDirection: "row",
    minHeight: 96,
  },
  stepIconColumn: {
    width: 72,
    alignItems: "center",
  },
  stepIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  stepTextWrap: {
    flex: 1,
    paddingTop: 5,
    paddingLeft: 12,
  },
  stepTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
  },
  stepText: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  storeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  storePill: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.white,
  },
  storeText: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
  },
  welcomeCard: {
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: "center",
  },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.primaryTransparent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  welcomeEyebrow: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.primaryDark,
    letterSpacing: 0,
    marginBottom: 8,
  },
  welcomeTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: COLORS.backgroundDeep,
    textAlign: "center",
  },
  welcomeTitleAccent: {
    color: COLORS.primaryDark,
  },
  welcomeDivider: {
    width: 44,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.primaryDark,
    marginVertical: 14,
  },
  welcomeSubtitle: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    color: COLORS.backgroundDeep,
    textAlign: "center",
  },
  welcomeBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  shareButton: {
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  disabledButton: {
    opacity: 0.55,
  },
  shareButtonText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "500",
  },
  noteRow: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  bottomNoteRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.cardBorder,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  noteText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});

export default React.memo(CommunityBuildersCarousel);