import React, { ComponentProps } from "react";
import {
  ActivityIndicator,
  FlatList,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Switch,
  Platform,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { OneSignal } from "react-native-onesignal";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/colors";
import { AppHeader } from "@/components/AppHeader";
import EditProfile from "@/components/Profile/EditProfile";
import { useModal } from "@/context/ModalContext";
import { supabase } from "@/lib/supabase";
import * as WebBrowser from "expo-web-browser";
import { LEGAL_URLS } from "@/constants/legal";
import Avatar from "@/components/shared/Avatar";
import { blockService, BlockedUser } from "@/services/blockService";
import { ConfirmationModal } from "@/components/modals/ConfirmationModal";

import { router } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";

type IoniconName = ComponentProps<typeof Ionicons>["name"];
import Constants from "expo-constants";
import { ScreenWrapper } from "@/screens/ScreenWrapper";
import { logger } from "@/utils/logger";

const log = logger.scoped("SettingsScreen");

const SettingsScreen: React.FC = () => {
  const { signOut, user } = useAuth();
  const { showModal } = useModal();
  const queryClient = useQueryClient();

  const handleLogout = () => {
    showModal({
      title: "Cerrar Sesión",
      message: "¿Estás seguro de que quieres cerrar sesión?",
      confirmText: "Cerrar Sesión",
      cancelText: "Cancelar",
      onConfirm: async () => {
        try {
          await signOut();
        } catch (error) {
          log.error("performLogout error:", error);
          showModal({
            title: "Error",
            message: "No se pudo cerrar sesión. Inténtalo de nuevo.",
            confirmText: "OK",
          });
        }
      },
    });
  };

  const openLegal = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch((error) => {
      log.error("openLegal error:", error);
    });
  };

  const performDeleteAccount = async () => {
    const { error } = await supabase.functions.invoke("eliminar-cuenta", {
      method: "POST",
    });
    if (error) {
      log.error("eliminar-cuenta error:", error);
      // El modal de confirmación se cierra al volver; mostramos el error después.
      setTimeout(() => {
        showModal({
          title: "Error",
          message:
            "No se pudo eliminar la cuenta. Revisa tu conexión e inténtalo de nuevo.",
          confirmText: "OK",
          type: "alert",
        });
      }, 350);
      return;
    }
    // Cuenta eliminada: limpiar sesión local y volver al login.
    await signOut();
  };

  const handleDeleteAccount = () => {
    showModal({
      title: "Eliminar cuenta",
      message:
        "Esta acción es permanente. Se eliminarán tu perfil, propiedades, publicaciones, mensajes y toda tu información. No se puede deshacer.",
      confirmText: "Eliminar mi cuenta",
      cancelText: "Cancelar",
      confirmVariant: "danger",
      onConfirm: performDeleteAccount,
    });
  };

  const [showEditProfile, setShowEditProfile] = React.useState(false);
  const [showBlockedUsers, setShowBlockedUsers] = React.useState(false);
  const [blockedUsers, setBlockedUsers] = React.useState<BlockedUser[]>([]);
  const [loadingBlockedUsers, setLoadingBlockedUsers] = React.useState(false);
  const [blockedUsersError, setBlockedUsersError] = React.useState<string | null>(
    null,
  );
  const [confirmUnblockUser, setConfirmUnblockUser] =
    React.useState<BlockedUser | null>(null);
  const [unblockingUserId, setUnblockingUserId] = React.useState<string | null>(
    null,
  );

  const invalidateBlockedContent = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    queryClient.invalidateQueries({ queryKey: ["map-properties"] });
    queryClient.invalidateQueries({ queryKey: ["mapFeedItems"] });
    queryClient.invalidateQueries({ queryKey: ["user-blocks"] });
  }, [queryClient]);

  const loadBlockedUsers = React.useCallback(async () => {
    if (!user?.id) return;
    setLoadingBlockedUsers(true);
    setBlockedUsersError(null);
    try {
      const users = await blockService.getBlockedUsers(user.id);
      setBlockedUsers(users);
    } catch (error) {
      log.error("loadBlockedUsers error:", error);
      setBlockedUsersError("No se pudieron cargar los usuarios bloqueados.");
    } finally {
      setLoadingBlockedUsers(false);
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (showBlockedUsers) {
      loadBlockedUsers();
    }
  }, [showBlockedUsers, loadBlockedUsers]);

  const handleUnblockUser = (blockedUser: BlockedUser) => {
    if (!user?.id) return;
    setConfirmUnblockUser(blockedUser);
  };

  const confirmUnblockSelectedUser = async () => {
    if (!user?.id || !confirmUnblockUser) return;

    setUnblockingUserId(confirmUnblockUser.id);
    setBlockedUsersError(null);
    try {
      await blockService.unblockUser(user.id, confirmUnblockUser.id);
      setBlockedUsers((prev) =>
        prev.filter((item) => item.id !== confirmUnblockUser.id),
      );
      setConfirmUnblockUser(null);
      invalidateBlockedContent();
    } catch (error) {
      log.error("unblockUser error:", error);
      setBlockedUsersError("No se pudo desbloquear al usuario. Inténtalo de nuevo.");
    } finally {
      setUnblockingUserId(null);
    }
  };

  // ── Switch de notificaciones push (por dispositivo) ──
  // optIn/optOut de OneSignal es a nivel de ESTE dispositivo y el SDK lo
  // persiste entre sesiones. getOptedInAsync() es true cuando hay permiso del
  // sistema y no se hizo optOut. Escuchamos 'change' para reflejar cambios
  // (p. ej. si el usuario toca el permiso desde ajustes del sistema).
  const [pushEnabled, setPushEnabled] = React.useState(false);
  const [pushBusy, setPushBusy] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS === "web") return;
    let mounted = true;
    OneSignal.User.pushSubscription
      .getOptedInAsync()
      .then((v) => mounted && setPushEnabled(!!v))
      .catch(() => {});
    const onChange = () => {
      OneSignal.User.pushSubscription
        .getOptedInAsync()
        .then((v) => mounted && setPushEnabled(!!v))
        .catch(() => {});
    };
    OneSignal.User.pushSubscription.addEventListener("change", onChange);
    return () => {
      mounted = false;
      OneSignal.User.pushSubscription.removeEventListener("change", onChange);
    };
  }, []);

  const handleTogglePush = async (next: boolean) => {
    if (Platform.OS === "web" || pushBusy) return;
    setPushBusy(true);
    // Optimista: refleja la intención al instante; el listener 'change' corrige
    // si el permiso del sistema no lo permite.
    setPushEnabled(next);
    try {
      if (next) {
        // optIn dispara el prompt del sistema si aún no se ha decidido.
        OneSignal.User.pushSubscription.optIn();
        const granted = await OneSignal.Notifications.requestPermission(true);
        const optedIn = await OneSignal.User.pushSubscription.getOptedInAsync();
        setPushEnabled(!!optedIn);
        // Si el permiso está denegado a nivel del sistema, hay que abrir ajustes.
        if (!granted && !optedIn) {
          showModal({
            title: "Activa las notificaciones",
            message:
              "Las notificaciones están desactivadas en los ajustes del sistema. Ábrelos para permitirlas.",
            confirmText: "Abrir ajustes",
            cancelText: "Ahora no",
            onConfirm: () => Linking.openSettings(),
          });
        }
      } else {
        OneSignal.User.pushSubscription.optOut();
        setPushEnabled(false);
      }
    } catch (e) {
      log.error("Error alternando push:", e);
      // Revertir a lo que reporte el SDK.
      try {
        const v = await OneSignal.User.pushSubscription.getOptedInAsync();
        setPushEnabled(!!v);
      } catch {}
    } finally {
      setPushBusy(false);
    }
  };

  const settingsOptions: { id: string; title: string; icon: IoniconName; onPress: () => void; color?: string; showChevron?: boolean }[] = [
    {
      id: "edit_profile",
      title: "Editar perfil",
      icon: "person-outline",
      onPress: () => {
        setShowEditProfile(true);
      },
    },
    {
      id: "easy_broker",
      title: "Easy Broker",
      icon: "business-outline",
      onPress: () => {
        router.push("/easy-broker");
      },
    },
    {
      id: "support",
      title: "Soporte",
      icon: "help-circle-outline",
      onPress: () => {
        router.push("/support");
      },
    },
    {
      id: "blocked_users",
      title: "Usuarios bloqueados",
      icon: "ban-outline",
      onPress: () => {
        setShowBlockedUsers(true);
      },
    },
    {
      id: "privacy",
      title: "Política de privacidad",
      icon: "shield-checkmark-outline",
      onPress: () => openLegal(LEGAL_URLS.privacy),
    },
    {
      id: "terms",
      title: "Términos y condiciones",
      icon: "document-text-outline",
      onPress: () => openLegal(LEGAL_URLS.terms),
    },
    {
      id: "logout",
      title: "Cerrar sesión",
      icon: "log-out-outline",
      onPress: handleLogout,
      color: COLORS.error,
      showChevron: false,
    },
    {
      id: "delete_account",
      title: "Eliminar cuenta",
      icon: "trash-outline",
      onPress: handleDeleteAccount,
      color: COLORS.error,
      showChevron: false,
    },
  ];

  const appVersion = Constants.expoConfig?.version || "1.0.0";
  const blockedUsersCountLabel =
    blockedUsers.length === 1 ? "1 usuario" : `${blockedUsers.length} usuarios`;

  return (
    <ScreenWrapper withHeader={false} style={styles.container}>
      <AppHeader
        title="Configuración"
        showBackButton={true}
        onBack={() => router.back()}
      />

      <ScrollView style={styles.content}>
        {Platform.OS !== "web" && (
          <View style={styles.section}>
            <View style={styles.optionItem}>
              <View style={styles.optionLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="notifications-outline"
                    size={22}
                    color={COLORS.primary}
                  />
                </View>
                <Text style={styles.optionTitle}>Notificaciones push</Text>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={handleTogglePush}
                disabled={pushBusy}
                trackColor={{ false: COLORS.cardBorder, true: COLORS.primary }}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.cardBorder}
              />
            </View>
          </View>
        )}

        <View style={styles.section}>
          {settingsOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionItem}
              onPress={() => {
                option.onPress();
              }}
              activeOpacity={0.7}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={option.title}
            >
              <View style={styles.optionLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    option.color === COLORS.error && {
                      backgroundColor: COLORS.errorLight,
                    },
                  ]}
                >
                  <Ionicons
                    name={option.icon}
                    size={22}
                    color={option.color || COLORS.primary}
                  />
                </View>
                <Text
                  style={[
                    styles.optionTitle,
                    option.color === COLORS.error && { color: COLORS.error },
                  ]}
                >
                  {option.title}
                </Text>
              </View>
              {option.showChevron !== false && (
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={COLORS.textTertiary}
                />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.versionText}>Versión {appVersion}</Text>
        </View>

      </ScrollView>

      <Modal
        visible={showEditProfile}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditProfile(false)}
        // iOS: el swipe-down del pageSheet no dispara onRequestClose; onDismiss
        // mantiene el estado sincronizado para que el modal pueda reabrirse.
        onDismiss={() => setShowEditProfile(false)}
      >
        <EditProfile onBack={() => setShowEditProfile(false)} />
      </Modal>

      <Modal
        visible={showBlockedUsers}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowBlockedUsers(false)}
        onDismiss={() => setShowBlockedUsers(false)}
      >
        <ScreenWrapper withHeader={false} style={styles.modalContainer}>
          <AppHeader
            title="Usuarios bloqueados"
            subtitle={blockedUsersCountLabel}
            showBackButton={true}
            onBack={() => setShowBlockedUsers(false)}
          />

          {loadingBlockedUsers ? (
            <View style={styles.blockedLoading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.blockedEmptyText}>Cargando bloqueados...</Text>
            </View>
          ) : (
            <FlatList
              data={blockedUsers}
              keyExtractor={(item) => item.id}
              ListHeaderComponent={
                blockedUsersError ? (
                  <View style={styles.blockedError}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={18}
                      color={COLORS.error}
                    />
                    <Text style={styles.blockedErrorText}>
                      {blockedUsersError}
                    </Text>
                    <TouchableOpacity
                      onPress={loadBlockedUsers}
                      style={styles.retryButton}
                      accessibilityRole="button"
                      accessibilityLabel="Reintentar cargar usuarios bloqueados"
                    >
                      <Text style={styles.retryButtonText}>Reintentar</Text>
                    </TouchableOpacity>
                  </View>
                ) : null
              }
              contentContainerStyle={[
                styles.blockedList,
                blockedUsers.length === 0 && styles.blockedListEmpty,
              ]}
              ListEmptyComponent={
                <View style={styles.blockedEmpty}>
                  <View style={styles.blockedEmptyIcon}>
                    <Ionicons
                      name="ban-outline"
                      size={30}
                      color={COLORS.primary}
                    />
                  </View>
                  <Text style={styles.blockedEmptyTitle}>
                    No tienes usuarios bloqueados
                  </Text>
                  <Text style={styles.blockedEmptyText}>
                    Cuando bloquees a alguien, aparecerá aquí para poder
                    desbloquearlo.
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View style={styles.blockedItem}>
                  <View style={styles.blockedUserInfo}>
                    <Avatar
                      uri={item.avatar || undefined}
                      name={item.nombre}
                      size={46}
                    />
                    <View style={styles.blockedTextWrap}>
                      <Text style={styles.blockedName} numberOfLines={1}>
                        {item.nombre}
                      </Text>
                      <Text style={styles.blockedRole} numberOfLines={1}>
                        {item.ocupacion || "Usuario"}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.unblockButton}
                    onPress={() => handleUnblockUser(item)}
                    disabled={unblockingUserId === item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Desbloquear a ${item.nombre}`}
                  >
                    {unblockingUserId === item.id ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.unblockButtonText}>Desbloquear</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          )}

          <ConfirmationModal
            visible={!!confirmUnblockUser}
            title="Desbloquear usuario"
            message={
              confirmUnblockUser
                ? `¿Quieres desbloquear a ${confirmUnblockUser.nombre}? Volverás a ver su contenido en la plataforma.`
                : ""
            }
            confirmText="Desbloquear"
            cancelText="Cancelar"
            onConfirm={confirmUnblockSelectedUser}
            onCancel={() => {
              if (!unblockingUserId) setConfirmUnblockUser(null);
            }}
            loading={!!unblockingUserId}
            confirmVariant="primary"
          />
        </ScreenWrapper>
      </Modal>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  section: {
    marginTop: 20,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.primaryTransparent,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  footer: {
    padding: 32,
    alignItems: "center",
  },
  versionText: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  blockedLoading: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  blockedList: {
    paddingVertical: 12,
  },
  blockedListEmpty: {
    flexGrow: 1,
  },
  blockedError: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.errorLight,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  blockedErrorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.error,
  },
  retryButton: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.errorLight,
  },
  retryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.error,
  },
  blockedItem: {
    minHeight: 74,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  blockedUserInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  blockedTextWrap: {
    flex: 1,
  },
  blockedName: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  blockedRole: {
    marginTop: 3,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  unblockButton: {
    minWidth: 104,
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
  },
  unblockButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.primary,
  },
  blockedEmpty: {
    flex: 1,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  blockedEmptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primaryTransparent,
    marginBottom: 16,
  },
  blockedEmptyTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.textPrimary,
    textAlign: "center",
  },
  blockedEmptyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});

export default SettingsScreen;