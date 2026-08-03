import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";
import { formatPriceShort } from "../../utils/priceFormatter";
import { Property } from "../../types";
import ThreeDotsMenu, { MenuOption } from "../shared/ThreeDotsMenu";
import { Bath } from "lucide-react-native";

const { width } = Dimensions.get("window");
const GAP = 8;
const ITEM_SIZE = (width - 24 - GAP * 2) / 3;

interface ProfilePropertyItemProps {
  item: Property;
  onPress: (item: Property) => void;
  isOwnProfile?: boolean;
  onEdit?: (item: Property) => void;
  onDelete?: (item: Property) => void;
  onPublishOpenHouse?: (item: Property) => void;
  /** true = la propiedad ya tiene un Open House activo → mostrar "Editar Open House" */
  hasOpenHouse?: boolean;
  isLastInRow?: boolean;
}

const ProfilePropertyItem: React.FC<ProfilePropertyItemProps> = React.memo(
  ({ item, onPress, isOwnProfile, onEdit, onDelete, onPublishOpenHouse, hasOpenHouse, isLastInRow }) => {
    const commissionText = formatCommission(item.commission);

    const menuOptions: MenuOption[] = [
      {
        icon: "pencil-outline",
        label: "Editar",
        onPress: () => onEdit && onEdit(item),
      },
      {
        icon: hasOpenHouse ? "create-outline" : "home-outline",
        label: hasOpenHouse ? "Editar Open House" : "Publicar Open House",
        onPress: () => onPublishOpenHouse && onPublishOpenHouse(item),
      },
      {
        icon: "trash-outline",
        label: "Eliminar",
        onPress: () => onDelete && onDelete(item),
        danger: true,
      },
    ];

    return (
      <TouchableOpacity
        style={[styles.gridItem, isLastInRow && { marginRight: 0 }]}
        onPress={() => onPress(item)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: item.images[0] }}
          style={styles.gridImage}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />

        {item.sin_comision ? (
          <View style={[styles.statusBadge, styles.sinComisionBadge]}>
            <Ionicons name="alert-circle" size={10} color="#fff" />
            <Text style={styles.statusText}> Sin comisión</Text>
          </View>
        ) : (
          <View style={[styles.statusBadge, { backgroundColor: "#03a58fd7" }]}>
            {commissionText ? (
              <Text style={styles.statusText}>{commissionText} comisión</Text>
            ) : (
              <Text style={styles.statusText}>{item.status}</Text>
            )}
          </View>
        )}

        {isOwnProfile &&
          !item.sin_comision &&
          item.comparte_comision === false && (
            <View style={[styles.statusBadge, styles.privadaBadge, { top: ITEM_SIZE - 24 }]}>
              <Ionicons name="eye-off" size={10} color="#fff" />
              <Text style={styles.statusText}> Solo tú</Text>
            </View>
          )}

        {isOwnProfile && (
          <View style={styles.menuContainer}>
            <ThreeDotsMenu options={menuOptions} />
          </View>
        )}

        <View style={styles.infoContainer}>
          <View style={styles.priceRow}>
            <Text style={styles.propertyPrice}>
              {formatPriceShort(item.price)}
            </Text>
            <Text style={styles.propertyCurrency}>{item.currency}</Text>
          </View>
          <Text style={styles.propertyLocation} numberOfLines={1}>
            {/* Colonia (la ubicación específica), no el municipio. Fallback a
                municipio/ciudad si la propiedad no tiene colonia. */}
            {item.location.colony ||
              item.location.municipio ||
              item.location.city}
          </Text>

          <View style={styles.propertyFeatures}>
            {item.features.beds > 0 && (
              <View
                style={{
                  ...styles.featureBadge,
                  borderRightWidth: 1,
                  paddingRight: 5,
                  borderRightColor: "#cccccc",
                }}
              >
                <Ionicons
                  name="bed-outline"
                  size={10}
                  color={COLORS.textPrimary}
                />
                <Text style={styles.featureBadgeText}>
                  {item.features.beds}
                </Text>
              </View>
            )}
            {(item.features.baths > 0 || (item.features.halfBaths ?? 0) > 0) && (
              <View
                style={{
                  ...styles.featureBadge,
                  borderRightWidth: 1,
                  paddingRight: 5,
                  borderRightColor: "#cccccc",
                }}
              >
                <Bath size={10} color={COLORS.textPrimary} />
                <Text style={styles.featureBadgeText}>
                  {item.features.baths}
                  {(item.features.halfBaths ?? 0) > 0 ? "½" : ""}
                </Text>
              </View>
            )}
            {item.features.constructionSqft > 0 ? (
              <View
                style={{
                  ...styles.featureBadge,
                  paddingHorizontal: 3,
                  borderRightColor: "#cccccc",
                }}
              >
                <Text style={styles.featureBadgeText}>
                  {item.features.constructionSqft} m²
                </Text>
              </View>
            ) : (
              <View
                style={{
                  ...styles.featureBadge,
                  paddingHorizontal: 3,
                  borderRightColor: "#cccccc",
                }}
              >
                <Text style={styles.featureBadgeText}>
                  {item.features.landSqft} m²
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

const formatCommission = (commission?: {
  shared: boolean;
  percentage?: number;
  months?: number;
  condition?: string;
}): string | null => {
  if (!commission) return null;
  // Postgres devuelve NUMERIC como texto ("1.0"), así que normalizamos a número
  // para mostrar "1 mes" y no "1.0 meses".
  const meses = Number(commission.months);
  if (meses) {
    return `${meses} mes${meses !== 1 ? "es" : ""}`;
  }
  const pct = Number(commission.percentage);
  if (pct) {
    return `${pct}%`;
  }
  return null;
};

const styles = StyleSheet.create({
  gridItem: {
    width: ITEM_SIZE,
    marginBottom: 12,
    marginRight: GAP,
    backgroundColor: COLORS.white,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  gridImage: {
    width: "100%",
    height: ITEM_SIZE,
  },
  statusBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  statusText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.3,
  },
  sinComisionBadge: {
    backgroundColor: "#C53030cc",
    flexDirection: "row",
    alignItems: "center",
  },
  privadaBadge: {
    backgroundColor: "#2D3748e6",
    flexDirection: "row",
    alignItems: "center",
  },
  menuContainer: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 9999,
  },
  infoContainer: {
    backgroundColor: COLORS.white,
    padding: 8,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  propertyPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textQuaternary,
  },
  propertyCurrency: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textQuaternary,
    marginLeft: 2,
  },
  propertyLocation: {
    fontSize: 10,
    color: COLORS.textQuaternary,
    marginTop: 2,
  },
  propertyFeatures: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
    paddingTop: 4,
  },
  featureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  featureBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textQuaternary,
  },
});

export default ProfilePropertyItem;
