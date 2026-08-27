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
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewToken,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import Avatar from "./shared/Avatar";
import { User } from "@/types";
import {
  buildAdvisorInviteLink,
  CommunityBuilder,
  getCommunityBuilders,
  getOrCreateAdvisorInviteCode,
  recordCommunityBuilderView,
} from "@/services/communityService";
import { logger } from "@/utils/logger";

const log = logger.scoped("CommunityBuildersCarousel");

type InviteCard = { type: "invite"; id: "invite" };
type BuilderCard = { type: "builder"; id: string; builder: CommunityBuilder };
type CarouselItem = InviteCard | BuilderCard;

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
  const [loading, setLoading] = useState(false);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [sharing, setSharing] = useState(false);
  const viewedBuilderIds = useRef(new Set<string>());
  const currentUserIdRef = useRef(currentUserId);

  const cardWidth = Math.min(132, Math.max(116, Math.floor(width * 0.32)));
  const inviteCardWidth = Math.min(166, Math.max(148, Math.floor(width * 0.42)));
  const appStoreUrl = process.env.EXPO_PUBLIC_APP_STORE_URL;
  const googlePlayUrl = process.env.EXPO_PUBLIC_GOOGLE_PLAY_URL;

  const loadBuilders = useCallback(async () => {
    setLoading(true);
    try {
      viewedBuilderIds.current.clear();
      const data = await getCommunityBuilders(currentUserId);
      setBuilders(data);
    } catch (error) {
      log.warn("Could not load community builders", error);
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    loadBuilders();
  }, [loadBuilders, refreshSignal]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const items = useMemo<CarouselItem[]>(
    () => [
      { type: "invite", id: "invite" },
      ...builders.map((builder) => ({
        type: "builder" as const,
        id: builder.id,
        builder,
      })),
    ],
    [builders],
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

      await Share.share({
        title: "Invitación a ILYROX",
        message: Platform.OS === "ios" ? message : `${message}\n\n${link}`,
        url: Platform.OS === "ios" ? link : undefined,
      });
    } catch (error) {
      log.warn("Could not share advisor invite", error);
    } finally {
      setSharing(false);
    }
  }, [currentUserId, sharing]);

  const openStoreUrl = useCallback((url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch((error) => {
      log.warn("Could not open store url", error);
    });
  }, []);

  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.forEach((viewable) => {
        const item = viewable.item as CarouselItem;
        if (item.type !== "builder") return;
        if (viewedBuilderIds.current.has(item.builder.id)) return;
        viewedBuilderIds.current.add(item.builder.id);
        recordCommunityBuilderView(currentUserIdRef.current, item.builder.id);
      });
    },
  ).current;

  const renderItem = useCallback(
    ({ item }: { item: CarouselItem }) => {
      if (item.type === "invite") {
        return (
          <TouchableOpacity
            activeOpacity={0.88}
            style={[styles.inviteCard, { width: inviteCardWidth }]}
            onPress={() => setInviteVisible(true)}
          >
            <View style={styles.rocketCircle}>
              <Ionicons name="rocket-outline" size={44} color={COLORS.primary} />
            </View>
            <Text style={styles.inviteTitle}>Invita asesores</Text>
            <Text style={styles.inviteText}>
              a ILYROX y aparece aquí en constructores de comunidad
            </Text>
            <View style={styles.inviteButton}>
              <Text style={styles.inviteButtonText}>Invitar</Text>
              <Ionicons name="chevron-forward" size={16} color={COLORS.white} />
            </View>
          </TouchableOpacity>
        );
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

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>CONSTRUCTORES DE COMUNIDAD</Text>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <Ionicons name="chevron-forward" size={22} color={COLORS.textPrimary} />
        )}
      </View>
      <Text style={styles.summary}>
        Invita asesores a ILYROX y gana visibilidad dentro de la comunidad.
      </Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={renderItem}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 50,
          minimumViewTime: 1000,
        }}
      />
      <View style={styles.infoBanner}>
        <Ionicons name="people-outline" size={32} color={COLORS.primary} />
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
                text="Generas un enlace único y lo compartes con otros asesores."
                isLast={false}
              />
              <InviteStep
                icon="phone-portrait-outline"
                title="Instala ILYROX"
                text="Tu invitado instala ILYROX desde la App Store o Google Play."
                isLast={false}
              />
              <InviteStep
                icon="person-add-outline"
                title="Registro automático"
                text="Al abrir ILYROX por primera vez, el enlace se detecta automáticamente."
                isLast={false}
              />
              <InviteStep
                icon="people-outline"
                title="Ya tiene tu aprobación"
                text="Solo necesitará 2 aprobaciones más para unirse a la comunidad."
                isLast
              />
            </View>

            <View style={styles.storeRow}>
              <TouchableOpacity
                style={styles.storePill}
                onPress={() => openStoreUrl(appStoreUrl)}
                disabled={!appStoreUrl}
                accessibilityRole="button"
                accessibilityLabel="Abrir App Store"
              >
                <Ionicons name="logo-apple" size={18} color={COLORS.backgroundDeep} />
                <Text style={styles.storeText}>App Store</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.storePill}
                onPress={() => openStoreUrl(googlePlayUrl)}
                disabled={!googlePlayUrl}
                accessibilityRole="button"
                accessibilityLabel="Abrir Google Play"
              >
                <Ionicons name="logo-google-playstore" size={18} color={COLORS.backgroundDeep} />
                <Text style={styles.storeText}>Google Play</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.welcomeCard}>
              <View style={styles.logoMark}>
                <Ionicons name="people-outline" size={28} color={COLORS.primaryDark} />
              </View>
              <Text style={styles.welcomeEyebrow}>BIENVENIDO</Text>
              <Text style={styles.welcomeTitle}>
                Descargaste{"\n"}
                <Text style={styles.welcomeTitleAccent}>una comunidad.</Text>
              </Text>
              <View style={styles.welcomeDivider} />
              <Text style={styles.welcomeSubtitle}>
                La colaboración nunca tendrá costo.
              </Text>
              <Text style={styles.welcomeBody}>
                Publicar y compartir propiedades en ILYROX siempre será gratis.
              </Text>
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
          <Ionicons name={icon} size={30} color={COLORS.white} />
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
    fontSize: 15,
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 14,
    gap: 10,
  },
  inviteCard: {
    minHeight: 206,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 8,
    padding: 12,
    backgroundColor: COLORS.white,
    justifyContent: "space-between",
  },
  rocketCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primaryTransparent,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteTitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: COLORS.backgroundDeep,
  },
  inviteText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: COLORS.backgroundDeep,
  },
  inviteButton: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: COLORS.primaryDark,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  inviteButtonText: {
    color: COLORS.white,
    fontWeight: "800",
    fontSize: 13,
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
    fontSize: 15,
    lineHeight: 21,
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
    right: 22,
    top: 22,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.lightGray,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: {
    paddingRight: 48,
    textAlign: "center",
    fontSize: 33,
    lineHeight: 39,
    fontWeight: "900",
    color: COLORS.backgroundDeep,
    letterSpacing: 0,
  },
  sheetTitleAccent: {
    color: COLORS.primaryDark,
  },
  sheetSubtitle: {
    marginTop: 16,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 25,
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
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: COLORS.backgroundDeep,
  },
  stepText: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
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
    minHeight: 62,
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
    fontWeight: "900",
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
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});

export default React.memo(CommunityBuildersCarousel);