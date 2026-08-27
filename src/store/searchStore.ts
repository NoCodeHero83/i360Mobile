import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import type { TipoBusqueda } from '@/types';
import type { PropertyFilters } from './propertyFiltersStore';

export const TIPO_BUSQUEDA = {
  DRAFT: 'draft' as const,
  UBICACION: 'ubicacion' as const,
  POST: 'post' as const,
  REEL: 'reel' as const,
  USUARIO: 'usuario' as const,
  PROPIEDAD: 'propiedad' as const,
};

export type ResultData = {
  name?: string;
  type?: string;
  estado?: string;
  municipio?: string;
  placeId?: string;
  filtros?: PropertyFilters;
  tipo?: TipoBusqueda;
  resultadoTitulo?: string;
  resultadoSubtitulo?: string;
  resultadoTipoId?: string;
};

interface SearchStore {
  currentSearchId: string | null;
  currentQuery: string;
  isUpdating: boolean;
  
  startSearch: (query: string, userId: string) => Promise<string>;
  createSearchFromMap: (filtros: PropertyFilters, ubicacion?: { estado?: string; municipio?: string; colonia?: string; placeName?: string }, userId?: string) => Promise<string>;
  updateSearchWithResult: (id: string, resultData: ResultData, userId: string) => Promise<void>;
  updateSearchWithFilters: (id: string, filtros: PropertyFilters, userId: string) => Promise<void>;
  touchTimestamp: (id: string, userId: string) => Promise<void>;
  completeSearch: (id: string, userId: string) => Promise<void>;
  clearSearch: () => void;
  setCurrentSearchId: (id: string | null) => void;
}

const extractPreview = (filtros: PropertyFilters) => ({
  tipo_propiedad: filtros.tipoPropiedad || null,
  tipo_operacion: filtros.operacion || null,
  precio_min: filtros.precioMin ? parseFloat(filtros.precioMin) : null,
  precio_max: filtros.precioMax ? parseFloat(filtros.precioMax) : null,
  moneda: filtros.moneda || 'MXN',
  habitaciones: filtros.habitaciones || null,
  banos: filtros.banos || null,
  estacionamientos: filtros.estacionamientos || null,
});

export const useSearchStore = create<SearchStore>((set, get) => ({
  currentSearchId: null,
  currentQuery: '',
  isUpdating: false,

  startSearch: async (query: string, userId: string): Promise<string> => {
    console.log('🔍 [SearchStore] startSearch:', query);
    
    const { data, error } = await supabase
      .from('historial_busquedas')
      .insert({
        usuario_id: userId,
        query_original: query,
        tipo_busqueda: TIPO_BUSQUEDA.DRAFT,
        filtros_completos: {},
        completa: false,
      })
      .select('id')
      .single();

    if (error) {
      console.error('🔍 [SearchStore] Error creating search:', error);
      throw error;
    }

    set({ currentSearchId: data.id, currentQuery: query });
    console.log('🔍 [SearchStore] Search created with ID:', data.id);
    
    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
    
    return data.id;
  },

  createSearchFromMap: async (
    filtros: PropertyFilters,
    ubicacion?: { estado?: string; municipio?: string; colonia?: string; placeName?: string },
    userId?: string
  ): Promise<string> => {
    if (!userId) throw new Error('User not authenticated');

    console.log('🔍 [SearchStore] createSearchFromMap with filtros');
    const preview = extractPreview(filtros);
    const queryOriginal = ubicacion?.placeName || ubicacion?.colonia || ubicacion?.municipio || ubicacion?.estado || null;

    const { data, error } = await supabase
      .from('historial_busquedas')
      .insert({
        usuario_id: userId,
        query_original: queryOriginal,
        tipo_busqueda: TIPO_BUSQUEDA.UBICACION,
        filtros_completos: filtros as any,
        completa: false,
        estado: ubicacion?.estado || null,
        municipio: ubicacion?.municipio || null,
        colonia: ubicacion?.colonia || null,
        place_name: ubicacion?.placeName || null,
        ...preview,
      })
      .select('id')
      .single();

    if (error) {
      console.error('🔍 [SearchStore] Error creating search from map:', error);
      throw error;
    }

    set({ currentSearchId: data.id });
    console.log('🔍 [SearchStore] Search from map created with ID:', data.id);
    
    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
    
    return data.id;
  },

  updateSearchWithResult: async (id: string, resultData: ResultData, userId: string): Promise<void> => {
    console.log('🔍 [SearchStore] updateSearchWithResult:', id, resultData);
    set({ isUpdating: true });

    const estado = resultData.estado || '';
    const municipio = resultData.municipio || '';
    const colonia = resultData.type === 'colonia' ? (resultData.name || '') : '';
    const placeName = resultData.name || '';

    const filtrosParciales: PropertyFilters = resultData.filtros || {
      tipoPropiedad: '',
      subtipo: [],
      precioMin: '',
      precioMax: '',
      moneda: 'MXN',
      operacion: '',
      locationFilter: { estado, ciudad: '', municipio, colonia },
      habitaciones: '',
      banos: '',
      mediosBanos: '',
      estacionamientos: '',
      antiguedad: '',
      niveles: '',
      m2TerrenoMin: '',
      m2ConstruccionMin: '',
      anchoTerrenoMin: '',
      largoTerrenoMin: '',
      comisionVentaMin: '',
      comisionRentaMin: '',
      amenidades: [],
      polygons: [],
      locationChips: [],
      comercialFilters: {
        tipoUbicacion: [],
        frenteMin: '',
        nivel: '',
        sobreAvenidaPrincipal: false,
        enEsquina: false,
        altaVisibilidad: false,
        altoFlujoVehicular: false,
      },
      industrialFilters: {
        ubicacion: [],
        alturaLibre: '',
        energiaKva: [],
        areaOficinasMin: '',
        patioManiobrasMin: '',
      },
      agricolaFilters: {
        tiposAgua: [],
        concesionAgua: false,
        usoTerreno: [],
        tipoRiego: [],
        electricidad: false,
        caminoAcceso: false,
        cercado: false,
        pieCarretera: false,
        accesCamiones: false,
      },
    };

    const updateData: Record<string, any> = {
      place_name: placeName || null,
      estado: estado || null,
      municipio: municipio || null,
      colonia: colonia || null,
      filtros_completos: filtrosParciales as any,
      updated_at: new Date().toISOString(),
    };

    if (resultData.tipo) {
      updateData.tipo_busqueda = resultData.tipo;
    }
    if (resultData.resultadoTitulo) {
      updateData.resultado_titulo = resultData.resultadoTitulo;
    }
    if (resultData.resultadoSubtitulo) {
      updateData.resultado_subtitulo = resultData.resultadoSubtitulo;
    }
    if (resultData.resultadoTipoId) {
      updateData.resultado_tipo_id = resultData.resultadoTipoId;
    }

    const { error } = await supabase
      .from('historial_busquedas')
      .update(updateData)
      .eq('id', id)
      .eq('usuario_id', userId);

    set({ isUpdating: false });

    if (error) {
      console.error('🔍 [SearchStore] Error updating search:', error);
      throw error;
    }

    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
  },

  updateSearchWithFilters: async (id: string, filtros: PropertyFilters, userId: string): Promise<void> => {
    console.log('🔍 [SearchStore] updateSearchWithFilters:', id);
    
    const preview = extractPreview(filtros);
    const updateData = {
      filtros_completos: filtros as any,
      updated_at: new Date().toISOString(),
      ...preview,
    };

    const { error } = await supabase
      .from('historial_busquedas')
      .update(updateData)
      .eq('id', id)
      .eq('usuario_id', userId);

    if (error) {
      console.error('🔍 [SearchStore] Error updating filters:', error);
    }

    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
  },

  touchTimestamp: async (id: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('historial_busquedas')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('usuario_id', userId);

    if (error) {
      console.error('🔍 [SearchStore] Error touching timestamp:', error);
    }

    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
  },

  completeSearch: async (id: string, userId: string): Promise<void> => {
    const { error } = await supabase
      .from('historial_busquedas')
      .update({
        completa: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('usuario_id', userId);

    if (error) {
      console.error('🔍 [SearchStore] Error completing search:', error);
      throw error;
    }

    // Invalidar queries de historial para refrescar UI
    queryClient.invalidateQueries({ queryKey: ['searchHistory'] });
  },

  clearSearch: () => {
    set({ currentSearchId: null, currentQuery: '', isUpdating: false });
  },

  setCurrentSearchId: (id: string | null) => {
    set({ currentSearchId: id });
  },
}));
