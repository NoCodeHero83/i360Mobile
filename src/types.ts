import type { CountryCode } from "./lib/location/types";

export type Post = {
  id: string;
  publicado_por: string;
  contenido: string | null;
  imagenes: string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  status?: "Visible" | "Oculto";
  tipo?: "post" | "busqueda" | "openhouse" | "aniversario" | "sold";
  foto_perfil_usuario?: string;
  fecha_hora?: string;
  nombre_asesor?: string;
  ubicacion?: string;
  foto_propiedad?: string;
  antiguedad?: number;
  busquedas_json?: any;
  precio_min?: number;
  precio_max?: number;
  habitaciones?: number;
  operacion?: string;
  fecha_finalizacion?: string;
  feed_item_id?: string;
  likes_count?: number;
  comentarios_count?: number;
};

export type FeedItem = {
  id: string;
  type: "post" | "reel" | "property";
  user: User;
  content: string;
  images?: string[];
  videoUrl?: string;
  propertyDetails?: Property;
  postDetails?: Post;
  reelDetails?: Reel;
  likes: number;
  comments: number;
  views?: number;
  shares?: number;
  commentsList?: Comment[];
  timestamp: string;
  /** Fecha (ISO) en que se encontró el match. Solo en la pantalla de coincidencias. */
  matchedAt?: string;
  status?: "Publicada" | "Suspendida" | "Rentada" | "Reservada" | "Vendida";
  codigo_propiedad?: string;
  postType?: "post" | "busqueda" | "openhouse" | "aniversario" | "sold";
  foto_perfil_usuario?: string;
  fecha_hora?: string;
  fecha_finalizacion?: string;
  nombre_asesor?: string;
  ubicacion?: string;
  foto_propiedad?: string;
  antiguedad?: number;
  busquedas_json?: any;
};

export type Reel = {
  id: string;
  publicado_por: string;
  video_url: string;
  thumbnail_url: string | null;
  descripcion: string | null;
  duracion_segundos: number | null;
  status?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  feed_item_id?: string;
};

export type ProfileContentType = "properties" | "posts" | "reels";

export type User = {
  id: string;
  nombre?: string;
  name?: string;
  avatar: string;
  isFollowing: boolean;
  role: "Agente" | "Cliente" | "Admin" | "Agent" | "User";
  ocupacion?: string;
  rating?: number;
  totalRatings?: number;
  positiveRecommendations?: number;
  negativeRecommendations?: number;
  recommendedByPreview?: RecommendedByPreviewUser[];
  location?: string;
  phone?: string;
  aprobaciones_recibidas?: number;
  aprobaciones_requeridas?: number;
};

export type RecommendedByPreviewUser = {
  id: string;
  name: string;
  avatar?: string | null;
};

export type PropertyType =
  | "habitacional"
  | "comercial"
  | "industrial"
  | "agricola";

export type CommissionDetails = {
  shared: boolean;
  percentage?: number;
  months?: number;
  condition?: string;
};

export type LegalDetails = {
  hasEncumbrance: boolean;
  institution?: string;
};

/** Bounding box geográfica (norte/sur/este/oeste en decimal degrees) */
export type GeoBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export type Property = {
  id: string;
  code?: string;
  title: string;
  description?: string;
  createdAt?: string;
  price: number;
  currency: "USD" | "MXN";
  location: {
    address: string;
    country: string;
    state: string;
    city: string;
    municipio?: string;
    colony: string;
    zip?: string;
  };
  /** Código de país ISO (default: MX). Las columnas estado/municipio/colonia
   *  se interpretan según este país vía la capa `@/lib/location`. */
  pais?: CountryCode;
  coordinates?: { lat: number; lng: number };
  images: string[];
  features: {
    beds: number;
    baths: number;
    halfBaths?: number;
    parking?: number;
    floors?: number;
    floorLevel?: number;
    constructionSqft: number;
    landSqft: number;
    yearBuilt?: number;
    maintenanceFee?: number;
    // Industrial
    operationalAreaSqft?: number;
    maneuveringYardSqft?: number;
    clearHeight?: string;
    energiaKva?: string[];
    ubicacionIndustrial?: string;
    // Comercial
    frontMeters?: number;
    backMeters?: number;
    enEsquina?: boolean;
    sobreAvenida?: boolean;
    commercialLocation?: string;
    // Agrícola
    tieneAgua?: boolean;
    electricidad?: boolean;
    pieCarretera?: boolean;
  };
  amenities: string[];
  type: PropertyType;
  subtype: string;
  operation: "Sale" | "Rent";
  status: "Publicada" | "Suspendida" | "Rentada" | "Reservada" | "Vendida";
  commission?: CommissionDetails;
  sin_comision?: boolean;
  /** Denormalizado: true si alguna operación comparte comisión. */
  comparte_comision?: boolean;
  es_easybroker?: boolean;
  legal?: LegalDetails;
  /** Coordenada numérica directa de la BD (tipo numeric en Supabase) */
  longitud?: number;
  latitud?: number;
  municipio?: string;
  colonia?: string;
  subtipo?: string;
  codigo_propiedad?: string;
  operations?: operaciones_propiedad[];
  habitaciones?: number;
  banos?: number;
  estacionamientos?: number;
  metros_construccion?: number;
  metros_terreno?: number;
};

export type Comment = {
  id: string;
  user: User;
  text: string;
  timestamp: string;
  imageUrl?: string;
  parentId?: string;
  isLiked?: boolean;
};

export type Lead = {
  id: string;
  name: string;
  phone?: string;
  status: "New" | "Contacted" | "Qualified";
};

export type SavedSearch = {
  id: string;
  name: string;
  filters: string;
  linkedLead?: Lead;
};

export type MatchGroup = {
  id: string;
  title: string;
  type: "Lead" | "Search";
  properties: Property[];
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type Message = {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  type: "text" | "appointment";
  appointmentStatus?: "pending" | "completed" | "rated";
  appointmentDate?: string;
};

export type ChatSession = {
  id: string;
  user: User;
  lastMessage: string;
  unread: number;
  messages: Message[];
  tags: Tag[];
};

export type perfiles = {
  id: string;
  nombre: string;
  nombre_completo?: string;
  rol: "admin" | "agente" | "cliente";
  apellido_materno: string;
  apellido_paterno: string;
  celular?: string;
  pais: string;
  estado: string;
  ciudad?: string;
  municipio?: string;
  colonia?: string;
  email: string;
  foto: string;
  estado_registro: string;
  aprobaciones_recibidas: number;
  aprobaciones_requeridas: number;
  prefijo_celular?: string;
  biografia?: string;
  sitio_web?: string;
  fecha_inicio_carrera?: string;
  ocupacion?: string;
  otro_ocupacion?: string;
  modalidad?: string;
  nombre_inmobiliaria?: string;
  curso_certificacion?: string;
  activado_en?: string;
  deleted_at?: string;
  calificacion_promedio?: string;
  total_calificaciones?: string;
  total_recomendaciones_positivas?: string;
  total_recomendaciones_negativas?: string;
};

export type EstadisticasResenas = {
  profesional_id: string;
  total_resenas: number;
  calificacion_promedio: number;
  promedio_profesionalismo: number;
  promedio_etica_valores: number;
  promedio_pago_comisiones: number;
  promedio_comunicacion_servicio: number;
  total_recomiendan: number;
  total_no_recomiendan: number;
  total_5_estrellas: number;
  total_4_estrellas: number;
  total_3_estrellas: number;
  total_2_estrellas: number;
  total_1_estrella: number;
};

export type operaciones_propiedad = {
  id: string;
  propiedad_id: string;
  tipo_operacion: "venta" | "renta";
  precio: number;
  moneda: "MXN" | "USD";
  periodo_renta?: string;
  comision_tipo?: "porcentaje" | "monto_fijo" | "mixto";
  comision_porcentaje?: number;
  comision_monto_fijo?: number;
  comision_meses?: number;
  comparte_comision?: boolean;
  porcentaje_comision_compartida?: number;
  monto_comision_compartida?: number;
  condiciones_comision_compartida?: string;
  activa: boolean;
  vigente_desde: string;
  vigente_hasta: string;
};

export type ReportesPropiedades = {
  id: string;
  propiedad_id: string;
  reportado_por: string;
  propietario_id: string;
  clasificacion?: string;
  motivo: string;
  descripcion: string;
  estado: "pendiente" | "revisado" | "accion_tomada";
  revisado_por: string;
  revisado_en: string;
  created_at?: string;
  updated_at?: string;
};

export type busquedas_guardadas = {
  id: string;
  usuario_id: string;
  tipo_propiedad: string;
  query_original?: string;
  activa: boolean;
  created_at?: string;
  lead_id: string;
  ciudad: string;
  municipio: string;
  deleted_at?: string;
  updated_at?: string;
  tipo_operacion?: "venta" | "renta";
  precio_min: number;
  precio_max: number;
  moneda: string;
  estado?: string;
  colonia?: string;
  subtipo?: string;
  habitaciones?: string;
  banos?: string;
  estacionamientos?: string;
  metros_construccion?: number;
  metros_terreno?: number;
  genero?: "Masculino" | "Femenino";
  polygon_coords?: { latitude: number; longitude: number }[];
  /** Bounds geográficos para el filtro de zona (nuevo campo) */
  bounds?: GeoBounds;
  /** Nombre display de la zona buscada (ej: "Polanco, CDMX") */
  place_name?: string;
};

/**
 * Historial de búsquedas del usuario.
 * Guarda las búsquedas completadas para poder restaurarlas.
 */
export type TipoBusqueda = 'draft' | 'ubicacion' | 'post' | 'reel' | 'usuario' | 'propiedad';

export type HistorialBusqueda = {
  id: string;
  usuario_id: string;
  /** Texto original que escribió el usuario en el input */
  query_original: string | null;
  /** Tipo de resultado seleccionado: ubicacion, post, reel, usuario, propiedad */
  tipo_busqueda: TipoBusqueda | null;
  /** Título del resultado seleccionado (nombre de usuario, título de post, etc.) */
  resultado_titulo: string | null;
  /** Subtitulo del resultado (username, preview, etc.) */
  resultado_subtitulo: string | null;
  /** ID del resultado seleccionado */
  resultado_tipo_id: string | null;
  estado: string | null;
  ciudad: string | null;
  municipio: string | null;
  colonia: string | null;
  place_name: string | null;
  tipo_propiedad: string | null;
  tipo_operacion: string | null;
  precio_min: number | null;
  precio_max: number | null;
  moneda: string;
  habitaciones: string | null;
  banos: string | null;
  estacionamientos: string | null;
  /** Filtros completos para restaurar (PropertyFilters serializado) */
  filtros_completos: Record<string, any>;
  completa: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type agrupaciones_conversaciones = {
  id: string;
  usuario1_id: string;
  usuario2_id: string;
  total_conversaciones: number;
  total_mensajes_no_leidos_usuario1: number;
  total_mensajes_no_leidos_usuario2: number;
  ultimo_mensaje_preview: string;
  ultimo_mensaje_de: string;
  ultima_actividad: string;
  conversacion_mas_reciente_id: string;
  created_at?: string;
  updated_at?: string;
};

export type mensajes = {
  id: string;
  conversacion_id: string;
  contenido: string;
  imagen_url: string | null;
  archivo_url: string | null;
  archivo_nombre: string | null;
  tipo: "texto" | "imagen" | "imagen";
  leido: boolean;
  fecha_leido: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type conversaciones = {
  id: string;
  propiedad_id: string | null;
  usuario1_id: string;
  usuario2_id: string;
  creada_en: string;
  deleted_at: string | null;
  ultimo_mensaje_en: string;
  mensajes_no_leidos_usuario1: string;
  mensajes_no_leidos_usuario2: string;
  ultimo_mensaje_preview: string;
  updated_at: string | null;
};

export type feed_items = {
  id: string;
  tipo_contenido: "post" | "reel" | "property";
  contenido_id: string;
  publicado_por: string;
  vistas_count: number;
  likes_count: number;
  comentarios_count: number;
  compartidos_count: number;
  guardados_count: number;
  visibilidad: string;
  publicado_en: string;
  deleted_at: string | null;
  created_at: string;
};
