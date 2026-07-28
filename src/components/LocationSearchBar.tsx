import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../constants/colors";
import {
  useLocationSearchStore,
  LocationSuggestionWithCount,
} from "../store/locationSearchStore";
// getUniqueLocations fue removida en la migración a Google Places API
// Las sugerencias precargadas ahora se omiten (el usuario busca por texto)

interface PropertyCodeSuggestion {
  type: "property_code";
  name: string;
  propertyId: string;
  subtipo: string;
  municipio: string;
  fotos?: string[];
}

type SearchSuggestion = LocationSuggestionWithCount | PropertyCodeSuggestion;
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { Image } from "expo-image";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import SearchOverlay from "./search/SearchOverlay";

interface LocationSearchBarProps {
  onLocationSelect: (location: LocationSuggestionWithCount | null) => void;
  onSearchingChange?: (val: boolean) => void;
  isHeaderVisible?: boolean;
  containerStyle?: any;
  topOffset?: number;
  onOpenMap?: () => void;
  showMapButton?: boolean;
}

export const LocationSearchBar: React.FC<LocationSearchBarProps> = ({
  onLocationSelect,
  onSearchingChange,
  isHeaderVisible = true,
  containerStyle,
  topOffset = 75,
  onOpenMap,
  showMapButton = true,
}) => {
  const [query, setQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [propertySuggestions, setPropertySuggestions] = useState<PropertyCodeSuggestion[]>([]);
  const [preloadedSuggestions] = useState<LocationSuggestionWithCount[]>([]);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const { profile } = useAuth();
  const { selectedLocation } = useApp();

  const router = useRouter();
  const { suggestions, isLoading, searchLocations } =
    useLocationSearchStore();

  // Buscar ubicaciones con debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      searchLocations(query, undefined, { estado: profile?.estado });
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query, searchLocations, profile?.estado]);

  // Buscar propiedad por código
  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setPropertySuggestions([]);
      return;
    }

    const fetchPropertyByCode = async () => {
      const { data, error } = await supabase
        .from("propiedades")
        .select("id, codigo_propiedad, subtipo, municipio, fotos")
        .ilike("codigo_propiedad", `%${query}%`)
        .limit(3);

      if (!error && data) {
        setPropertySuggestions(
          data.map((p) => ({
            type: "property_code",
            name: p.codigo_propiedad,
            propertyId: p.id,
            subtipo: p.subtipo,
            municipio: p.municipio,
            fotos: p.fotos,
          })),
        );
      } else {
        setPropertySuggestions([]);
      }
    };

    const timer = setTimeout(fetchPropertyByCode, 400);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    onSearchingChange?.(showSuggestions);
  }, [showSuggestions, onSearchingChange]);

  // Sugerencias precargadas: ya no se cargan desde Supabase Geo.
  // Con Google Places API la búsqueda es siempre por texto del usuario.
  useEffect(() => {
    // No-op: preloadedSuggestions permanece vacío en la nueva arquitectura
  }, [showSuggestions, query]);

  // Cerrar sugerencias si el header desaparece
  useEffect(() => {
    if (!isHeaderVisible) {
      setShowSuggestions(false);
    }
  }, [isHeaderVisible]);

  const handleSelectLocation = (location: SearchSuggestion) => {
    if (location.type === "property_code") {
      setShowSuggestions(false);
      router.push({
        pathname: "/(stack)/property/[id]",
        params: { id: location.propertyId },
      });
      return;
    }
    setQuery(location.name);
    setShowSuggestions(false);
    onLocationSelect(location as LocationSuggestionWithCount);
  };

  const getIconName = (type: string) => {
    switch (type) {
      case "estado":
        return "map-outline";
      case "municipio":
        return "business-outline";
      case "colonia":
        return "location-outline";
      case "property_code":
        return "home-outline";
      default:
        return "location-outline";
    }
  };

  return (
    <>
      <SearchOverlay
        visible={showSearchOverlay}
        onClose={() => setShowSearchOverlay(false)}
        initialQuery={query}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity
          style={[styles.searchButton, containerStyle]}
          onPress={() => setShowSearchOverlay(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="search-outline" size={18} color={COLORS.textTertiary} />
          <Text style={styles.searchButtonText}>Busca por zonas para encontrar propiedades</Text>
        </TouchableOpacity>

        {showMapButton && !showSuggestions && selectedLocation && (
          <TouchableOpacity
            onPress={onOpenMap}
            style={styles.mapSmallButton}
            activeOpacity={0.7}
          >
            <Ionicons name="map-outline" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {showSuggestions && (query.trim() ? (suggestions.length > 0 || propertySuggestions.length > 0) : preloadedSuggestions.length > 0) && (
        <View
          pointerEvents="auto"
          style={[styles.suggestionsContainer, { top: topOffset }]}
        >
          <FlatList<SearchSuggestion>
            data={query.trim() ? [...propertySuggestions, ...suggestions] : preloadedSuggestions}
            keyExtractor={(item, index) =>
              `${item.type}-${item.name}-${(item as LocationSuggestionWithCount).estado_nombre ?? ""}-${index}`
            }
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled={true}
            style={{ flexGrow: 0 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestionItem}
                onPress={() => handleSelectLocation(item)}
                activeOpacity={0.7}
              >
                <View style={styles.suggestionIconContainer}>
                  <Ionicons
                    name={getIconName(item.type)}
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </View>
                <View style={[styles.suggestionTextContainer, { flex: 1 }]}>
                  {item.type === "property_code" ? (
                    <>
                      <Text style={styles.suggestionName}>{item.name}</Text>
                      <Text style={styles.propertyCountText}>
                        {item.subtipo} • {item.municipio}
                      </Text>
                    </>
                  ) : (
                    <>
                      {/* Descripción completa separada por comas, estilo Google Places. */}
                      <Text style={styles.suggestionName} numberOfLines={2}>
                        {item.fullDescription || item.name}
                      </Text>
                      <Text style={styles.propertyCountText}>
                        {item.propertyCount || 0}{" "}
                        {item.propertyCount === 1 ? "propiedad" : "propiedades"}
                      </Text>
                    </>
                  )}
                </View>
                {item.type === "property_code" && item.fotos && item.fotos.length > 0 && (
                  <View style={styles.suggestionImageContainer}>
                    <Image
                      source={item.fotos[0]}
                      style={{ width: 55, height: 55 }}
                    />
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.suggestionItem}>
                <View style={styles.suggestionIconContainer}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </View>
                <View style={styles.suggestionTextContainer}>
                  <Text style={styles.suggestionName}>
                    {isLoading
                      ? "Cargando ubicaciones..."
                      : "No se encontraron ubicaciones"}
                  </Text>
                  <Text style={styles.suggestionType}>
                    {isLoading
                      ? "Espera un momento"
                      : "Intenta con otro término"}
                  </Text>
                </View>
              </View>
            }
          />
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  searchWrapper: {
    flex: 1,
    marginBottom: 0,
  },
  searchButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  searchButtonText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mapSmallButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  suggestionsContainer: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: COLORS.white,
    borderRadius: 16,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 10,
    maxHeight: 350,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    zIndex: 3000,
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    width: "100%",
  },
  suggestionIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  suggestionType: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    textTransform: "capitalize",
  },
  propertyCountText: {
    fontSize: 11,
    color: COLORS.primary,
    marginTop: 2,
    fontWeight: "500",
  },
  suggestionImageContainer: {
    width: 45,
    height: 45,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    overflow: "hidden",
  },
});
