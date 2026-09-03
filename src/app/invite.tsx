import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { storeInviteCodeFromUrl, registerDeviceInvite } from "@/services/communityService";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/colors";
import { logger } from "@/utils/logger";

const log = logger.scoped("[invite]");

export default function InviteIndexScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    let mounted = true;

    const handleInvite = async () => {
      try {
        const raw =
          params.code ?? params.invite ?? params.ref;
        const code = Array.isArray(raw) ? raw[0] : raw;
        if (code) {
          const stored = await storeInviteCodeFromUrl(
            `ilyroxapp://invite?type=invite&code=${encodeURIComponent(code)}`,
          );
          if (stored) {
            await registerDeviceInvite(stored, "mobile");
          }
        }
      } catch (error) {
        log.warn("Could not store invite code:", error);
      }

      if (!mounted) return;
      if (session) {
        router.replace("/(tabs)");
      } else {
        router.replace("/login");
      }
    };

    handleInvite();

    return () => {
      mounted = false;
    };
  }, [params.code, params.invite, params.ref, session, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.white,
  },
});