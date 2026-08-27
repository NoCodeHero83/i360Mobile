/**
 * useExternalAuth.ts
 * Hook para manejar autenticación externa (Google, Facebook, Apple)
 */

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { perfiles } from "@/types";
import { useApp } from "@/context/AppContext";
import { useImageUpload } from "@/hooks/useImageUpload";
import { useGoogleAuth } from "@/lib/useGoogleAuth";
import { OneSignal } from "react-native-onesignal";
import { Platform } from "react-native";
import { useModal } from "@/context/ModalContext";
import { logger } from "@/utils/logger";
import { collapseSpaces } from "@/utils/stringNormalizer";
import { applyStoredAdvisorInvite } from "@/services/communityService";

const log = logger.scoped("useExternalAuth");

export type AuthProvider = "google" | "facebook" | "apple";

export interface PendingExternalUser {
  id: string;
  email: string;
  avatarUrl?: string | null;
  fullName?: string | null;
}

export interface ExternalAuthFormData {
  name: string;
  lastNamePaterno: string;
  lastNameMaterno: string;
  phone: string;
  estado: string;
  avatarUri: string | null;
  ocupacion: string;
  modalidad: string;
  nombreInmobiliaria: string;
  fechaInicioCarrera: string;
}

export function useExternalAuth() {
  const [loading, setLoading] = useState(false);
  const [pendingUser, setPendingUser] = useState<PendingExternalUser | null>(
    null,
  );

  const { setCurrentUser } = useApp();
  const { uploadImage } = useImageUpload();
  const { signInWithGoogle, loading: googleLoading } = useGoogleAuth();
  const { showModal } = useModal();

  // Manejar autenticación con proveedor externo
  const handleProviderAuth = useCallback(
    async (
      provider: AuthProvider,
      onNeedProfileCompletion: (
        user: PendingExternalUser,
        extractedData: Partial<ExternalAuthFormData>,
      ) => void,
      onSuccess: () => void,
    ): Promise<void> => {
      setLoading(true);
      try {
        let authResult: { user: any; error: any } | null = null;
        let externalError: string | null = null;

        switch (provider) {
          case "google":
            const res = await signInWithGoogle();
            if (res?.error) {
              externalError = res.error;
            } else if (res?.user) {
              authResult = { user: res.user, error: null };
            }
            break;
          case "facebook":
            showModal({ title: "Próximamente", message: "Inicio con Facebook en desarrollo", confirmText: "OK" });
            setLoading(false);
            return;
          case "apple":
            showModal({ title: "Próximamente", message: "Inicio con Apple en desarrollo", confirmText: "OK" });
            setLoading(false);
            return;
        }

        if (externalError) {
          if (externalError !== "Inicio de sesión cancelado o fallido") {
            showModal({ title: "Error de Autenticación", message: externalError, confirmText: "OK" });
          }
          setLoading(false);
          return;
        }

        if (!authResult?.user) {
          setLoading(false);
          return;
        }

        const user = authResult.user;

        // Verificar si el perfil existe
        const { data: profile } = await supabase
          .from("perfiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profile) {
          // Usuario existente - login exitoso
          if (Platform.OS !== "web") OneSignal.login(user.id);
          setCurrentUser(profile);
          onSuccess();
        } else {
          // Usuario nuevo - necesita completar perfil
          const fullName =
            user.user_metadata?.full_name || user.user_metadata?.name || "";
          const spaceIndex = fullName.indexOf(" ");

          let extractedName = "";
          let extractedLastName = "";

          if (spaceIndex > 0) {
            extractedName = fullName.substring(0, spaceIndex);
            extractedLastName = fullName.substring(spaceIndex + 1);
          } else {
            extractedName = fullName;
          }

          const pendingUserData: PendingExternalUser = {
            id: user.id,
            email: user.email!,
            avatarUrl:
              user.user_metadata?.avatar_url || user.user_metadata?.picture,
            fullName,
          };

          setPendingUser(pendingUserData);

          onNeedProfileCompletion(pendingUserData, {
            name: extractedName,
            lastNamePaterno: extractedLastName,
          });
        }
      } catch (error: any) {
        showModal({ title: "Error de Autenticación", message: error.message, confirmText: "OK" });
      } finally {
        setLoading(false);
      }
    },
    [signInWithGoogle, setCurrentUser],
  );

  // Finalizar registro externo
  const finalizeExternalRegistration = useCallback(
    async (
      formData: ExternalAuthFormData,
      onSuccess: () => void,
    ): Promise<boolean> => {
      if (!pendingUser) return false;

      // Validar campos requeridos
      if (!formData.name.trim()) {
        showModal({ title: "Error", message: "El nombre es obligatorio", confirmText: "OK" });
        return false;
      }
      if (!formData.estado) {
        showModal({ title: "Error", message: "Selecciona tu estado", confirmText: "OK" });
        return false;
      }
      if (!formData.ocupacion) {
        showModal({ title: "Error", message: "Selecciona tu ocupación", confirmText: "OK" });
        return false;
      }
      if (formData.ocupacion === "Asesor Inmobiliario") {
        if (!formData.modalidad) {
          showModal({ title: "Error", message: "Selecciona tu modalidad", confirmText: "OK" });
          return false;
        }
        if (formData.modalidad === "Inmobiliaria" && !formData.nombreInmobiliaria) {
          showModal({ title: "Error", message: "Ingresa el nombre de la inmobiliaria", confirmText: "OK" });
          return false;
        }
      }
      if (!formData.fechaInicioCarrera) {
        showModal({ title: "Error", message: "Selecciona la fecha en que iniciaste tu carrera", confirmText: "OK" });
        return false;
      }

      setLoading(true);
      try {
        // Subir avatar si hay uno nuevo
        let finalAvatarUrl = pendingUser.avatarUrl || "";
        if (formData.avatarUri) {
          const url = await uploadImage(
            formData.avatarUri,
            "fotos",
            "fotoperfil",
          );
          if (url) finalAvatarUrl = url;
        }

        const newProfile: perfiles = {
          id: pendingUser.id,
          email: pendingUser.email,
          nombre: collapseSpaces(formData.name || pendingUser.fullName || "Usuario"),
          apellido_paterno: collapseSpaces(formData.lastNamePaterno),
          apellido_materno: collapseSpaces(formData.lastNameMaterno),
          celular: formData.phone || "",
          prefijo_celular: undefined,
          rol: "cliente",
          pais: "Mexico",
          estado: formData.estado,
          foto: finalAvatarUrl,
          estado_registro: "pendiente",
          aprobaciones_recibidas: 0,
          aprobaciones_requeridas: 3,
          fecha_inicio_carrera: formData.fechaInicioCarrera || undefined,
          ocupacion: formData.ocupacion,
          otro_ocupacion: undefined,
          modalidad: formData.modalidad || undefined,
          nombre_inmobiliaria: formData.nombreInmobiliaria || undefined,
          curso_certificacion: undefined,
          nombre_completo: collapseSpaces(
            `${formData.name} ${formData.lastNamePaterno} ${formData.lastNameMaterno}`,
          ),
          activado_en: undefined,
          deleted_at: undefined,
          biografia: undefined,
          sitio_web: undefined,
          calificacion_promedio: undefined,
          total_calificaciones: undefined,
          total_recomendaciones_positivas: undefined,
          total_recomendaciones_negativas: undefined,
        };

        const { data, error } = await supabase
          .from("perfiles")
          .upsert(newProfile)
          .select()
          .single();

        if (error) throw error;

        await applyStoredAdvisorInvite(pendingUser.id);
 
        if (Platform.OS !== "web") OneSignal.login(pendingUser.id);
        setCurrentUser(data);
        setPendingUser(null);
        onSuccess();
        return true;
      } catch (error: any) {
        showModal({ title: "Error al crear perfil", message: error.message, confirmText: "OK" });
        return false;
      } finally {
        setLoading(false);
      }
    },
    [pendingUser, uploadImage, setCurrentUser],
  );

  // Cancelar registro externo
  const cancelExternalRegistration = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      if (Platform.OS !== "web") {
        // Ver AuthContext.signOut: removeAlias("external_id") rompe la
        // identidad en OneSignal y deja al usuario sin push.
        await OneSignal.logout();
      }
    } catch (error) {
      log.error("Error al cancelar registro:", error);
    } finally {
      setPendingUser(null);
    }
  }, []);

  return {
    loading: loading || googleLoading,
    pendingUser,
    handleProviderAuth,
    finalizeExternalRegistration,
    cancelExternalRegistration,
    setPendingUser,
  };
}