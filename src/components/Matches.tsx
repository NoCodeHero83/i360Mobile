import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { FeedItem, User } from "../types";

import { LeadPropertiesModal } from "./LeadPropertiesModal";
import { AppHeader } from "./AppHeader";
import { COLORS, FALLBACKS } from "../constants";
import { ScreenWrapper } from "../screens/ScreenWrapper";

export type MatchType = "coincidencia" | "similar";

interface MatchData {
  id: string;
  propiedad_id: string;
  busqueda_id: string;
  usuario_id: string;
  tipo_match: MatchType;
  estado: string;
  created_at: string;
  propiedad: any;
  busqueda: any;
}

interface LeadGroup {
  leadId: string;
  leadName: string;
  leadPhone: string;
  busquedaId: string;
  matches: MatchData[];
  properties: FeedItem[];
  latestMatchDate: string;
  minPrice: number;
  maxPrice: number;
  currency: string;
  matchCount: number;
  similarCount: number;
  leadEmail?: string;
  coincidences: FeedItem[];
  similars: FeedItem[];
  /** Objeto completo de busquedas_guardadas para el flujo de edición */
  busquedaObject?: any;
  searchCriteria: {
    tipo_propiedad?: string;
    subtipo?: string;
    ciudad?: string;
    municipio?: string;
    colonia?: string;
    tipo_operacion?: string;
    precio_min?: number;
    precio_max?: number;
    moneda?: string;
    habitaciones?: string;
    banos?: string;
    estacionamientos?: string;
    metros_terreno?: number;
    metros_construccion?: number;
    codigo_propiedad?: string;
  };
}

import { usePropertyFeedItems } from "../hooks/usePropertyFeedItems";
import { LeadMatchCard } from "./LeadMatchCard";
import { SearchFiltersModal } from "./map/SearchFiltersModal";
import { usePropertyFiltersStore } from "../store/propertyFiltersStore";
import { useMatchesStore } from "../store/matchesStore";
import { logger } from "@/utils/logger";
import { feedService } from "@/services/feedService";
import { profileService } from "@/services/profileService";

const log = logger.scoped("Matches");

const Matches: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { setFiltersFromSearch } = usePropertyFiltersStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [savedSearches, setSavedSearches] = useState<any[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Estado para edición de búsqueda
  const [editingBusqueda, setEditingBusqueda] = useState<any | null>(null);
  const [showEditFilters, setShowEditFilters] = useState(false);

  // Hook para obtener FeedItems (likes/comments)
  const propertyIds = React.useMemo(
    () => matches.map((m) => m.propiedad_id),
    [matches],
  );
  const { data: feedItemsRecord = {} } = usePropertyFeedItems(propertyIds);

  const fetchMatches = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // PASO 1: Obtener TODAS las búsquedas guardadas activas del usuario
      const { data: searchesData, error: searchesError } = await supabase
        .from("busquedas_guardadas")
        .select(
          `
        *,
        lead:leads(*)
      `,
        )
        .eq("usuario_id", user.id)
        .eq("activa", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (searchesError) throw searchesError;

      setSavedSearches(searchesData || []);

      // PASO 2: Obtener matches
      let { data, error } = await supabase
        .from("matches")
        .select(
          `
        *,
        propiedad:propiedades (
          *,
          operaciones:operaciones_propiedad(*)
        ),
        busqueda:busquedas_guardadas(
          *,
          lead:leads(*)
        )
      `,
        )
        .eq("usuario_id", user.id)
        .eq("activo", true)
        .neq("estado", "descartado")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Si tenemos datos, obtener perfiles por separado
      if (data && data.length > 0) {
        const createdByIds = data
          .map((m) => m.propiedad?.created_by)
          .filter((id) => id);

        if (createdByIds.length > 0) {
          const [
            { data: perfiles, error: perfilesError },
            statsRows,
            previewsByUserId,
          ] = await Promise.all([
            supabase.from("perfiles").select("*").in("id", createdByIds),
            feedService.getReviewStats(createdByIds, user.id),
            profileService.getRecommendationPreviewsForUsers(createdByIds, user.id),
          ]);

          if (!perfilesError && perfiles) {
            const statsByUserId = new Map(
              statsRows.map((stats) => [stats.profesional_id, stats]),
            );

            data = data.map((match) => {
              if (match.propiedad && match.propiedad.created_by) {
                const perfil = perfiles.find(
                  (p) => p.id === match.propiedad.created_by,
                );
                const stats = statsByUserId.get(match.propiedad.created_by);
                return {
                  ...match,
                  propiedad: {
                    ...match.propiedad,
                    perfil: perfil
                      ? {
                          ...perfil,
                          rating:
                            typeof stats?.calificacion_promedio === "number"
                              ? stats.calificacion_promedio
                              : 0,
                          totalRatings:
                            typeof stats?.total_resenas === "number"
                              ? stats.total_resenas
                              : 0,
                          positiveRecommendations:
                            typeof stats?.total_recomiendan === "number"
                              ? stats.total_recomiendan
                              : 0,
                          negativeRecommendations:
                            typeof stats?.total_no_recomiendan === "number"
                              ? stats.total_no_recomiendan
                              : 0,
                          recommendedByPreview:
                            previewsByUserId[match.propiedad.created_by] || [],
                        }
                      : null,
                  },
                };
              }
              return match;
            });
          }
        }
      }

      setMatches(data || []);
    } catch (error) {
      log.error("Error fetching matches:", error);
      showToast("No se pudieron cargar los matches", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [user]);

  // Al abrir la pantalla, marcar los matches sin ver como vistos: limpia el
  // badge del header (useMatchesStore) espejo del contador useUnseenMatchesCount.
  useEffect(() => {
    if (!user) return;
    // Vacía el badge al instante; el UPDATE persiste el visto_en en segundo plano.
    useMatchesStore.getState().setUnseenCount(0);
    supabase
      .from("matches")
      .update({ visto_en: new Date().toISOString() })
      .eq("usuario_id", user.id)
      .is("visto_en", null)
      .then(({ error }) => {
        if (error) log.error("No se pudieron marcar los matches como vistos:", error);
      });
  }, [user]);

  const handleDeleteSearch = async (busquedaId: string) => {
    try {
      // Soft delete de la búsqueda guardada
      const { error } = await supabase
        .from("busquedas_guardadas")
        .update({ deleted_at: new Date().toISOString(), activa: false })
        .eq("id", busquedaId);

      if (error) throw error;

      // Desactivar matches asociados
      await supabase
        .from("matches")
        .update({ activo: false })
        .eq("busqueda_id", busquedaId);

      showToast("Búsqueda eliminada correctamente", "success");
      fetchMatches(); // Recargar datos
    } catch (error) {
      log.error("Error deleting search:", error);
      showToast("No se pudo eliminar la búsqueda", "error");
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchMatches();
  };

  const handleEditSearch = useCallback((busqueda: any) => {
    setFiltersFromSearch(busqueda);
    setEditingBusqueda(busqueda);
    setShowEditFilters(true);
  }, [setFiltersFromSearch]);

  const handleUpdateDone = useCallback(() => {
    setShowEditFilters(false);
    setEditingBusqueda(null);
    fetchMatches();
  }, []);

  // Agrupar matches por lead e incluir búsquedas sin matches
  const groupMatchesByLead = (
    matchesList: MatchData[],
    allSearches: any[],
    feedItems: Record<string, any> = {},
  ): LeadGroup[] => {
    const grouped = new Map<string, LeadGroup>();

    // 1. Inicializar grupos con todas las búsquedas que tienen un lead
    allSearches.forEach((search) => {
      const lead = search.lead;
      if (lead && lead.id) {
        grouped.set(lead.id, {
          leadId: lead.id,
          leadName: lead.nombre || "Lead sin nombre",
          leadPhone: lead.telefono || "Sin teléfono",
          leadEmail: lead.correo || lead.email,
          busquedaId: search.id,
          busquedaObject: search,
          matches: [],
          properties: [],
          latestMatchDate: search.created_at, // Usar fecha de creación de búsqueda por defecto
          minPrice: search.precio_min || 0,
          maxPrice: search.precio_max || 0,
          currency: search.moneda || search.monera || "MXN",
          matchCount: 0,
          similarCount: 0,
          coincidences: [],
          similars: [],
          searchCriteria: {
            tipo_propiedad: search.tipo_propiedad,
            subtipo: search.subtipo,
            ciudad: search.ciudad,
            municipio: search.municipio,
            colonia: search.colonia,
            tipo_operacion: search.tipo_operacion,
            precio_min: search.precio_min,
            precio_max: search.precio_max,
            moneda: search.moneda || search.monera,
            habitaciones: search.habitaciones,
            banos: search.banos,
            estacionamientos: search.estacionamientos,
            metros_terreno: search.metros_terreno,
            metros_construccion: search.metros_construccion,
            codigo_propiedad: search.codigo_propiedad,
          },
        });
      }
    });

    // 2. Llenar con matches existentes
    matchesList.forEach((match) => {
      const lead = match.busqueda?.lead;
      const leadId = lead?.id;

      if (!leadId) return;

      // Si el lead no estaba en las búsquedas (raro pero posible), lo agregamos
      if (!grouped.has(leadId)) {
        grouped.set(leadId, {
          leadId,
          leadName: lead.nombre || "Lead sin nombre",
          leadPhone: lead.telefono || "Sin teléfono",
          leadEmail: lead.correo || lead.email,
          busquedaId: match.busqueda_id,
          matches: [],
          properties: [],
          latestMatchDate: match.created_at,
          minPrice: match.busqueda?.precio_min || 0,
          maxPrice: match.busqueda?.precio_max || 0,
          currency: match.busqueda?.moneda || match.busqueda?.monera || "MXN",
          matchCount: 0,
          similarCount: 0,
          coincidences: [],
          similars: [],
          searchCriteria: {
            tipo_propiedad: match.busqueda?.tipo_propiedad,
            subtipo: match.busqueda?.subtipo,
            ciudad: match.busqueda?.ciudad,
            municipio: match.busqueda?.municipio,
            colonia: match.busqueda?.colonia,
            tipo_operacion: match.busqueda?.tipo_operacion,
            precio_min: match.busqueda?.precio_min,
            precio_max: match.busqueda?.precio_max,
            moneda: match.busqueda?.moneda || match.busqueda?.monera,
            habitaciones: match.busqueda?.habitaciones,
            banos: match.busqueda?.banos,
            estacionamientos: match.busqueda?.estacionamientos,
            metros_terreno: match.busqueda?.metros_terreno,
            metros_construccion: match.busqueda?.metros_construccion,
            codigo_propiedad: match.busqueda?.codigo_propiedad,
          },
        });
      }

      const group = grouped.get(leadId)!;
      group.matches.push(match);

      if (match.tipo_match === "coincidencia") {
        group.matchCount++;
      } else {
        group.similarCount++;
      }

      // Actualizar fecha más reciente si el match es más nuevo
      if (new Date(match.created_at) > new Date(group.latestMatchDate)) {
        group.latestMatchDate = match.created_at;
      }

      // Convertir propiedad a FeedItem
      const prop = match.propiedad;
      if (!prop) return; // Seguridad extra

      const operacion = prop.operaciones?.[0];

      let perfil = prop.perfil;
      if (Array.isArray(perfil)) {
        perfil = perfil[0];
      }

      // Parse images
      let propertyImages: string[] = [];
      const rawFotos = prop.fotos;

      if (Array.isArray(rawFotos)) {
        propertyImages = rawFotos;
      } else if (
        typeof rawFotos === "string" &&
        rawFotos.trim().startsWith("[")
      ) {
        try {
          propertyImages = JSON.parse(rawFotos);
        } catch (e) {
          propertyImages = rawFotos.split(",").map((s) => s.trim());
        }
      } else if (typeof rawFotos === "string") {
        if (rawFotos.includes(",")) {
          propertyImages = rawFotos.split(",").map((s) => s.trim());
        } else {
          propertyImages = [rawFotos];
        }
      }

      if (propertyImages.length === 0) {
        propertyImages = [FALLBACKS.PROPERTY_IMAGE_URL];
      }

      // Look up feed item data
      const feedData = feedItems[prop.id];

      const feedItem: FeedItem = {
        id: feedData?.id || prop.id, // Use real FeedItem ID if available
        type: "property",
        user: {
          id: perfil?.id || prop.created_by,
          nombre: perfil?.nombre || "Vendedor",
          name: perfil?.nombre || "Vendedor",
          avatar:
            perfil?.foto ||
            `https://ui-avatars.com/api/?name=V&background=${COLORS.primary.substring(
              1,
            )}&color=fff`,
          isFollowing: false,
          role: (perfil?.rol === "agente" ? "Agent" : "User") as any,
          ocupacion: perfil?.ocupacion || undefined,
          rating: perfil?.rating || 0,
          totalRatings: perfil?.totalRatings || 0,
          positiveRecommendations: perfil?.positiveRecommendations || 0,
          negativeRecommendations: perfil?.negativeRecommendations || 0,
          recommendedByPreview: perfil?.recommendedByPreview || [],
        } as User,
        content: prop.descripcion || "",
        images: propertyImages,
        likes: feedData?.likes_count || 0,
        comments: feedData?.comentarios_count || 0,
        timestamp: new Date(match.created_at).toLocaleDateString(),
        matchedAt: match.created_at,
        propertyDetails: {
          id: prop.id,
          title: `${prop.subtipo} en ${prop.municipio}`,
          description: prop.descripcion,
          price: operacion?.precio || 0,
          currency: operacion?.moneda || "MXN",
          location: {
            address: `${prop.calle || ""} ${prop.numero_exterior || ""}`.trim(),
            city: prop.ciudad,
            state: "",
            country: "México",
            colony: prop.colonia,
            municipio: prop.municipio,
          },
          // Coordenadas: sin ellas el MapModal mostraba "Mapa No Disponible".
          latitud: prop.latitud != null ? Number(prop.latitud) : undefined,
          longitud: prop.longitud != null ? Number(prop.longitud) : undefined,
          coordinates:
            prop.latitud != null && prop.longitud != null
              ? { lat: Number(prop.latitud), lng: Number(prop.longitud) }
              : undefined,
          images: propertyImages,
          features: {
            beds: prop.habitaciones,
            baths: prop.banos,
            halfBaths: prop.medios_banos || 0,
            parking: prop.estacionamientos,
            constructionSqft: prop.metros_cuadrados_construccion,
            landSqft: prop.metros_cuadrados_terreno,
          },
          type: prop.tipo,
          subtype: prop.subtipo,
          operation: operacion?.tipo_operacion === "venta" ? "Sale" : "Rent",
          status: "Publicada",
          amenities: [],
          codigo_propiedad: prop.codigo_propiedad,
        },
      };

      group.properties.push(feedItem);

      if (match.tipo_match === "coincidencia") {
        group.coincidences.push(feedItem);
      } else {
        group.similars.push(feedItem);
      }
    });

    // Convertir a array y ordenar por fecha más reciente
    // Convertir a array y ordenar
    const result = Array.from(grouped.values()).sort((a, b) => {
      const aHasMatches = a.matches.length > 0;
      const bHasMatches = b.matches.length > 0;

      // 1. Primero: Los que tienen matches
      if (aHasMatches && !bHasMatches) return -1;
      if (!aHasMatches && bHasMatches) return 1;

      // 2. Dentro de cada grupo, ordenar por fecha más reciente
      const aDate = new Date(a.latestMatchDate).getTime();
      const bDate = new Date(b.latestMatchDate).getTime();

      return bDate - aDate; // Más reciente primero
    });

    return result;
  };

  // const filteredMatches = matches.filter((m) => m.tipo_match === activeTab); // No filtering
  // const filteredMatches = matches.filter((m) => m.tipo_match === activeTab); // No filtering
  const leadGroups = groupMatchesByLead(
    matches,
    savedSearches,
    feedItemsRecord,
  ).filter((lead) =>
    lead.leadName.toLowerCase().includes(searchQuery.toLowerCase()),
  ); // Pass all matches

  const selectedLead =
    leadGroups.find((l) => l.leadId === selectedLeadId) || null;

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: LeadGroup }) => (
    <LeadMatchCard
      leadName={item.leadName}
      leadPhone={item.leadPhone}
      minPrice={item.minPrice}
      maxPrice={item.maxPrice}
      currency={item.currency}
      matchCount={item.matchCount}
      similarCount={item.similarCount}
      latestMatchDate={item.latestMatchDate}
      onPress={() => setSelectedLeadId(item.leadId)}
    />
  );

  return (
    <ScreenWrapper withHeader={false} style={styles.container}>
      {/* Header */}
      <AppHeader
        title="Matches"
        showBackButton
        onBack={() => router.back()}
      />

      {/* Tabs Removed */}

      {/* Buscador */}
      <View style={styles.searchContainer}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={20} color={COLORS.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar prospecto..."
            placeholderTextColor={COLORS.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={COLORS.textTertiary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <FlatList
        data={leadGroups}
        keyExtractor={(item) => item.leadId}
        renderItem={renderItem}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator
              size="large"
              color={COLORS.primary}
              style={{ marginTop: 50 }}
            />
          ) : (
            <View style={styles.emptyState}>
              <Ionicons
                name="search-outline"
                size={64}
                color={COLORS.cardBorder}
              />
              <Text style={styles.emptyText}>
                No hay matches en esta categoría
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          leadGroups.length > 0 ? (
            <View style={styles.banner}>
              <View style={styles.bannerIconCircle}>
                <Ionicons name="notifications" size={20} color={COLORS.white} />
              </View>
              <Text style={styles.bannerText}>
                <Text style={styles.bannerTextStrong}>
                  ILYROX busca propiedades 24/7
                </Text>
                {" para tus clientes y las clasifica en matches exactos o "}
                {"similares. Contacta rápido a tus clientes antes que otros "}
                {"asesores."}
              </Text>
              <Ionicons
                name="people-outline"
                size={26}
                color={COLORS.primary}
                style={styles.bannerPeopleIcon}
              />
            </View>
          ) : null
        }
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
      />

      {/* Modal de todas las propiedades del lead */}
      {selectedLead && (
        <LeadPropertiesModal
          visible={!!selectedLead}
          onClose={() => setSelectedLeadId(null)}
          leadName={selectedLead.leadName}
          leadPhone={selectedLead.leadPhone}
          leadEmail={selectedLead.leadEmail ?? ""}
          busquedaId={selectedLead.busquedaId}
          busqueda={selectedLead.busquedaObject}
          coincidences={selectedLead.coincidences}
          similars={selectedLead.similars}
          searchCriteria={selectedLead.searchCriteria}
          onPropertyClick={(propertyId) => {
            // El detalle es una pantalla de stack. Si la abrimos con el modal
            // del lead presentado, en iOS queda por detrás (no abre nada).
            // Cerramos el modal y navegamos en el siguiente tick.
            setSelectedLeadId(null);
            setTimeout(
              () =>
                router.push({
                  pathname: "/property/[id]",
                  params: { id: propertyId },
                }),
              350,
            );
          }}
          onUserClick={(user) => {
            setSelectedLeadId(null);
            setTimeout(
              () =>
                router.push({ pathname: "/user/[id]", params: { id: user.id } }),
              350,
            );
          }}
          onDeleteSearch={handleDeleteSearch}
          currentUserId={user?.id}
          onEditSearch={
            selectedLead.busquedaObject
              ? () => {
                  // SearchFiltersModal es otro <Modal> nativo. En iOS no se
                  // puede presentar sobre el del lead (ambos desde la raíz):
                  // falla en silencio. Cerramos primero el del lead y en un
                  // tick posterior abrimos el de edición.
                  const busqueda = selectedLead.busquedaObject;
                  setSelectedLeadId(null);
                  setTimeout(() => handleEditSearch(busqueda), 350);
                }
              : undefined
          }
        />
      )}

      {/* Modal de filtros en modo edición */}
      <SearchFiltersModal
        visible={showEditFilters}
        onClose={() => {
          setShowEditFilters(false);
          setEditingBusqueda(null);
        }}
        editBusquedaId={editingBusqueda?.id}
        onUpdateSearch={handleUpdateDone}
        filteredPropertiesCount={0}
        userId={user?.id}
      />

    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: COLORS.cardBorder,
  },
  activeTab: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.white,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: COLORS.white,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background, // o un color gris claro
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.successLight,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  bannerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.textSecondary,
  },
  bannerTextStrong: {
    color: COLORS.primary,
    fontWeight: "700",
  },
  bannerPeopleIcon: {
    marginLeft: 12,
  },
});

export default Matches;