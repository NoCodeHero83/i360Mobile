import { useCallback, useEffect, useState } from "react";
import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/context/ToastContext";
import {
  GoogleCalendarConnection,
  googleCalendarService,
} from "@/services/googleCalendarService";
import { logger } from "@/utils/logger";
import { getSupabaseFunctionErrorDetail } from "@/utils/supabaseFunctionError";

const log = logger.scoped("useGoogleCalendar");

const GOOGLE_CALENDAR_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID;

const GOOGLE_CALENDAR_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID;

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

const getExpiresAt = () => Date.now() + 3600 * 1000;

/**
 * En iOS el sign-in de Google necesita que la app tenga una UIWindowScene
 * activa en primer plano (RCTKeyWindow). Si se llama mientras la app no está
 * activa, Google Sign-In falla con "No presenting view controller found".
 * Esta función espera a que la app esté en foreground antes de continuar.
 */
const waitForForeground = async () => {
  if (Platform.OS !== "ios") return;
  if (AppState.currentState === "active") return;

  await new Promise<void>((resolve) => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        subscription.remove();
        resolve();
      }
    });
  });
};

let googleSigninConfigured = false;

const configureGoogleSignin = () => {
  if (googleSigninConfigured) return;

  GoogleSignin.configure({
    scopes: CALENDAR_SCOPES,
    webClientId: GOOGLE_CALENDAR_WEB_CLIENT_ID,
    iosClientId: GOOGLE_CALENDAR_IOS_CLIENT_ID,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });

  googleSigninConfigured = true;
};

export function useGoogleCalendar(userId?: string | null) {
  const { showToast } = useToast();
  const [connection, setConnection] =
    useState<GoogleCalendarConnection | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshConnectionState = useCallback(async () => {
    if (!userId) {
      setConnection(null);
      return null;
    }

    const stored = await googleCalendarService.getValidConnection(userId);
    setConnection(stored);
    return stored;
  }, [userId]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      configureGoogleSignin();
    }

    refreshConnectionState();
  }, [refreshConnectionState]);

  const connect = useCallback(async () => {
    if (!userId) {
      showToast("Inicia sesión para conectar Google Calendar", "error");
      return null;
    }

    if (Platform.OS === "web") {
      showToast(
        "Google Calendar nativo solo funciona en la app Android/iOS, no en web.",
        "info",
      );
      return null;
    }

    if (Constants.appOwnership === "expo") {
      showToast(
        "Google Calendar nativo requiere una build de Ilyrox. Expo Go no soporta esta librería.",
        "info",
      );
      return null;
    }

    if (!GOOGLE_CALENDAR_WEB_CLIENT_ID) {
      showToast(
        "Falta EXPO_PUBLIC_GOOGLE_CALENDAR_WEB_CLIENT_ID. Crea un OAuth Client de tipo Aplicación web.",
        "error",
      );
      return null;
    }

    if (Platform.OS === "ios" && !GOOGLE_CALENDAR_IOS_CLIENT_ID) {
      showToast(
        "Falta EXPO_PUBLIC_GOOGLE_CALENDAR_IOS_CLIENT_ID. Crea un OAuth Client de tipo iOS.",
        "error",
      );
      return null;
    }

    try {
      setLoading(true);
      configureGoogleSignin();
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      // En iOS, si la app no está en primer plano, Google Sign-In no puede
      // presentar su UI ("No presenting view controller found").
      await waitForForeground();

      const signInResponse = await GoogleSignin.signIn();
      if (isCancelledResponse(signInResponse)) {
        showToast("Conexión con Google Calendar cancelada", "info");
        return null;
      }

      await GoogleSignin.addScopes({ scopes: CALENDAR_SCOPES });
      const tokens = await GoogleSignin.getTokens();

      const nextConnection: GoogleCalendarConnection = {
        accessToken: tokens.accessToken,
        expiresAt: getExpiresAt(),
        calendarId: "primary",
      };

      await googleCalendarService.saveConnection(userId, nextConnection);

      if (signInResponse.type === "success") {
        const serverAuthCode = signInResponse.data.serverAuthCode;
        if (serverAuthCode) {
          const { error } = await supabase.functions.invoke(
            "google-calendar-connect",
            {
              body: {
                serverAuthCode,
                calendarId: "primary",
              },
            },
          );
          if (error) {
            const detail = await getSupabaseFunctionErrorDetail(error);
            log.warn("backend connect failed", detail);
            showToast(
              "Calendar conectado en este dispositivo, pero falta configurar la sincronización inversa en Supabase.",
              "info",
            );
          }
        } else {
          log.warn("Google Sign-In did not return serverAuthCode");
          showToast(
            "Calendar conectado, pero Google no devolvió código para sincronización inversa.",
            "info",
          );
        }
      }

      setConnection(nextConnection);
      showToast("Google Calendar conectado", "success");
      return nextConnection;
    } catch (error: unknown) {
      if (
        isErrorWithCode(error) &&
        error.code === statusCodes.SIGN_IN_CANCELLED
      ) {
        showToast("Conexión con Google Calendar cancelada", "info");
        return null;
      }

      log.warn("connect failed", error);
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo conectar Google Calendar";
      showToast(message, "error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [showToast, userId]);

  const disconnect = useCallback(async () => {
    if (!userId) return;
    await googleCalendarService.clearConnection(userId);
    if (Platform.OS !== "web") {
      await GoogleSignin.signOut().catch((error: unknown) => {
        log.warn("signOut failed", error);
      });
    }
    setConnection(null);
    showToast("Google Calendar desconectado", "success");
  }, [showToast, userId]);

  const ensureConnection = useCallback(async () => {
    const stored = await refreshConnectionState();
    if (stored) return stored;
    return connect();
  }, [connect, refreshConnectionState]);

  return {
    connection,
    loading,
    connect,
    disconnect,
    ensureConnection,
    isConnected: !!connection,
    platform: Platform.OS,
  };
}