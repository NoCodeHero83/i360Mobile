import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HouseHeart } from "lucide-react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocationSearchBar } from "./LocationSearchBar";
import { COLORS } from "../constants";
import { useApp } from "../context/AppContext";
import { LocationSuggestionWithCount } from "../store/locationSearchStore";
import { usePropertyFiltersStore } from "../store/propertyFiltersStore";
import { useChatStore } from "../store/chatStore";
import { useCitasStore } from "../store/citasStore";
import { useMatchesStore } from "../store/matchesStore";
import { useNotifications } from "../context/NotificationContext";

const LOGO_SOURCE = require("../assets/Logo.png");

interface HomeHeaderProps {
  style?: any;
  onSearchingChange?: (val: boolean) => void;
  isHeaderVisible?: boolean;
  onOpenMap?: () => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
  style,
  onSearchingChange,
  isHeaderVisible = true,
  onOpenMap,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { setSelectedLocation } = useApp();
  const unreadCount = useChatStore((state) => state.totalUnreadCount);
  const pendingCitas = useCitasStore((state) => state.pendingCount);
  const unseenMatches = useMatchesStore((state) => state.unseenCount);
  const { unreadCount: notificationUnreadCount } = useNotifications();
  
  const totalMessagesBadge = unreadCount + notificationUnreadCount;

  const handleNavigation = (screen: string) => {
    switch (screen) {
      case "Matches":
        router.push("/(stack)/matches");
        break;
      case "Messages":
        router.push("/(stack)/messages");
        break;
      case "Appointments":
        router.push("/(stack)/appointments");
        break;
      case "Requests":
        router.push("/(stack)/requests");
        break;
      default:
        break;
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.headerContainer, { paddingTop: insets.top }, style]}
    >
      {/* Background fill - this covers only the header part */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: COLORS.primary,
            height: 130 + insets.top, // Fixed height for background
            zIndex: -1,
          },
        ]}
      />

      <View style={styles.headerTopRow}>
        <View style={styles.headerLogoContainer}>
          <Image
            source={LOGO_SOURCE}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerIcons}>
          {(["Matches", "Messages", "Requests", "Appointments"] as const).map(
            (screen, idx) => (
              <TouchableOpacity
                key={idx}
                onPress={() => handleNavigation(screen)}
                style={styles.iconButton}
              >
                {screen === "Matches" ? (
                  <HouseHeart size={22} color={COLORS.white} strokeWidth={1.8} />
                ) : (
                  <Ionicons
                    name={
                      screen === "Messages"
                        ? "chatbubble-outline"
                        : screen === "Requests"
                          ? "people-outline"
                          : "calendar-outline"
                    }
                    size={22}
                    color={COLORS.white}
                  />
                )}
                {screen === "Matches" && unseenMatches > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unseenMatches > 9 ? "9+" : unseenMatches}
                    </Text>
                  </View>
                )}
                {screen === "Messages" && totalMessagesBadge > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {totalMessagesBadge > 9 ? "9+" : totalMessagesBadge}
                    </Text>
                  </View>
                )}
                {screen === "Appointments" && pendingCitas > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {pendingCitas > 9 ? "9+" : pendingCitas}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ),
          )}
        </View>
      </View>

      <View style={styles.searchWrapper}>
        <LocationSearchBar
          onLocationSelect={(loc: LocationSuggestionWithCount | null) => {
            const { clearFilters } = usePropertyFiltersStore.getState();
            if (!loc) {
              setSelectedLocation(null);
              clearFilters({ estado: "", ciudad: "", municipio: "", colonia: "" });
              return;
            }
            clearFilters({ estado: "", ciudad: "", municipio: "", colonia: "" });
            setSelectedLocation({
              type: loc.type,
              name: loc.name,
              estado_id: loc.estado_id ?? 0,
              municipio_nombre: loc.municipio_nombre,
              estado_nombre: loc.estado_nombre,
              placeId: loc.placeId,
            });
            onOpenMap?.();
          }}
          onSearchingChange={onSearchingChange}
          isHeaderVisible={isHeaderVisible}
          onOpenMap={onOpenMap}
          showMapButton={false}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: COLORS.primary,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingBottom: 10, // Added some bottom padding
    // Shadows
    ...Platform.select({
      ios: {
        shadowColor: COLORS.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
    }),
  },
  headerLogoContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 60,
  },
  headerLogo: {
    width: 140,
    height: 56,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
  },
  searchWrapper: {
    justifyContent: "center",
    zIndex: 100,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  badgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
  },
});
