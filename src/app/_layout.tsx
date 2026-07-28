import {
  Stack,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { OneSignal } from "react-native-onesignal";
import { useFonts } from "expo-font";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Platform,
  StatusBar,
  LogBox,
  AppState,
  AppStateStatus,
} from "react-native";

import * as Sentry from "@sentry/react-native";
Sentry.init({
  dsn: "https://8ec2cbc6b0f7d719fbbbb7263f3f2a8e@o4511815556464640.ingest.us.sentry.io/4511815562362880",
  tracesSampleRate: 0.2,
  enabled: !__DEV__,
});

import { AppProvider } from "@/context/AppContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";

import { ModalProvider } from "@/context/ModalContext";
import { SafeInsetsProvider } from "@/context/SafeInsetsContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import PendingApprovalScreen from "@/screens/PendingApprovalScreen";
import { InitialLoading } from "@/components/common/InitialLoading";
import { useVersionCheck } from "@/hooks/useVersionCheck";
import { useOTAUpdates } from "@/hooks/useOTAUpdates";
import { VersionUpdateModal } from "@/components/modals/VersionUpdateModal";

// Ignore common warnings that do not affect functionality
LogBox.ignoreLogs([
  "Support for defaultProps will be removed",
  "MemoizedTNodeRenderer",
  "TNodeChildrenRenderer",
  "TRenderEngineProvider",
]);

/**
 * Decide a dónde navegar cuando el usuario toca una notificación push.
 * Devuelve la navegación a ejecutar, o null si no hay destino conocido.
 *
 * El destino se decide por `screen`, que es lo que realmente manda el servidor:
 * la Edge Function `enviar_notificacion_push` arma el payload como
 * `{ screen, type: additionalData.type ?? "notification", ...additionalData }`.
 *
 * Antes esto se decidía por `type` con valores en inglés ("new_message",
 * "new_match"…) que el backend NUNCA envía: en los mensajes `type` ni siquiera
 * existe (la función lo rellena con "notification") y en los matches viene en
 * español ("nuevo_match"). Además se navegaba a /(stack)/chat/[id] y
 * /(stack)/profile/[id], rutas que no existen. Resultado: ningún toque navegaba
 * y la app solo se traía al frente en la pantalla anterior.
 *
 * Las claves de los ids también son en español: conversacion_id, emisor_id,
 * propiedad_id, profesional_id.
 */
function buildNotificationNavigation(
  data: any,
  router: ReturnType<typeof useRouter>,
): (() => void) | null {
  if (!data) return null;

  switch (data.screen) {
    case "ChatDetail":
      // Se pasa el emisor (no la conversación): MessagingScreen resuelve con él
      // la conversación de esa propiedad y los datos del otro usuario (nombre y
      // foto del encabezado). Con solo conversationId se queda en la lista.
      if (!data.emisor_id) return () => router.push("/(stack)/messages");
      return () =>
        router.push({
          pathname: "/(stack)/messages",
          params: {
            initialUser: JSON.stringify({ id: data.emisor_id }),
            initialPropertyId: data.propiedad_id ?? "",
          },
        });

    case "matches":
    case "MatchDetail":
      return () => router.push("/(stack)/matches");

    case "AppointmentDetail":
      return () => router.push("/(stack)/appointments");

    case "PropertyDetail":
      if (!data.propiedad_id) return null;
      return () =>
        router.push({
          pathname: "/(stack)/property/[id]",
          params: { id: data.propiedad_id },
        });

    case "ProfileReviews":
      // La reseña es sobre uno mismo → perfil propio.
      return () => router.push("/(tabs)/profile");

    default:
      if (data.type === "recordar_filtros") return () => router.navigate("/(stack)/map");
      return null;
  }
}

/**
 * Captura del toque en una push, a nivel de MÓDULO.
 *
 * Con la app cerrada, OneSignal emite el evento "click" en cuanto se inicializa
 * —aquí mismo, al evaluarse este archivo—, muchísimo antes de que RootLayout
 * monte y registre un listener en un `useEffect` (hay que esperar a fuentes,
 * providers y sesión). El SDK no reemite ese evento a listeners tardíos: se
 * perdía y la app arrancaba en el feed. Con la app abierta o minimizada el
 * listener ya existía, y por eso ese caso sí funcionaba.
 *
 * Registrando el listener aquí —lo más temprano que hay JS— el dato queda
 * guardado hasta que la app esté en condiciones de navegar.
 */
let pendingNotificationData: any = null;
const notificationClickListeners = new Set<(data: any) => void>();

/** Entrega el toque a quien escuche; si aún no hay nadie, lo guarda. */
function emitNotificationClick(data: any) {
  if (notificationClickListeners.size === 0) {
    pendingNotificationData = data;
    return;
  }
  notificationClickListeners.forEach((fn) => fn(data));
}

/** Devuelve el toque guardado (y lo consume) o null. */
function takePendingNotificationClick() {
  const data = pendingNotificationData;
  pendingNotificationData = null;
  return data;
}

// OneSignal init
if (Platform.OS !== "web") {
  OneSignal.initialize(process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID!);
  OneSignal.Notifications.requestPermission(true);
  OneSignal.Notifications.addEventListener("click", (event: any) => {
    const data = event?.notification?.additionalData;
    if (data) emitNotificationClick(data);
  });
}

const queryClient = new QueryClient();

/**
 * React Query solo cablea `focusManager` a `visibilitychange` del navegador.
 * En React Native nadie lo hace, así que `refetchOnWindowFocus` nunca dispara
 * y queries como la de conversaciones (badge de mensajes no leídos) se quedan
 * obsoletas en el móvil aunque en la web se refresquen solas.
 */
function useReactQueryAppStateFocus() {
  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(status === "active");
      }
    };
    const subscription = AppState.addEventListener("change", onChange);
    return () => subscription.remove();
  }, []);
}

export default function RootLayout() {
  useReactQueryAppStateFocus();

  // Atrapa errores JS no manejados (promesas, efectos) para evitar crash
  // en producción. En desarrollo React Native ya muestra RedBox.
  useEffect(() => {
    const handler = (error: Error) => {
      Sentry.captureException(error);
    };
    // ErrorUtils existe en RN para establecer manejador global
    const prevHandler = (ErrorUtils as any)?.getGlobalHandler?.();
    (ErrorUtils as any)?.setGlobalHandler?.((error: Error, isFatal: boolean) => {
      handler(error);
      prevHandler?.(error, isFatal);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <AuthProvider>
          <AppProvider>
            <ToastProvider>
              <SafeAreaProvider>
                <ModalProvider>
                  <SafeInsetsProvider>
                    <BottomSheetModalProvider>
                      <QueryClientProvider client={queryClient}>
                        <RootLayoutNav />
                      </QueryClientProvider>
                    </BottomSheetModalProvider>
                  </SafeInsetsProvider>
                </ModalProvider>
              </SafeAreaProvider>
            </ToastProvider>
          </AppProvider>
        </AuthProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { session, profile, loading: authLoading } = useAuth();
  const {
    updateRequired,
    versionInfo,
    loading: versionLoading,
  } = useVersionCheck();
  const segments = useSegments();
  const router = useRouter();

  // Toque en una push pendiente de navegar.
  const [notificationClick, setNotificationClick] = useState<any>(null);

  // Precarga las fuentes de íconos (Ionicons + MaterialCommunityIcons) antes de
  // renderizar la app. Evita que íconos como el de "Agrícola" (tractor, de
  // MaterialCommunityIcons) parpadeen o no aparezcan al cargar su fuente bajo
  // demanda al abrir la pantalla de Crear propiedad. Si la carga falla, avanzamos
  // igual para no bloquear el arranque.
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });
  const fontsReady = fontsLoaded || !!fontError;

  // Verifica/aplica actualizaciones OTA (EAS Update) silenciosamente al iniciar.
  useOTAUpdates();

  const loading = authLoading || versionLoading || !fontsReady;

  // Mostrar notificaciones aunque la app esté en foreground — efecto estable sin dependencias
  useEffect(() => {
    if (Platform.OS === "web") return;
    const handleForegroundDisplay = (event: any) => {
      try { event.getNotification().display(); } catch {}
    };
    OneSignal.Notifications.addEventListener("foregroundWillDisplay", handleForegroundDisplay);
    return () => OneSignal.Notifications.removeEventListener("foregroundWillDisplay", handleForegroundDisplay);
  }, []);

  // Recoge el toque en una push: el que llegó antes de montar (arranque en frío,
  // guardado a nivel de módulo) y los que lleguen con la app ya viva.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const onClick = (data: any) => setNotificationClick(data);
    notificationClickListeners.add(onClick);
    const pending = takePendingNotificationClick();
    if (pending) setNotificationClick(pending);
    return () => {
      notificationClickListeners.delete(onClick);
    };
  }, []);

  // Global StatusBar setup
  useEffect(() => {
    StatusBar.setHidden(false);
    if (Platform.OS === "android") {
      StatusBar.setBackgroundColor("transparent");
      StatusBar.setTranslucent(true);
      StatusBar.setBarStyle("dark-content"); // Default to dark content for light theme
    } else {
      StatusBar.setBarStyle("dark-content");
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    const isResetPassword = segments.includes("reset-password");

    if (!session && !inAuthGroup) {
      router.replace("/login");
    } else if (session && inAuthGroup && !isResetPassword) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments]);

  /**
   * Ejecuta la navegación de una push tocada antes de que la app pudiera navegar.
   *
   * Medido en dispositivo con la app cerrada: el click llega a los ~35 ms, este
   * componente lo recoge a los ~64 ms y `perfil` no está hasta los ~525 ms. Por
   * eso hay que esperar en vez de navegar de golpe:
   *
   * - `loading`/`session`/`profile`: mientras cargan, el árbol devuelve
   *   <InitialLoading/> y el <Stack> ni siquiera está montado.
   * - `rootNavigationState.key`: sin navegador raíz montado, `router.push` se
   *   descarta EN SILENCIO (no lanza, no avisa).
   * - `segments[0] !== "(auth)"`: si la sesión tarda, la app pasa por /login y
   *   el efecto de sesión de arriba hace `router.replace("/(tabs)")`, que nos
   *   pisaría. Esperando a salir de (auth), ese replace ya ocurrió.
   */
  const rootNavigationState = useRootNavigationState();

  useEffect(() => {
    if (!notificationClick) return;

    const ready =
      !loading &&
      !!session &&
      !!profile &&
      !!rootNavigationState?.key &&
      segments[0] !== "(auth)";
    if (!ready) return;

    const go = buildNotificationNavigation(notificationClick, router);
    setNotificationClick(null);
    if (!go) return;

    // OJO: este temporizador NO se cancela en la limpieza del efecto. El
    // `setNotificationClick(null)` de arriba vuelve a disparar este mismo
    // efecto, y un `return () => clearTimeout(timer)` mataba la navegación
    // antes de que llegara a ejecutarse. Ya no hace falta cancelarlo: el click
    // se consume justo arriba, así que solo se programa una vez.
    setTimeout(go, 300);
  }, [
    notificationClick,
    loading,
    session,
    profile,
    segments,
    rootNavigationState?.key,
    router,
  ]);

  if (loading) {
    return <InitialLoading />;
  }

  // Si hay sesión pero el perfil aún no carga, seguimos en loading
  if (session && !profile) {
    return <InitialLoading />;
  }

  // Verificación de aprobaciones para no-admins
  if (session && profile) {
    const isAdmin = profile.rol === "admin";
    if (
      !isAdmin &&
      (profile.aprobaciones_recibidas || 0) <
        (profile.aprobaciones_requeridas || 3)
    ) {
      return <PendingApprovalScreen />;
    }
  }

  // Main Stack incorporating all groups
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(stack)" />
        {/* Los formularios de creación guardan todo en estado local: un gesto
            lateral accidental hacía pop de la ruta y borraba lo llenado sin
            preguntar. La salida se confirma desde el propio formulario. */}
        <Stack.Screen
          name="create/property"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
        <Stack.Screen
          name="create/reel"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
        <Stack.Screen
          name="create/post"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
      </Stack>
      {updateRequired && versionInfo && (
        <VersionUpdateModal
          visible={updateRequired}
          storeUrl={versionInfo.store_url}
        />
      )}
    </>
  );
}

