import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  View,
  StyleSheet,
  Dimensions,
  TouchableWithoutFeedback,
  Text,
  Platform,
} from "react-native";
import { MapDetails } from "../Details/MapDetails";
import { COLORS } from "@/constants";
import { Property } from "@/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export interface MapModalProps {
  visible: boolean;
  onClose: () => void;
  property: Property;
}

export const MapModal: React.FC<MapModalProps> = ({
  visible,
  onClose,
  property,
}) => {
  // Verificar si hay coordenadas válidas (pueden venir como string o number)
  const hasCoords =
    property.latitud &&
    property.longitud &&
    !isNaN(Number(property.latitud)) &&
    !isNaN(Number(property.longitud));

  const address = [
    property.colonia || property.location?.colony,
    property.location?.municipio || property.municipio,
    property.location?.city,
    property.location?.state,
  ]
    .filter(Boolean)
    .join(", ");

  // El MapView solo se monta cuando el modal ya quedó ABIERTO. Los hijos de un
  // <Modal> de RN se montan aunque visible=false, así que sin este guard cada
  // PropertyCard de la lista instanciaba un mapa de Apple en segundo plano.
  // Además, se espera un instante tras `visible` para montar el mapa sobre un
  // layout ya animado (evita que Apple Maps se inicialice a media animación).
  const [mapMounted, setMapMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      closeTimer.current = setTimeout(() => setMapMounted(true), 250);
    } else {
      setMapMounted(false);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [visible]);

  const handleClose = () => {
    // Desmontar el mapa ANTES de cerrar el modal: cerrar con el MapView aún
    // montado (Apple Maps en iOS) puede crashear. Un frame después se cierra.
    setMapMounted(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    requestAnimationFrame(onClose);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <View style={styles.header}>
                <View style={styles.titleContainer}>
                  <Ionicons name="map" size={20} color={COLORS.primary} />
                  <Text style={styles.title} numberOfLines={1}>
                    Ubicación de la Propiedad
                  </Text>
                </View>
                <Pressable onPress={handleClose} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </Pressable>
              </View>

              <View style={styles.mapWrapper}>
                {hasCoords && mapMounted ? (
                  <MapDetails
                    property={property}
                    containerStyle={{
                      height: "100%",
                      marginVertical: 0,
                      borderRadius: 0,
                      borderWidth: 0,
                    }}
                  />
                ) : hasCoords ? null : (
                  <View style={styles.noLocation}>
                    <View style={styles.noLocationIcon}>
                      <Ionicons
                        name="location-outline"
                        size={40}
                        color={COLORS.textTertiary}
                      />
                    </View>
                    <Text style={styles.noLocationTitle}>
                      Mapa No Disponible
                    </Text>
                    <Text style={styles.noLocationText}>
                      Esta propiedad no tiene coordenadas exactas registradas.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.footer}>
                <View style={styles.addressRow}>
                  <Ionicons name="navigate" size={16} color={COLORS.primary} />
                  <Text style={styles.addressText} numberOfLines={2}>
                    {address || "Dirección no disponible"}
                  </Text>
                </View>
                {hasCoords && (
                  <Text style={styles.coordText}>
                    Coords: {property.latitud}, {property.longitud}
                  </Text>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
  },
  modalContent: {
    width: SCREEN_WIDTH - 24,
    maxWidth: 560,
    backgroundColor: COLORS.white,
    borderRadius: 24,
    overflow: "hidden",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  closeButton: {
    padding: 4,
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
  },
  mapWrapper: {
    height: 380,
    width: "100%",
    backgroundColor: "#f8fafc",
  },
  footer: {
    padding: 20,
    backgroundColor: COLORS.white,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  addressText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: "500",
    flex: 1,
    lineHeight: 20,
  },
  coordText: {
    fontSize: 10,
    color: COLORS.textTertiary,
    marginTop: 8,
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  noLocation: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  noLocationIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  noLocationTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  noLocationText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
