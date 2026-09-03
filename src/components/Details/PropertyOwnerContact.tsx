import React from "react";
import {
  ActivityIndicator,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { COLORS } from "@/constants";
import { useModal } from "@/context/ModalContext";
import { Avatar } from "../shared";
import { OwnerRecommendations } from "./OwnerRecommendations";
import { propertyDetailStyles as styles } from "./propertyDetailStyles";

export interface PropertyOwnerContactProps {
  profile: any;
  propertyId: string;
  currentUserId?: string;
  sinDatos?: boolean;
  loadingEdit: boolean;
  onContactExternal?: (ownerId: string, propertyId: string) => void;
  onContactInternal: (profile: any) => void;
  onEditProperty: () => void;
  /** Ejecuta una navegación cerrando antes el <Modal> contenedor, si lo hay.
      Ver `navigateAway` en PropertyDetail. Sin él se navega directo. */
  onNavigateAway?: (go: () => void) => void;
}

export const PropertyOwnerContact: React.FC<PropertyOwnerContactProps> = ({
  profile,
  propertyId,
  currentUserId,
  sinDatos,
  loadingEdit,
  onContactExternal,
  onContactInternal,
  onEditProperty,
  onNavigateAway,
}) => {
  const { showModal } = useModal();
  const navigate = onNavigateAway ?? ((go: () => void) => go());

  if (sinDatos || !profile) return null;

  const isOwnProperty = currentUserId === profile.id;

  const handleContactOwner = () => {
    if (onContactExternal) {
      onContactExternal(profile.id, propertyId);
      return;
    }
    onContactInternal(profile);
  };

  const handleProfilePress = () => {
    if (!profile?.id) return;
    navigate(() =>
      router.push({
        pathname: "/(stack)/user/[id]",
        params: { id: profile.id },
      }),
    );
  };

  const handleCall = () => {
    const phone = `${profile.prefijo_celular || ""}${profile.celular || ""}`;
    if (phone && phone.trim().length > 0) {
      Linking.openURL(`tel:${phone.replace(/\s/g, "")}`);
      return;
    }
    showModal({
      title: "Sin número de contacto",
      message:
        "Este usuario no cuenta con un número registrado para llamadas directas.",
      confirmText: "OK",
    });
  };

  return (
    <>
      <TouchableOpacity
        style={styles.profileSection}
        onPress={handleProfilePress}
        activeOpacity={0.7}
      >
        <Avatar
          uri={profile.foto}
          name={profile.nombre}
          size={50}
          style={styles.profileFoto}
        />
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile.nombre}</Text>
          <Text style={styles.profileRole}>Agente Inmobiliario</Text>
          <OwnerRecommendations
            userId={profile.id}
            ocupacion={profile.ocupacion}
          />
        </View>

        {!isOwnProperty && (
          <TouchableOpacity
            style={styles.contactIconBtn}
            onPress={handleContactOwner}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={24}
              color={COLORS.primary}
            />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {isOwnProperty ? (
        <TouchableOpacity
          style={[styles.mainContactBtn, { backgroundColor: COLORS.info }]}
          onPress={onEditProperty}
        >
          {loadingEdit ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              <Ionicons
                name="pencil"
                size={20}
                color={COLORS.white}
                style={{ marginRight: 8 }}
              />
              <Text style={styles.mainContactBtnText}>Editar Propiedad</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.mainContactBtn} onPress={handleCall}>
          <Ionicons
            name="call"
            size={20}
            color={COLORS.white}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.mainContactBtnText}>Contactar ahora</Text>
        </TouchableOpacity>
      )}
    </>
  );
};
