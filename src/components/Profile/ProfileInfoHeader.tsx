import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { ProfileHeader } from "./ProfileHeader";
import ProfileAvatarPicker from "./ProfileAvatarPicker";
import ProfileTabs from "./ProfileTabs";
import { RecommendedSection } from "./RecommendedSection";
import { ProfileContentType, perfiles } from "@/types";

export interface ProfileData {
  name: string;
  avatar?: string;
  role: string;
  location: string;
  phone: string;
  anos_experiencia: number | string;
  rating: number;
  reviewCount: number;
  positiveRecommendations: number;
  negativeRecommendations: number;
  biography?: string;
  website?: string;
  profesionalismo: number;
  eticaValores: number;
  pagoComisiones: number;
  comunicacionServicio: number;
}

export interface ProfileInfoHeaderProps {
  profile: perfiles | null;
  profileData: ProfileData;
  targetUserId: string;
  isMe: boolean;
  onBack?: () => void;
  onSupport: () => void;
  onSettings: () => void;
  onUpdatePhoto: (url: string) => void;
  onMessage: () => void;
  onToggleBlock?: () => void;
  onRecommend?: (recomienda: boolean) => void;
  isBlocked?: boolean;
  blockingUser?: boolean;
  isRecommended?: boolean | null;
  submittingRecommendation?: boolean;
  showRatingDetails: boolean;
  onToggleRatingDetails: () => void;
  showRecommendedByModal: boolean;
  setShowRecommendedByModal: (v: boolean) => void;
  showNotRecommendedByModal: boolean;
  setShowNotRecommendedByModal: (v: boolean) => void;
  formatRole: (rol: string) => string;
  loadRecommendedByUsers: (options?: { reset?: boolean }) => Promise<void>;
  loadNotRecommendedByUsers: (options?: { reset?: boolean }) => Promise<void>;
  activeTab: ProfileContentType;
  onTabChange: (tab: ProfileContentType) => void;
  contentCounts: { properties: number; posts: number; reels: number };
  activeFilter: string;
  onOpenFilter: () => void;
  filteredPropertiesCount: number;
}

export const ProfileInfoHeader: React.FC<ProfileInfoHeaderProps> = ({
  profileData,
  targetUserId,
  isMe,
  onBack,
  onSupport,
  onSettings,
  onUpdatePhoto,
  onMessage,
  onToggleBlock,
  onRecommend,
  isBlocked,
  blockingUser,
  isRecommended,
  submittingRecommendation,
  showRatingDetails,
  onToggleRatingDetails,
  showRecommendedByModal,
  setShowRecommendedByModal,
  showNotRecommendedByModal,
  setShowNotRecommendedByModal,
  formatRole,
  loadRecommendedByUsers,
  loadNotRecommendedByUsers,
  activeTab,
  onTabChange,
  contentCounts,
  activeFilter,
  onOpenFilter,
  filteredPropertiesCount,
}) => {
  return (
    <>
      <ProfileHeader
        isOwnProfile={isMe}
        onBack={onBack}
        onSupport={onSupport}
        onSettings={onSettings}
      />

      <View style={styles.infoContainer}>
        <View style={styles.infoRow}>
          <View style={styles.infoLeft}>
            <ProfileAvatarPicker
              uri={profileData.avatar}
              name={profileData.name}
              size={85}
              userId={targetUserId}
              isOwnProfile={isMe}
              onPhotoUpdated={onUpdatePhoto}
            />
          </View>

          <View style={styles.infoRight}>
            <Text style={styles.name}>{profileData.name}</Text>
            {/* Descripción completa, sin recorte ni "ver más": es una sola por
                pantalla y el asesor necesita que se lea entera. */}
            {profileData.biography && (
              <Text style={styles.biography}>{profileData.biography}</Text>
            )}
            {profileData.role && (
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{profileData.role}</Text>
              </View>
            )}
            <View style={styles.metaList}>
              {profileData.phone && (
                <View style={styles.metaItem}>
                  <Ionicons name="call" size={12} color={COLORS.textTertiary} />
                  <Text style={styles.metaText}>{profileData.phone}</Text>
                </View>
              )}
              <View style={styles.metaItem}>
                <Ionicons
                  name="location"
                  size={12}
                  color={COLORS.textTertiary}
                />
                <Text style={styles.metaText}>{profileData.location}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="school" size={12} color={COLORS.textTertiary} />
                <Text style={styles.metaText}>
                  {`+${profileData.anos_experiencia} años de experiencia`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {!isMe && (
          <View style={styles.actionsWrap}>
            <View style={styles.primaryActionsRow}>
              <TouchableOpacity
                style={[
                  styles.messageBtn,
                  isBlocked && styles.messageBtnDisabled,
                ]}
                onPress={onMessage}
                disabled={isBlocked}
              >
                <Ionicons
                  name="chatbubble-outline"
                  size={16}
                  color={
                    isBlocked ? COLORS.textDisabled : COLORS.textPrimary
                  }
                />
                <Text
                  style={[
                    styles.messageBtnText,
                    isBlocked && styles.messageBtnTextDisabled,
                  ]}
                >
                  Mensaje
                </Text>
              </TouchableOpacity>
              {!!onToggleBlock && (
                <TouchableOpacity
                  style={[
                    styles.blockBtn,
                    isBlocked && styles.blockBtnActive,
                  ]}
                  onPress={onToggleBlock}
                  disabled={blockingUser}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={isBlocked ? "lock-open-outline" : "ban-outline"}
                    size={16}
                    color={isBlocked ? COLORS.primary : COLORS.error}
                  />
                  <Text
                    style={[
                      styles.blockBtnText,
                      isBlocked && styles.blockBtnTextActive,
                    ]}
                  >
                    {isBlocked ? "Desbloquear" : "Bloquear"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {isBlocked && (
              <Text style={styles.blockedHint}>
                Dejaste de ver las propiedades de este usuario.
              </Text>
            )}
            {onRecommend && !isBlocked && (
              <View style={styles.recommendRow}>
                <TouchableOpacity
                  style={[
                    styles.recommendBtn,
                    isRecommended === true && styles.recommendBtnActive,
                  ]}
                  onPress={() => onRecommend(true)}
                  disabled={submittingRecommendation}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={
                      isRecommended === true ? "thumbs-up" : "thumbs-up-outline"
                    }
                    size={16}
                    color={isRecommended === true ? COLORS.white : COLORS.primary}
                  />
                  <Text
                    style={[
                      styles.recommendBtnText,
                      isRecommended === true && styles.recommendBtnTextActive,
                    ]}
                  >
                    {isRecommended === true ? "Recomendado" : "Recomendar"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.recommendBtn,
                    styles.notRecommendBtn,
                    isRecommended === false && styles.notRecommendBtnActive,
                  ]}
                  onPress={() => onRecommend(false)}
                  disabled={submittingRecommendation}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={
                      isRecommended === false
                        ? "thumbs-down"
                        : "thumbs-down-outline"
                    }
                    size={16}
                    color={isRecommended === false ? COLORS.white : COLORS.error}
                  />
                  <Text
                    style={[
                      styles.recommendBtnText,
                      styles.notRecommendBtnText,
                      isRecommended === false && styles.recommendBtnTextActive,
                    ]}
                  >
                    {isRecommended === false ? "No recomendado" : "No recomendar"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.ratingSection}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onToggleRatingDetails}
          style={styles.ratingCard}
        >
          <View style={styles.ratingInfoGroup}>
            <View style={styles.ratingHeader}>
              <Text style={styles.ratingValue}>
                {profileData.rating.toFixed(1)}
              </Text>
              <View style={styles.starsRow}>
                {[1, 2, 3, 4, 5].map((s) => {
                  const rating = profileData.rating;
                  const name =
                    rating >= s
                      ? "star"
                      : rating >= s - 0.5
                        ? "star-half"
                        : "star-outline";
                  const filled = rating >= s - 0.5;
                  return (
                    <Ionicons
                      key={s}
                      name={name}
                      size={14}
                      color={filled ? COLORS.warning : COLORS.cardBorder}
                    />
                  );
                })}
              </View>
            </View>
            <Text style={styles.reviewCount}>
              {profileData.reviewCount} reseñas
            </Text>
          </View>

          <View style={styles.ratingRight}>
            <Text style={styles.viewDetailsText}>Ver Detalles</Text>
            <Ionicons
              name={showRatingDetails ? "chevron-up" : "chevron-down"}
              size={14}
              color={COLORS.primary}
              style={styles.chevronIcon}
            />
          </View>
        </TouchableOpacity>

        {showRatingDetails && (
          <RecommendedSection
            setShowRecommendedByModal={setShowRecommendedByModal}
            showRecommendedByModal={showRecommendedByModal}
            setShowNotRecommendedByModal={setShowNotRecommendedByModal}
            showNotRecommendedByModal={showNotRecommendedByModal}
            formatRole={formatRole}
            isMe={isMe}
            loadRecommendedByUsers={loadRecommendedByUsers}
            loadNotRecommendedByUsers={loadNotRecommendedByUsers}
          />
        )}
      </View>

      <ProfileTabs
        activeTab={activeTab}
        onTabChange={onTabChange}
        counts={contentCounts}
      />

      {activeTab === "properties" && (
        <View style={styles.toolbar}>
          <TouchableOpacity onPress={onOpenFilter} style={styles.filterBtn}>
            <Ionicons name="funnel" size={16} color={COLORS.textPrimary} />
            <Text style={styles.filterBtnText}>{activeFilter}</Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={COLORS.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.countText}>
            {filteredPropertiesCount}{" "}
            {filteredPropertiesCount === 1 ? "Propiedad" : "Propiedades"}
          </Text>
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  infoContainer: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoLeft: {
    marginRight: 16,
    alignItems: "center",
  },
  infoRight: {
    flex: 1,
    paddingTop: 4,
  },
  name: {
    fontSize: 20,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  roleBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 8,
  },
  roleText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textPrimary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaList: {
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  actionsWrap: {
    marginTop: 16,
    gap: 8,
  },
  messageBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  primaryActionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  messageBtnDisabled: {
    opacity: 0.65,
  },
  messageBtnText: {
    color: COLORS.textPrimary,
    fontWeight: "600",
    fontSize: 14,
  },
  messageBtnTextDisabled: {
    color: COLORS.textDisabled,
  },
  blockBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  blockBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.background,
  },
  blockBtnText: {
    color: COLORS.error,
    fontWeight: "700",
    fontSize: 14,
  },
  blockBtnTextActive: {
    color: COLORS.primary,
  },
  blockedHint: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  recommendRow: {
    flexDirection: "row",
    gap: 8,
  },
  recommendBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  recommendBtnActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  recommendBtnText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 13,
  },
  recommendBtnTextActive: {
    color: COLORS.white,
  },
  notRecommendBtn: {
    borderColor: COLORS.error,
  },
  notRecommendBtnActive: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  notRecommendBtnText: {
    color: COLORS.error,
  },
  ratingSection: {
    marginBottom: 16,
    alignItems: "stretch",
  },
  ratingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginHorizontal: 32,
    justifyContent: "space-between",
  },
  ratingInfoGroup: {
    flexDirection: "column",
    gap: 2,
  },
  ratingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.textPrimary,
  },
  starsRow: {
    flexDirection: "row",
    gap: 2,
  },
  reviewCount: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontWeight: "500",
  },
  ratingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewDetailsText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
  chevronIcon: {
    margin: 4,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    marginHorizontal: 16,
  },
  toolbar: {
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.textPrimary,
  },
  countText: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: "500",
  },
  biography: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
});