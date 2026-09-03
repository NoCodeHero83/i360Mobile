import React, { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, ActivityIndicator, StyleSheet } from "react-native";

import { storeInviteCodeFromUrl, registerDeviceInvite } from "@/services/communityService";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/colors";
import { logger } from "@/utils/logger";

const log = logger.scoped("[invite]");

export default function InviteScreen() {
  const { code } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();

  useEffect(() => {
    let mounted = true;

    const handleInvite = async () => {
      try {
        const raw = Array.isArray(code) ? code[0] : code;
        if (raw) {
          const stored = await storeInviteCodeFromUrl(`ilyroxapp://invite?type=invite&code=${encodeURIComponent(raw)}`);
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
  }, [code, session, router]);

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