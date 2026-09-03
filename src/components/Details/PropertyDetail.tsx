import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useApp } from "@/context/AppContext";
import { COLORS } from "@/constants";
import { Toilet, Building2 } from "lucide-react-native";

import { useViewTracking } from "@/hooks";
import usePropertyDetails from "@/hooks/usePropertyDetails";
import CommentsBottomSheet from "../modals/CommentsBottomSheet";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useToast } from "@/context/ToastContext";
import { MapDetails } from "./MapDetails";
import CreateProperty from "../CreateContent/CreateProperty";
import { useChatInitiator } from "@/hooks/messaging/useChatInitiator";
import { logger } from "@/utils/logger";
import { parseImages } from "@/utils/imageParser";
import { formatDateShort } from "@/utils/dateFormatter";
import { formatPropertyAge } from "@/utils/propertyAge";
import { router } from "expo-router";
import { CachedPropertyData } from "@/store/propertyCacheStore";

import { PropertyDetailImages } from "./PropertyDetailImages";
import { PropertyFinancialSection } from "./PropertyFinancialSection";
import { PropertyTypeDetails } from "./PropertyTypeDetails";
import { PropertyOwnerContact } from "./PropertyOwnerContact";
import { PropertyPrivateOwner } from "./PropertyPrivateOwner";
import { PropertyDetailShimmer } from "./PropertyDetailShimmer";
import { propertyDetailStyles as styles } from "./propertyDetailStyles";
import { getCamposVisibles } from "@/constants/propertyData";

const log = logger.scoped("PropertyDetail");

interface PropertyDetailProps {
  propertyId: string;
  onContact?: (ownerId: string, propertyId: string) => void;
  onRefresh?: () => void;
  sinDatos?: boolean;
  initialData?: CachedPropertyData | null;
  /** Cerrar la pantalla cuando se abre dentro de un <Modal> (Perfil, Matches):
      ahí `router.back()` no cierra el modal. Si no se pasa, cae a router.back(). */
  onClose?: () => void;
}


const PropertyDetail: React.FC<PropertyDetailProps> = ({
  propertyId,
  onContact,
  onRefresh,
  sinDatos,
  initialData,
  onClose,
}) => {
  const handleClose = onClose ?? (() => router.back());

  /**
   * Navegar a otra pantalla desde aquí. Cuando el detalle se abre dentro de un
   * <Modal> (Perfil, Matches), `router.push` empuja la ruta DETRÁS del modal:
   * la navegación ocurre pero no se ve nada y el botón parece muerto. Por eso
   * primero se cierra el modal y se navega cuando la transición terminó.
   * Como ruta normal (sin `onClose`) se navega directo.
   */
  const navigateAway = useCallback(
    (go: () => void) => {
      if (!onClose) {
        go();
        return;
      }
      onClose();
      setTimeout(go, 350);
    },
    [onClose],
  );
  const { user } = useAuth();
  const { currentUser } = useApp();
  const { propertyDetails, loading, refetch } = usePropertyDetails(
    propertyId || "",
    { initialData },
  );
  const [, setProperty] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [propertyIdModal, setPropertyIdModal] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [, setHasChanges] = useState(false);

  const { handleContact } = useChatInitiator();

  const [refreshing, setRefreshing] = useState(false);
  const { showToast } = useToast();

  const copyToClipboard = async (text: string) => {
    await Clipboard.setStringAsync(text);
    showToast("Código copiado al portapapeles", "success");
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await refetch();
      setHasChanges(true);
      if (onRefresh) onRefresh();
    } catch (error) {
      log.error("Error refreshing property detail:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const { trackInteraction } = useViewTracking({
    feedItemId: propertyDetails?.feed_items?.id,
    userId: user?.id,
    isVisible: true,
  });

  useEffect(() => {
    if (propertyDetails) {
      setProperty(propertyDetails);
    }
  }, [propertyDetails]);

  if (loading && !propertyDetails) {
    return (
      <PropertyDetailShimmer />
    );
  }

  if (!propertyDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text>No se encontró la propiedad</Text>
        <TouchableOpacity
          onPress={handleClose}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>Regresar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const images = parseImages(propertyDetails.fotos);
  const operations = propertyDetails.operaciones || [];
  const profile = propertyDetails.perfil;
  const amenities =
    propertyDetails.amenidades?.map((a: any) => a.amenidad.nombre) || [];
  const gravamenes = propertyDetails.gravamenes || [];
  const financiamientos =
    propertyDetails.financiamientos?.map((f: any) => f.tipo.nombre) || [];

  // Qué características aplican según el tipo/subtipo de la propiedad.
  // Defensa para datos ya guardados con valores espurios (p. ej. pisos=1 en ranchos).
  const campos = getCamposVisibles(
    propertyDetails.subtipo,
    propertyDetails.tipo?.toLowerCase(),
  );

  interface LocalStatItemProps {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string | number;
  }
  const StatItem = ({ icon, label, value }: LocalStatItemProps) => (
    <View style={styles.statItem}>
      <View style={styles.statIconContainer}>
        <Ionicons name={icon} size={16} color={COLORS.textSecondary} />
      </View>
      <View style={styles.statTextContainer}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[COLORS.primary]}
          />
        }
      >
        <PropertyDetailImages
          images={images}
          currentImageIndex={currentImageIndex}
          onImageIndexChange={setCurrentImageIndex}
          onBack={handleClose}
          feedItemId={propertyDetails.feed_items?.id ?? ""}
          feedItemLikes={propertyDetails.feed_items?.likes_count ?? 0}
          feedItemComments={propertyDetails.feed_items?.comentarios_count ?? 0}
          feedItemShares={propertyDetails.feed_items?.compartidos_count ?? 0}
          userId={user?.id}
          propertyId={propertyDetails.id}
          shareTitle={`Propiedad: ${propertyDetails.subtipo} en ${propertyDetails.municipio}`}
          shareDescription={propertyDetails.descripcion?.substring(0, 100)}
          shareCode={
            propertyDetails.codigo_propiedad || propertyDetails.code
          }
          onCommentClick={() => setShowComments(true)}
          onTrackInteraction={trackInteraction as (kind: string) => void}
        />

        <View style={styles.content}>
          {/* Header Principal */}
          <View style={styles.headerInfo}>
            <View style={styles.metaRowContent}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() =>
                  copyToClipboard(
                    propertyDetails.codigo_propiedad || propertyDetails.id,
                  )
                }
                style={styles.idContainer}
              >
                <Text style={styles.metaText}>
                  ID: {propertyDetails.codigo_propiedad || propertyDetails.id}
                </Text>
                <Ionicons
                  name="copy-outline"
                  size={14}
                  color={COLORS.textSecondary}
                  style={styles.copyIcon}
                />
              </TouchableOpacity>

              <Text style={styles.metaSeparator}>•</Text>

              <Text style={styles.metaText}>
                {propertyDetails.created_at
                  ? formatDateShort(propertyDetails.created_at)
                  : ""}
              </Text>
            </View>

            <View style={styles.tagRow}>
              <View style={styles.typeTag}>
                <Text style={styles.typeTagText}>
                  {propertyDetails.subtipo}
                </Text>
              </View>
              {campos.antiguedad && (
                <View
                  style={[styles.typeTag, { backgroundColor: COLORS.background }]}
                >
                  <Text
                    style={[styles.typeTagText, { color: COLORS.textSecondary }]}
                  >
                    {formatPropertyAge(propertyDetails.antiguedad)}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.title}>
              {propertyDetails.subtipo} en {propertyDetails.municipio || propertyDetails.ciudad || 'Sin ubicación'}
            </Text>

            <View style={styles.priceContainer}>
              {operations.map((op: any, idx: number) => (
                <View key={idx} style={styles.priceBadge}>
                  <Text style={styles.operationType}>
                    {op.tipo_operacion === "venta" || op.tipo_operacion=="Sale" ? "Venta" : "Renta"}
                  </Text>
                  <Text style={styles.price}>
                    {op.moneda || 'MXN'} {op.precio ? op.precio.toLocaleString("es-MX") : 'Consultar'}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.locationRow}>
              <Ionicons
                name="location"
                size={18}
                color={COLORS.textSecondary}
              />
              <Text style={styles.locationText}>
                {propertyDetails.calle
                  ? `${propertyDetails.calle} ${
                      propertyDetails.numero_exterior
                        ? propertyDetails.numero_exterior
                        : ""
                    }, `
                  : ""}
                {propertyDetails.colonia ? propertyDetails.colonia + ", " : ""}
                {propertyDetails.municipio || propertyDetails.ciudad || ''}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Características Principales */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Características</Text>
            <View style={styles.statsGrid}>
              {campos.recamaras && propertyDetails.habitaciones > 0 && (
                <StatItem
                  icon="bed-outline"
                  label="Recámaras"
                  value={propertyDetails.habitaciones}
                />
              )}
              {campos.banos && propertyDetails.banos > 0 && (
                <View style={styles.statItem}>
                  <View style={styles.statIconContainer}>
                    <Toilet size={16} color={COLORS.textSecondary} />
                  </View>
                  <View style={styles.statTextContainer}>
                    <Text style={styles.statValue}>{propertyDetails.banos}</Text>
                    <Text style={styles.statLabel}>Baños</Text>
                  </View>
                </View>
              )}
              {campos.mediosBanos && propertyDetails.medios_banos > 0 && (
                <View style={styles.statItem}>
                  <View style={styles.statIconContainer}>
                    <Toilet size={16} color={COLORS.textSecondary} />
                  </View>
                  <View style={styles.statTextContainer}>
                    <Text style={styles.statValue}>
                      {propertyDetails.medios_banos}
                    </Text>
                    <Text style={styles.statLabel}>Medios baños</Text>
                  </View>
                </View>
              )}
              {campos.estacionamientos &&
                propertyDetails.estacionamientos > 0 && (
                  <StatItem
                    icon="car-outline"
                    label="Estacionamientos"
                    value={propertyDetails.estacionamientos}
                  />
                )}
              {campos.niveles && propertyDetails.pisos > 0 && (
                <StatItem
                  icon="layers-outline"
                  label="Niveles"
                  value={propertyDetails.pisos}
                />
              )}
              {campos.m2Construccion &&
                propertyDetails.metros_cuadrados_construccion && (
                  <View style={styles.statItem}>
                    <View style={styles.statIconContainer}>
                      <Building2 size={16} color={COLORS.textSecondary} />
                    </View>
                    <View style={styles.statTextContainer}>
                      <Text style={styles.statValue}>
                        {`${Number(
                          propertyDetails.metros_cuadrados_construccion,
                        ).toLocaleString("es-MX")} m²`}
                      </Text>
                      <Text style={styles.statLabel}>Construcción</Text>
                    </View>
                  </View>
                )}
              {campos.m2Terreno &&
                propertyDetails.metros_cuadrados_terreno && (
                  <StatItem
                    icon="resize-outline"
                    label="Terreno"
                    value={`${Number(
                      propertyDetails.metros_cuadrados_terreno,
                    ).toLocaleString("es-MX")} m²`}
                  />
                )}
            </View>

            <View style={[styles.statsGrid, { marginTop: 12 }]}>
              {propertyDetails.amueblado &&
                propertyDetails.amueblado !== "No" && (
                  <View style={styles.chip}>
                    <Ionicons
                      name="briefcase-outline"
                      size={14}
                      color={COLORS.textSecondary}
                    />
                    <Text style={styles.chipText}>
                      Amueblado: {propertyDetails.amueblado}
                    </Text>
                  </View>
                )}
              {propertyDetails.pet_friendly === "Sí" && (
                <View style={styles.chip}>
                  <Ionicons
                    name="paw-outline"
                    size={14}
                    color={COLORS.textSecondary}
                  />
                  <Text style={styles.chipText}>Pet Friendly</Text>
                </View>
              )}
            </View>
          </View>

          {/* Características específicas por tipo (agrícola/comercial/industrial) */}
          <PropertyTypeDetails property={propertyDetails} />

          {/* Amenidades */}
          {amenities.length > 0 && propertyDetails.tipo?.toLowerCase() !== "industrial" && propertyDetails.tipo?.toLowerCase() !== "agricola" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Amenidades</Text>
              <View style={styles.amenitiesContainer}>
                {amenities.map((amenity: string, index: number) => (
                  <View
                    key={index}
                    style={[
                      styles.amenityChip,
                      { borderColor: COLORS.cardBorder },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text
                      style={[
                        styles.amenityText,
                        { color: COLORS.textSecondary },
                      ]}
                    >
                      {amenity}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.divider} />

          {/* Descripción */}
          {propertyDetails.descripcion && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Descripción</Text>
              <Text style={styles.descriptionText}>
                {propertyDetails.descripcion}
              </Text>
            </View>
          )}

          <View style={styles.divider} />

          {/* Financiamiento, Gravamen y Comisiones */}
          <PropertyFinancialSection
            operations={operations}
            gravamenes={gravamenes}
            financiamientos={financiamientos}
            sinDatos={sinDatos || currentUser?.role === "User"}
          />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ubicación</Text>
            {/* Margen negativo: el mapa se extiende un poco hacia los costados
                (el contenedor de detalle tiene paddingHorizontal: 20). */}
            <MapDetails
              property={propertyDetails}
              containerStyle={{ marginHorizontal: -12 }}
            />
          </View>

          {/* Datos del propietario — privados, solo visibles para el creador */}
          <PropertyPrivateOwner
            isCreator={!!user?.id && user.id === propertyDetails.created_by}
            nombre={propertyDetails.nombre_propietario}
            email={propertyDetails.email_propietario}
            telefono={propertyDetails.telefono_propietario}
          />

          {/* Perfil del Publicador y botón de acción */}
          <PropertyOwnerContact
            profile={profile}
            propertyId={propertyDetails.id}
            currentUserId={user?.id}
            sinDatos={sinDatos}
            loadingEdit={loadingEdit}
            onContactExternal={onContact}
            onNavigateAway={navigateAway}
            onContactInternal={(p) =>
              navigateAway(() =>
                handleContact(p.id, propertyDetails.id, {
                  id: p.id,
                  nombre: p.nombre,
                  foto: p.foto,
                  apellido_paterno: p.apellido_paterno || "",
                }),
              )
            }
            onEditProperty={() => {
              setLoadingEdit(true);
              setShowModal(true);
              setPropertyIdModal(propertyDetails.id);
            }}
          />
        </View>
      </ScrollView>

      <CommentsBottomSheet
        visible={showComments}
        onClose={() => setShowComments(false)}
        feedItemId={propertyDetails.feed_items?.id ?? ""}
        currentUserId={user?.id}
      />

      <Modal visible={showModal} onRequestClose={() => setShowModal(false)}>
        <CreateProperty
          onBack={(shouldRefresh) => {
            setShowModal(false);
            setLoadingEdit(false);
            if (shouldRefresh) handleRefresh();
          }}
          propertyId={propertyIdModal ?? undefined}
        />
      </Modal>
    </SafeAreaView>
  );
};

export default PropertyDetail;
