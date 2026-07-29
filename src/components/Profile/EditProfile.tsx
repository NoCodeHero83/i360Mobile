import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useLocalModal } from "@/hooks/useLocalModal";
import { useToast } from "@/context/ToastContext";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabase";
import { COLORS } from "../../constants/colors";
import { AppInput } from "../../design-system/components/AppInput";
import { perfiles } from "../../types";
import * as ImagePicker from "expo-image-picker";
import { decode } from "base64-arraybuffer";
import { SelectionModal } from "../modals";
import { ESTADOS_MEXICO } from "../../constants/estadosMexico";
import { ScreenWrapper } from "../../screens/ScreenWrapper";
import { logger } from "@/utils/logger";
import { collapseSpaces } from "@/utils/stringNormalizer";

const log = logger.scoped("EditProfile");

interface EditProfileProps {
  onBack: () => void;
  onProfileUpdate?: () => void;
}

const EditProfile: React.FC<EditProfileProps> = ({
  onBack,
  onProfileUpdate,
}) => {
  const { user, profile: authProfile, refreshProfile } = useAuth();
  const { showModal, modalElement } = useLocalModal();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [, setUploading] = useState(false);

  const [formData, setFormData] = useState<Partial<perfiles>>({});
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showEstadoModal, setShowEstadoModal] = useState(false);
  useEffect(() => {
    if (authProfile) {
      setFormData({ ...authProfile });
      setImageUri(authProfile.foto || null);
    }
  }, [authProfile]);

  const handleInputChange = (field: keyof perfiles, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImagePick = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        showModal({ title: "Permiso denegado", message: "Se requiere acceso a la galería para cambiar la foto.", confirmText: "OK" });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      log.error("Error picking image:", error);
      showToast("No se pudo seleccionar la imagen", "error");
    }
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      if (!uri || uri.startsWith("http")) return uri; // Already a URL

      const fileName = `avatar_${user?.id}_${Date.now()}.jpg`;
      const filePath = `avatars/${fileName}`;

      let fileBody: string | Blob | ArrayBuffer;

      if (Platform.OS === "web") {
        const response = await fetch(uri);
        fileBody = await response.blob();
      } else {
        const { readAsStringAsync } = require("expo-file-system/legacy");
        const base64 = await readAsStringAsync(uri, { encoding: "base64" });
        fileBody = decode(base64);
      }

      const { error: uploadError } = await supabase.storage
        .from("feed-images") // Changed to known existing bucket
        .upload(filePath, fileBody, {
          contentType: "image/jpeg",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("feed-images")
        .getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      log.error("Error uploading image:", error);
      return null;
    }
  };

  const handleSave = async () => {
    if (!user) return;

    // Validation
    if (!formData.nombre?.trim() || !formData.apellido_paterno?.trim()) {
      showModal({ title: "Campos requeridos", message: "Nombre y Apellido Paterno son obligatorios.", confirmText: "OK" });
      return;
    }

    try {
      setLoading(true);
      setUploading(true);

      let photoUrl = authProfile?.foto;

      if (imageUri && imageUri !== authProfile?.foto) {
        const uploadedUrl = await uploadImage(imageUri);
        if (uploadedUrl) {
          photoUrl = uploadedUrl;
        }
      }

      // Preparar updates limpiando campos vacíos a null para evitar errores de constraints
      const cleanValue = (val: string | undefined) =>
        val && val.trim() !== "" ? val.trim() : null;

      const updates: any = {
        ...formData,
        foto: photoUrl || "",
        // Nombres sin espacios dobles/sobrantes: se guardan limpios para que la
        // búsqueda por apellido parcial y el display no se rompan.
        nombre: collapseSpaces(formData.nombre),
        apellido_paterno: collapseSpaces(formData.apellido_paterno),
        nombre_completo: collapseSpaces(
          `${formData.nombre} ${formData.apellido_paterno} ${formData.apellido_materno || ""}`,
        ),
        modalidad: cleanValue(formData.modalidad),
        sitio_web: cleanValue(formData.sitio_web),
        nombre_inmobiliaria: cleanValue(formData.nombre_inmobiliaria),
        ocupacion: cleanValue(formData.ocupacion),
        biografia: cleanValue(formData.biografia),
        apellido_materno: collapseSpaces(formData.apellido_materno) || null,
        estado: cleanValue(formData.estado),
      };

      const { data: updatedData, error } = await supabase
        .from("perfiles")
        .update(updates)
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;

      await refreshProfile(updatedData); // Optimización: pasar datos directamente

      showToast("Perfil actualizado correctamente", "success");
      if (onProfileUpdate) onProfileUpdate();
      onBack();
    } catch (error: any) {
      log.error("Error updating profile:", error);
      showToast(error.message || "No se pudo actualizar el perfil", "error");
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <ScreenWrapper withHeader={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Editar Perfil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={loading}
            style={styles.saveButton}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.primary} />
            ) : (
              <Text style={styles.saveButtonText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Photo Section */}
          <View style={styles.photoContainer}>
            <TouchableOpacity
              onPress={handleImagePick}
              style={styles.avatarWrapper}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitials}>
                    {formData.nombre?.charAt(0) ||
                      user?.email?.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.cameraIcon}>
                <Ionicons name="camera" size={20} color={COLORS.white} />
              </View>
            </TouchableOpacity>
            <Text style={styles.photoHint}>Toca para cambiar la foto</Text>
          </View>

          {/* Personal Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Información Personal</Text>

            <AppInput
              label="Nombre *"
              value={formData.nombre}
              onChangeText={(t) => handleInputChange("nombre", t)}
              placeholder="Tu nombre"
              maxLength={50}
            />

            <AppInput
              label="Apellido Paterno *"
              value={formData.apellido_paterno}
              onChangeText={(t) => handleInputChange("apellido_paterno", t)}
              placeholder="Primer apellido"
              maxLength={50}
            />

            <AppInput
              label="Apellido Materno"
              value={formData.apellido_materno}
              onChangeText={(t) => handleInputChange("apellido_materno", t)}
              placeholder="Segundo apellido"
              maxLength={50}
            />

            <AppInput
              label="Biografía"
              value={formData.biografia}
              onChangeText={(t) => handleInputChange("biografia", t)}
              placeholder="Cuéntanos un poco sobre ti..."
              multiline
              numberOfLines={4}
              inputStyle={{ height: 100 }}
              maxLength={200}
              showCounter
            />
          </View>

          {/* Contact Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Contacto</Text>

            <AppInput
              label="Teléfono Celular"
              value={formData.celular}
              onChangeText={(t) => handleInputChange("celular", t)}
              placeholder="1234567890"
              keyboardType="phone-pad"
              leftIcon={
                <Text style={{ color: COLORS.textSecondary }}>
                  {formData.prefijo_celular}
                </Text>
              }
            />

            <AppInput
              label="Sitio Web"
              value={formData.sitio_web}
              onChangeText={(t) => handleInputChange("sitio_web", t)}
              placeholder="https://tu-sitio.com"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Location */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ubicación</Text>
            <TouchableOpacity
              style={styles.locationSelector}
              onPress={() => setShowEstadoModal(true)}
            >
              <View style={styles.locationSelectorContent}>
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={COLORS.primary}
                />
                <Text
                  style={[
                    styles.locationText,
                    !formData.estado && styles.locationPlaceholder,
                  ]}
                >
                  {formData.estado || "Selecciona tu estado"}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={COLORS.textTertiary}
              />
            </TouchableOpacity>

            <SelectionModal
              visible={showEstadoModal}
              onClose={() => setShowEstadoModal(false)}
              onSelect={(val) => handleInputChange("estado", val)}
              title="Selecciona un Estado"
              options={[...ESTADOS_MEXICO]}
              currentValue={formData.estado}
              searchable
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {modalElement}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    backgroundColor: COLORS.white,
    // SafeArea for top could be handled by parent or SafeAreaView
    paddingTop: Platform.OS === "ios" ? 10 : 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: COLORS.textPrimary,
  },
  saveButton: {
    padding: 8,
  },
  saveButtonText: {
    color: COLORS.primary,
    fontWeight: "600",
    fontSize: 16,
  },
  content: {
    padding: 20,
    paddingBottom: 50,
  },
  photoContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.background,
  },
  avatarPlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  avatarInitials: {
    fontSize: 36,
    fontWeight: "bold",
    color: COLORS.textSecondary,
  },
  cameraIcon: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  photoHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  locationSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    padding: 14,
  },
  locationSelectorContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationText: {
    fontSize: 15,
    color: COLORS.textPrimary,
    marginLeft: 12,
  },
  locationPlaceholder: {
    color: COLORS.textTertiary,
  },
});

export default EditProfile;
