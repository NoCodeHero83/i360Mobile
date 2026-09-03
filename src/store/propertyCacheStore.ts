import { create } from "zustand";

export interface CachedPropertyData {
  id: string;
  tipo?: string;
  subtipo?: string;
  titulo?: string;
  calle?: string;
  numero_exterior?: string;
  ciudad?: string;
  estado?: string;
  precio_venta?: number;
  precio_renta?: number;
  moneda?: string;
  fotos?: any;
  habitaciones?: number;
  banos?: number;
  medios_banos?: number;
  estacionamientos?: number;
  metros_construccion?: number;
  metros_terreno?: number;
  descripcion?: string;
  operaciones?: any[];
  perfil?: any;
  amenidades?: any[];
  [key: string]: any;
}

interface CachedProperty {
  data: CachedPropertyData;
  timestamp: number;
}

interface PropertyCacheStore {
  cache: Map<string, CachedProperty>;
  setProperty: (id: string, data: CachedPropertyData) => void;
  getProperty: (id: string) => CachedPropertyData | null;
  invalidateProperty: (id: string) => void;
  clearExpired: (maxAgeMs: number) => void;
  clearAll: () => void;
}

const STALE_TIME_MS = 5 * 60 * 1000;

export const usePropertyCacheStore = create<PropertyCacheStore>((set, get) => ({
  cache: new Map(),

  setProperty: (id, data) =>
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.set(id, { data, timestamp: Date.now() });
      return { cache: newCache };
    }),

  getProperty: (id) => {
    const cached = get().cache.get(id);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > STALE_TIME_MS) {
      get().invalidateProperty(id);
      return null;
    }
    return cached.data;
  },

  invalidateProperty: (id) =>
    set((state) => {
      const newCache = new Map(state.cache);
      newCache.delete(id);
      return { cache: newCache };
    }),

  clearExpired: (maxAgeMs) =>
    set((state) => {
      const newCache = new Map(state.cache);
      const now = Date.now();
      for (const [id, cached] of newCache) {
        if (now - cached.timestamp > maxAgeMs) {
          newCache.delete(id);
        }
      }
      return { cache: newCache };
    }),

  clearAll: () => set({ cache: new Map() }),
}));
