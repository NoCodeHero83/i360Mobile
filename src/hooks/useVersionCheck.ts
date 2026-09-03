import { useState, useEffect } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import { logger } from "@/utils/logger";

const log = logger.scoped("useVersionCheck");

const VERSION_CACHE_KEY = "ilyrox:version_cache";
const VERSION_CACHE_TTL_MS = 60 * 60 * 1000;

export interface VersionInfo {
  platform: string;
  version: string;
  store_url: string;
  enabled: boolean;
}

interface CachedVersion {
  data: VersionInfo | null;
  updateRequired: boolean;
  timestamp: number;
}

export const useVersionCheck = () => {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkVersion();
  }, []);

  const checkVersion = async () => {
    if (Platform.OS === "web") {
      setLoading(false);
      return;
    }
    try {
      const cachedStr = await AsyncStorage.getItem(VERSION_CACHE_KEY);
      if (cachedStr) {
        const cached: CachedVersion = JSON.parse(cachedStr);
        if (Date.now() - cached.timestamp < VERSION_CACHE_TTL_MS) {
          log.info("useVersionCheck: Using cached version info");
          setUpdateRequired(cached.updateRequired);
          setVersionInfo(cached.data);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      log.warn("useVersionCheck: Failed to read cache", e);
    }

    try {
      setLoading(true);
      const platform = Platform.OS === "android" ? "android" : "ios";
      const currentVersion = Constants.expoConfig?.version || "1.0.0";

      const { data, error } = await supabase
        .from("app_versions")
        .select("*")
        .eq("platform", platform)
        .eq("enabled", true)
        .single();

      if (error) throw error;

      let needsUpdate = false;
      if (data) {
        const latestVersion = data.version;
        needsUpdate = isVersionLower(currentVersion, latestVersion);
        if (needsUpdate) {
          setUpdateRequired(true);
          setVersionInfo(data);
        }
      }

      const cacheEntry: CachedVersion = {
        data: data || null,
        updateRequired: needsUpdate,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(VERSION_CACHE_KEY, JSON.stringify(cacheEntry));
    } catch (error) {
      log.error("Error al verificar versión:", error);
    } finally {
      setLoading(false);
    }
  };

  const isVersionLower = (current: string, latest: string) => {
    const currentParts = current.split(".").map(Number);
    const latestParts = latest.split(".").map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const cur = currentParts[i] || 0;
      const lat = latestParts[i] || 0;
      if (cur < lat) return true;
      if (cur > lat) return false;
    }
    return false;
  };

  return { updateRequired, versionInfo, loading, checkVersion };
};
