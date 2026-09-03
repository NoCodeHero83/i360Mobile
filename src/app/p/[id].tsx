import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

import { useAuth } from "@/context/AuthContext";
import { FeedDetail } from "@/components";
import { useFeedItem } from "@/hooks";
import { COLORS } from "@/constants/colors";
import { logger } from "@/utils/logger";

const log = logger.scoped("[p]");

export default function SharedContentScreen() {
  const { id, item } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  let initialItem: any = null;
  if (item) {
    try {
      initialItem = typeof item === "string" ? JSON.parse(item) : item;
    } catch (e) {
      log.error("Error parsing initial item:", e);
    }
  }

  const { item: fetchedItem, loading } = useFeedItem(
    initialItem ? "" : (id as string),
  );

  const postItem = initialItem || fetchedItem;

  if (loading && !postItem) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Cargando contenido...</Text>
      </View>
    );
  }

  if (!postItem) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No se encontró el contenido</Text>
      </View>
    );
  }

  return (
    <FeedDetail
      item={postItem}
      currentUserId={user?.id}
      onClose={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)");
        }
      }}
      onUserClick={(u) => {
        router.push({
          pathname: "/(stack)/user/[id]",
          params: { id: u.id },
        });
      }}
    />
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
  errorText: {
    color: COLORS.textSecondary,
  },
});