import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  FlatList,
  ScrollView,
  Modal,
  Platform,
  Keyboard,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { FeedItem, HistorialBusqueda } from "@/types";
import { SpecialPostCard } from "@/components/Feed/SpecialPostCard";
import { useSearch, SearchUser, SearchPost, SearchReel, SearchLocation, SearchProperty } from "@/hooks/useSearch";
import { useSearchHistory } from "@/hooks/useSearchHistory";
import { useSearchStore, TIPO_BUSQUEDA, ResultData } from "@/store/searchStore";
import { usePropertyFiltersStore } from "@/store/propertyFiltersStore";
import { useAuth } from "@/context/AuthContext";
import type { TipoBusqueda } from "@/types";
import { HistorySearches } from "@/components/search/HistorySearches";
import { formatPriceShort } from "@/utils/priceFormatter";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COL3 = (SCREEN_WIDTH - 2) / 3;
const COL2 = (SCREEN_WIDTH - 2) / 2;
const FICHA_GAP = 10;
const FICHA_H_PADDING = 16;
const FICHA_ITEM_WIDTH = (SCREEN_WIDTH - FICHA_H_PADDING * 2 - FICHA_GAP) / 2;

// â”€â”€â”€ Tipos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Tab = "todos" | "usuarios" | "posts" | "reels" | "ubicaciones" | "fichas";

const TABS: { key: Tab; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "posts", label: "Posts" },
  { key: "reels", label: "Reels" },
  { key: "ubicaciones", label: "Propiedades" },
];

// â”€â”€â”€ Componente principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface SearchOverlayProps {
  visible?: boolean;
  onClose: () => void;
  initialQuery?: string;
}

export default function SearchOverlay({ visible, onClose, initialQuery = "" }: SearchOverlayProps) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("todos");
  const [expandedSections, setExpandedSections] = React.useState<Set<string>>(new Set());

  // visible undefined significa que se usa como screen (siempre visible)
  const isVisible = visible ?? true;
  const isScreenMode = visible === undefined;

  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();

  const {
    query,
    setQuery,
    loading,
    results,
    selectLocation,
    navigateToUser,
    navigateToPost,
    navigateToReel,
    navigateToProperty,
  } = useSearch();

  const { startSearch, updateSearchWithResult, touchTimestamp, currentSearchId, setCurrentSearchId } = useSearchStore();

  // Search history from database (only for listing and deleting)
  const {
    historial,
    isLoading: historyLoading,
    eliminarBusqueda,
  } = useSearchHistory();

  // Handler: select history item
  const handleSelectHistory = (busqueda: HistorialBusqueda) => {
    const tipo = busqueda.tipo_busqueda;

    // Si es draft o null, repetir búsqueda en overlay Y guardar el ID para actualizaciones
    if (!tipo || tipo === 'draft') {
      if (busqueda.query_original && userId) {
        setQuery(busqueda.query_original);
        touchTimestamp(busqueda.id, userId);
        setCurrentSearchId(busqueda.id); // Guardar ID para que al seleccionar resultado se actualice esta búsqueda
        setExpandedSections(new Set(['searchResults']));
      }
      return;
    }

    // Si tiene resultado_tipo_id, navegar directamente al resultado
    if (busqueda.resultado_tipo_id) {
      switch (tipo) {
        case 'usuario':
          router.push(`/(stack)/user/${busqueda.resultado_tipo_id}`);
          break;
        case 'post':
          router.push(`/(stack)/post/${busqueda.resultado_tipo_id}`);
          break;
        case 'reel':
          router.push(`/(stack)/reel/${busqueda.resultado_tipo_id}`);
          break;
        case 'propiedad':
          router.push(`/(stack)/property/${busqueda.resultado_tipo_id}`);
          break;
        case 'ubicacion':
          touchTimestamp(busqueda.id, userId!);
          setCurrentSearchId(busqueda.id);
          usePropertyFiltersStore.getState().setFiltersFromHistory(busqueda as any);
          router.push('/map');
          break;
        default:
          // Para otros tipos sin resultado, repetir búsqueda
          if (busqueda.query_original && userId) {
            setQuery(busqueda.query_original);
            touchTimestamp(busqueda.id, userId);
            setCurrentSearchId(busqueda.id);
            setExpandedSections(new Set(['searchResults']));
          }
      }
      return;
    }

    // Si no tiene resultado_tipo_id pero tiene tipo
    if (tipo === 'ubicacion') {
      touchTimestamp(busqueda.id, userId!);
      setCurrentSearchId(busqueda.id);
      usePropertyFiltersStore.getState().setFiltersFromHistory(busqueda as any);
      router.push('/map');
      return;
    }

    // Para otros tipos sin resultado_tipo_id, repetir búsqueda en overlay
    if (busqueda.query_original && userId) {
      setQuery(busqueda.query_original);
      touchTimestamp(busqueda.id, userId);
      setCurrentSearchId(busqueda.id);
      setExpandedSections(new Set(['searchResults']));
    }
  };

  useEffect(() => {
    if (visible) {
      setQuery(initialQuery);
      setExpandedSections(new Set());
      setActiveTab("todos");
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  const handleClose = () => {
    Keyboard.dismiss();
    setQuery("");
    setActiveTab("todos");
    setExpandedSections(new Set());
    onClose();
  };

  // Handler: guardar búsqueda cuando presiona Enter (fire & forget)
  const handleSubmitSearch = () => {
    const q = query.trim();
    if (!q) {
      console.log('🔍 [SearchOverlay] Query vacía, no se guarda');
      return;
    }

    if (!userId) {
      console.error('🔍 [SearchOverlay] User not authenticated');
      return;
    }

    console.log('🔍 [SearchOverlay] handleSubmitSearch called, query:', q);

    // Fire & forget - no esperamos resultado
    startSearch(q, userId).catch((e) => {
      console.error('🔍 [SearchOverlay] Error creating search:', e);
    });
  };

  // Handler: actualizar búsqueda existente cuando selecciona resultado y navegar
  const handleNavigate = (
    action: () => void,
    tipo: TipoBusqueda,
    resultData?: ResultData
  ) => {
    if (currentSearchId && userId) {
      if (resultData?.name || resultData?.resultadoTitulo) {
        updateSearchWithResult(currentSearchId, { ...resultData, tipo }, userId).catch((e) => {
          console.error('🔍 [SearchOverlay] Error updating search:', e);
        });
      }
    }

    // Navegar sin cerrar el search (la navegación cambia de screen)
    action();
  };

  // â”€â”€ Contenido de cada tab â”€â”€

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  // Helper para obtener datos del post clickeado
  const getPostData = (feedItemId: string) => {
    const post = results.posts.find(p => p.feed_item_id === feedItemId);
    return {
      resultadoTitulo: post?.nombre_asesor || post?.tipo || 'Post',
      resultadoSubtitulo: post?.ubicacion || post?.fecha_hora || '',
      resultadoTipoId: feedItemId,
    };
  };

  // Helper para obtener datos del reel clickeado
  const getReelData = (feedItemId: string) => {
    const reel = results.reels.find(r => r.feed_item_id === feedItemId);
    return {
      resultadoTitulo: 'Reel',
      resultadoSubtitulo: reel?.views || '',
      resultadoTipoId: feedItemId,
    };
  };

  // Helper para obtener datos de la propiedad clickeada
  const getPropertyData = (propertyId: string) => {
    const property = results.properties.find(p => p.id === propertyId);
    const precioFormateado = property?.precio ? `$${property.precio}` : '';
    return {
      resultadoTitulo: property?.codigo_propiedad || 'Propiedad',
      resultadoSubtitulo: precioFormateado || '',
      resultadoTipoId: propertyId,
    };
  };

  const renderTabTodos = () => {
    const sectionState = <T,>(key: string, items: T[], limit: number) => {
      const isExpanded = expandedSections.has(key);
      return {
        isExpanded,
        displayItems: isExpanded ? items : items.slice(0, limit),
        showToggle: items.length > limit,
        toggle: () => toggleSection(key),
      };
    };

    return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {results.users.length > 0 && (() => {
        const s = sectionState("users", results.users, 3);
        return (
          <>
            <SectionHeader title="Usuarios" />
            {s.displayItems.map((u) => (
              <UserRow key={u.id} user={u} onPress={() => handleNavigate(() => navigateToUser(u.id), TIPO_BUSQUEDA.USUARIO, { resultadoTitulo: u.name, resultadoSubtitulo: u.ocupacion, resultadoTipoId: u.id })} />
            ))}
            {s.showToggle && <ToggleButton isExpanded={s.isExpanded} count={results.users.length} onPress={s.toggle} />}
          </>
        );
      })()}

      {results.locations.length > 0 && (() => {
        const s = sectionState("locations", results.locations, 2);
        return (
          <>
            <SectionHeader title="Ubicaciones" />
            {s.displayItems.map((l, i) => (
              <LocationRow 
                key={`${l.id}-${i}`} 
                location={l} 
                onPress={() => handleNavigate(
                  () => selectLocation(l),
                  TIPO_BUSQUEDA.UBICACION,
                  { name: l.name, type: l.type || '', estado: l.estado, municipio: l.municipio, placeId: l.placeId }
                )} 
              />
            ))}
            {s.showToggle && <ToggleButton isExpanded={s.isExpanded} count={results.locations.length} onPress={s.toggle} />}
          </>
        );
      })()}

      {results.properties.length > 0 && (() => {
        const s = sectionState("properties", results.properties, 4);
        return (
          <>
            <SectionHeader title="Fichas" />
            <PropertyFichasGrid items={s.displayItems} onPress={(id) => handleNavigate(() => navigateToProperty(id), TIPO_BUSQUEDA.PROPIEDAD, getPropertyData(id))} />
            {s.showToggle && <ToggleButton isExpanded={s.isExpanded} count={results.properties.length} onPress={s.toggle} />}
          </>
        );
      })()}

      {results.posts.length > 0 && (() => {
        const s = sectionState("posts", results.posts, 6);
        return (
          <>
            <SectionHeader title="Posts" />
            <PostGrid items={s.displayItems} onPress={(id) => handleNavigate(() => navigateToPost(id), TIPO_BUSQUEDA.POST, getPostData(id))} />
            {s.showToggle && <ToggleButton isExpanded={s.isExpanded} count={results.posts.length} onPress={s.toggle} />}
          </>
        );
      })()}

      {results.reels.length > 0 && (() => {
        const s = sectionState("reels", results.reels, 4);
        return (
          <>
            <SectionHeader title="Reels" />
            <ReelGrid items={s.displayItems} onPress={(id) => handleNavigate(() => navigateToReel(id), TIPO_BUSQUEDA.REEL, getReelData(id))} />
            {s.showToggle && <ToggleButton isExpanded={s.isExpanded} count={results.reels.length} onPress={s.toggle} />}
          </>
        );
      })()}

      {results.properties.length === 0 && results.users.length === 0 && results.posts.length === 0 &&
        results.reels.length === 0 && results.locations.length === 0 && !loading && (
        <View style={styles.noResults}>
          <Text style={styles.noResultsText}>Sin resultados para "{query}"</Text>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
  };

  const renderTabUsuarios = () => (
    <FlatList
      data={results.users}
      keyExtractor={(i) => i.id}
      renderItem={({ item }) => <UserRow user={item} onPress={() => handleNavigate(() => navigateToUser(item.id), TIPO_BUSQUEDA.USUARIO)} />}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={!loading ? <EmptyResults query={query} /> : null}
    />
  );

  const renderTabPosts = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {results.posts.length > 0
        ? <PostGrid items={results.posts} onPress={(id) => handleNavigate(() => navigateToPost(id), TIPO_BUSQUEDA.POST, getPostData(id))} />
        : (!loading && <EmptyResults query={query} />)}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderTabReels = () => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {results.reels.length > 0
        ? <ReelGrid items={results.reels} onPress={(id) => handleNavigate(() => navigateToReel(id), TIPO_BUSQUEDA.REEL, getReelData(id))} />
        : (!loading && <EmptyResults query={query} />)}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderTabUbicaciones = () => (
    <FlatList
      data={results.locations}
      keyExtractor={(i, idx) => `${i.id}-${idx}`}
      renderItem={({ item: l }) => (
              <LocationRow
                location={l}
                onPress={() => handleNavigate(
                  () => selectLocation(l),
                  TIPO_BUSQUEDA.UBICACION,
                  { name: l.name, type: l.type || '', estado: l.estado || '', municipio: l.municipio, placeId: l.placeId }
                )}
              />
      )}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={!loading ? <EmptyResults query={query} /> : null}
    />
  );

  const renderTabFichas = () => (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      {results.properties.length > 0
        ? <PropertyFichasGrid items={results.properties} onPress={(id) => handleNavigate(() => navigateToProperty(id), TIPO_BUSQUEDA.PROPIEDAD, getPropertyData(id))} />
        : (!loading && <EmptyResults query={query} />)}
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "usuarios":    return renderTabUsuarios();
      case "posts":       return renderTabPosts();
      case "reels":       return renderTabReels();
      case "ubicaciones": return renderTabUbicaciones();
      case "fichas":      return renderTabFichas();
      default:            return renderTabTodos();
    }
  };

  const renderSearchContent = () => (
    <View style={[styles.container, { paddingTop: isScreenMode ? 0 : insets.top }]}>

      {/* â”€â”€ Header con buscador â”€â”€ */}
      <View style={styles.header}>
        {isScreenMode && (
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}
        {!isScreenMode && (
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}

        <View style={styles.inputWrapper}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="¿Dónde busca tu cliente?"
            placeholderTextColor={COLORS.textSecondary}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmitSearch}
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {loading && <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />}
          {!loading && query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* â”€â”€ Tabs â”€â”€ */}
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.tabsBorder} />
      </View>

        {/* â”€â”€ Contenido â”€â”€ */}
        <View style={styles.content}>
          {/* Historial de bÃºsquedas (de BD) */}
          {query.length === 0 && (
            <HistorySearches
              historial={historial}
              onSelect={handleSelectHistory}
              onRemove={eliminarBusqueda}
              isLoading={historyLoading}
            />
          )}
        
        {query.length === 0 && historial.length === 0 && !historyLoading && (
          <View style={styles.emptyState}>
            <Ionicons name="search" size={48} color={COLORS.cardBorder} />
            <Text style={styles.emptyTitle}>Busca en Ilyrox</Text>
            <Text style={styles.emptySubtitle}>Encuentra usuarios, propiedades, reels y ubicaciones</Text>
          </View>
        )}
        {query.length > 0 && renderContent()}
      </View>

    </View>
  );

  // Screen mode: renderizar directo sin Modal
  if (isScreenMode) {
    return renderSearchContent();
  }

  // Modal mode: usar Modal
  return (
    <Modal visible={isVisible} animationType="fade" transparent={false} statusBarTranslucent onRequestClose={handleClose}>
      {renderSearchContent()}
    </Modal>
  );
}

// â”€â”€â”€ Sub-componentes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


function EmptyResults({ query }: { query: string }) {
  return (
    <View style={styles.noResults}>
      <Text style={styles.noResultsText}>Sin resultados para "{query}"</Text>
    </View>
  );
}

function SectionHeader({ title, style }: { title: string; style?: object }) {
  return (
    <View style={[sectionStyles.header, style]}>
      <Text style={sectionStyles.title}>{title}</Text>
    </View>
  );
}

function UserRow({ user, onPress }: { user: SearchUser; onPress: () => void }) {
  return (
    <TouchableOpacity style={userStyles.row} activeOpacity={0.7} onPress={onPress}>
      <View style={userStyles.avatarWrapper}>
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={userStyles.avatar} contentFit="cover" />
        ) : (
          <View style={[userStyles.avatar, userStyles.avatarPlaceholder]}>
            <Ionicons name="person" size={24} color={COLORS.textSecondary} />
          </View>
        )}
      </View>
      <View style={userStyles.info}>
        <Text style={userStyles.name} numberOfLines={1}>{user.name}</Text>
        {user.ocupacion && <Text style={userStyles.username}>{user.ocupacion}</Text>}
        {user.rating != null && (
          <Text style={userStyles.followers}>â­ {user.rating.toFixed(1)}</Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
    </TouchableOpacity>
  );
}

function ToggleButton({ isExpanded, count, onPress }: { isExpanded: boolean; count: number; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={sectionStyles.toggleBtn}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={sectionStyles.toggleText}>
        {isExpanded ? `Ver menos` : `Ver todos (${count})`}
      </Text>
    </TouchableOpacity>
  );
}

function searchPostToFeedItem(post: SearchPost): FeedItem {
  return {
    id: post.id,
    type: "post",
    user: { id: "", nombre: post.nombre_asesor || "", avatar: post.foto_perfil_usuario || "", isFollowing: false, role: "Agente" },
    content: "",
    images: post.img ? [post.img] : undefined,
    likes: 0,
    comments: 0,
    timestamp: "",
    postType: post.tipo as any,
    fecha_hora: post.fecha_hora,
    ubicacion: post.ubicacion,
    foto_propiedad: post.foto_propiedad,
    antiguedad: post.antiguedad,
    nombre_asesor: post.nombre_asesor,
    status: post.status as any,
    postDetails: {
      id: post.id,
      publicado_por: "",
      contenido: null,
      imagenes: null,
      created_at: "",
      updated_at: "",
      deleted_at: null,
      busquedas_json: post.busquedas_json,
      foto_perfil_usuario: post.foto_perfil_usuario,
    },
  };
}

const CARD_HEIGHT_ESTIMATES: Record<string, number> = {
  openhouse: 390,
  sold: 390,
  busqueda: 325,
  aniversario: 390,
};
const SCALE = COL3 / SCREEN_WIDTH;

// Renderiza SpecialPostCard preview escalado a un tercio del ancho.
// Usa transform (no margin) para que los cambios de posición no afecten el layout
// y no redisparar onLayout en un ciclo.
const ScaledSpecialCard = React.memo(function ScaledSpecialCard({
  post,
  onPress,
}: {
  post: SearchPost;
  onPress: () => void;
}) {
  const estimated = CARD_HEIGHT_ESTIMATES[post.tipo ?? ""] ?? 390;
  const [cardHeight, setCardHeight] = useState(estimated);

  const feedItem = React.useMemo(() => searchPostToFeedItem(post), [post]);

  const offsetX = -(SCREEN_WIDTH * (1 - SCALE)) / 2;
  const offsetY = -(cardHeight * (1 - SCALE)) / 2;

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[gridStyles.specialCell, { height: cardHeight * SCALE }]}
    >
      <View
        style={{
          width: SCREEN_WIDTH,
          transform: [{ translateX: offsetX }, { translateY: offsetY }, { scale: SCALE }],
        }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0 && h !== cardHeight) setCardHeight(h);
        }}
      >
        <SpecialPostCard item={feedItem} mode="preview" />
      </View>
    </TouchableOpacity>
  );
});

// Todos los posts (imagen y special) van en grid de 3 columnas para evitar
// huecos visuales a la derecha.
function PostGrid({ items, onPress }: { items: SearchPost[]; onPress: (feedItemId: string) => void }) {
  const rows: SearchPost[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));

  return (
    <View>
      {rows.map((row, ri) => (
        <View key={`row-${ri}`} style={gridStyles.row}>
          {row.map((item, ci) => {
            const isImage = !!item.img;
            const showGap = ci < row.length - 1;
            if (isImage) {
              return (
                <TouchableOpacity key={item.id} activeOpacity={0.9} onPress={() => onPress(item.feed_item_id)}>
                  <Image
                    source={{ uri: item.img }}
                    style={[gridStyles.postCell, showGap && gridStyles.postCellGap]}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              );
            }
            return (
              <View key={item.id} style={showGap && gridStyles.postCellGap}>
                <ScaledSpecialCard
                  post={item}
                  onPress={() => onPress(item.feed_item_id)}
                />
              </View>
            );
          })}
          {/* Celdas vacÃ­as para completar la fila si quedan menos de 3 items */}
          {Array.from({ length: 3 - row.length }).map((_, idx) => (
            <View key={`empty-${idx}`} style={[gridStyles.postCell, { backgroundColor: "transparent" }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

function ReelGrid({ items, onPress }: { items: SearchReel[]; onPress: (feedItemId: string) => void }) {
  const rows: SearchReel[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri} style={gridStyles.row}>
          {row.map((item, ci) => (
            <TouchableOpacity
              key={item.id}
              style={[gridStyles.reelCell, ci === 0 && gridStyles.reelCellGap]}
              activeOpacity={0.9}
              onPress={() => onPress(item.feed_item_id)}
            >
              {item.img ? (
                <Image source={{ uri: item.img }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, gridStyles.placeholder]}>
                  <Ionicons name="videocam-outline" size={28} color={COLORS.textSecondary} />
                </View>
              )}
              <View style={gridStyles.reelOverlay}>
                <Ionicons name="play" size={20} color="#fff" />
                {item.views && <Text style={gridStyles.reelViews}>{item.views}</Text>}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

function PropertyFichasGrid({ items, onPress }: { items: SearchProperty[]; onPress: (id: string) => void }) {
  const rows: SearchProperty[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={fichaStyles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={fichaStyles.columnWrapper}>
          {row.map((item) => (
            <PropertyFichaCard key={item.id} property={item} onPress={() => onPress(item.id)} />
          ))}
          {row.length === 1 && <View style={{ width: FICHA_ITEM_WIDTH }} />}
        </View>
      ))}
    </View>
  );
}

function PropertyFichaCard({ property, onPress }: { property: SearchProperty; onPress: () => void }) {
  const imgUri = Array.isArray(property.fotos) && property.fotos.length > 0
    ? property.fotos[0]
    : null;

  const priceDisplay = property.precio != null ? formatPriceShort(property.precio) : null;
  const location =
    [property.colonia, property.municipio, property.estado]
      .filter(Boolean)
      .join(", ") || null;
  const m2 = (property.metros_cuadrados_construccion ?? 0) > 0
    ? property.metros_cuadrados_construccion
    : property.metros_cuadrados_terreno;

  return (
    <TouchableOpacity style={fichaStyles.card} activeOpacity={0.85} onPress={onPress}>
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={fichaStyles.image} contentFit="cover" />
      ) : (
        <View style={[fichaStyles.image, fichaStyles.imagePlaceholder]}>
          <Ionicons name="home-outline" size={28} color={COLORS.textTertiary} />
        </View>
      )}

      <View style={fichaStyles.codeBadge}>
        <Text style={fichaStyles.codeText} numberOfLines={1}>{property.codigo_propiedad}</Text>
      </View>

      <View style={fichaStyles.info}>
        {priceDisplay && (
          <View style={fichaStyles.priceRow}>
            <Text style={fichaStyles.priceText}>{priceDisplay}</Text>
            {property.moneda && <Text style={fichaStyles.currencyText}> {property.moneda}</Text>}
          </View>
        )}
        {location && (
          <Text style={fichaStyles.locationText} numberOfLines={1}>{location}</Text>
        )}
        <View style={fichaStyles.featuresRow}>
          {(property.habitaciones ?? 0) > 0 && (
            <View style={fichaStyles.feature}>
              <Ionicons name="bed-outline" size={10} color={COLORS.textQuaternary} />
              <Text style={fichaStyles.featureText}>{property.habitaciones}</Text>
            </View>
          )}
          {(property.banos ?? 0) > 0 && (
            <View style={fichaStyles.feature}>
              <Ionicons name="water-outline" size={10} color={COLORS.textQuaternary} />
              <Text style={fichaStyles.featureText}>{property.banos}</Text>
            </View>
          )}
          {(m2 ?? 0) > 0 && (
            <View style={fichaStyles.feature}>
              <Text style={fichaStyles.featureText}>{m2}m²</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function LocationRow({ location, onPress }: { location: SearchLocation; onPress: () => void }) {
  // Descripción completa separada por comas, estilo Google Places.
  const fullText =
    location.fullDescription ||
    [location.name, location.municipio, location.estado].filter(Boolean).join(", ");
  return (
    <TouchableOpacity style={locStyles.row} activeOpacity={0.7} onPress={onPress}>
      <View style={locStyles.iconWrapper}>
        <Ionicons name="location" size={22} color={COLORS.primary} />
      </View>
      <View style={locStyles.info}>
        <Text style={locStyles.name} numberOfLines={2}>{fullText}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.cardBorder} />
    </TouchableOpacity>
  );
}

// â”€â”€â”€ Estilos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  backBtn: {
    padding: 4,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.background,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    gap: 8,
  },
  inputIcon: {
    marginRight: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    padding: 0,
  },
  tabsContainer: {
    backgroundColor: COLORS.white,
  },
  tabsScroll: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 0,
    gap: 6,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.background,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  tabsBorder: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginTop: 10,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
    marginTop: 80,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  noResults: {
    alignItems: "center",
    paddingTop: 60,
  },
  noResultsText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

const sectionStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.primary,
  },
});

const userStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  avatarWrapper: {
    width: 50,
    height: 50,
    borderRadius: 25,
    overflow: "hidden",
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  username: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  followers: {
    fontSize: 12,
    color: COLORS.textSecondary,
    opacity: 0.8,
  },
});

const gridStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    marginBottom: 1,
  },
  specialCell: {
    width: COL3,
    overflow: "hidden",
  },
  postCell: {
    width: COL3,
    height: COL3,
    backgroundColor: COLORS.background,
  },
  postCellGap: {
    marginRight: 1,
  },
  reelCell: {
    width: COL2,
    height: COL2 * 1.6,
    backgroundColor: COLORS.background,
    overflow: "hidden",
    marginBottom: 1,
  },
  reelCellGap: {
    marginRight: 1,
  },
  reelOverlay: {
    position: "absolute",
    bottom: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  reelViews: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
});

const locStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.background,
    gap: 12,
  },
  iconWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.primaryTransparent,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
  hierarchy: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});

const fichaStyles = StyleSheet.create({
  grid: {
    paddingHorizontal: FICHA_H_PADDING,
    paddingTop: 12,
  },
  columnWrapper: {
    justifyContent: "space-between",
    marginBottom: FICHA_GAP,
  },
  card: {
    width: FICHA_ITEM_WIDTH,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: FICHA_ITEM_WIDTH,
    backgroundColor: COLORS.background,
  },
  imagePlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  codeBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: COLORS.blackTransparent,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: FICHA_ITEM_WIDTH - 12,
  },
  codeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  info: {
    padding: 8,
    gap: 2,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  priceText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textQuaternary,
  },
  currencyText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textQuaternary,
  },
  locationText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  featuresRow: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  featureText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.textQuaternary,
  },
});


