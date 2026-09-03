export type AppointmentStatus = "pending" | "completed" | "cancelled" | "rated";

export interface FeatureRatings {
    profesionalismo: number;
    etica_valores: number;
    pago_comisiones: number;
    comunicacion_servicio: number;
}

export interface RatingTarget {
    id: string;
    name: string;
    avatar: string | null;
    phone?: string | null;
    location?: string | null;
}

export interface AppointmentItem {
    id: string;
    fecha: string;
    hora: string;
    tipo: string;
    descripcion: string | null;
    estado: string;
    agente_id: string;
    cliente_id: string;
    created_by?: string | null;
    propiedad_id: string;
    user: {
        id: string;
        name: string;
        avatar: string | null;
        role: string;
        email?: string | null;
    };
    propertyId?: string;
    propertyTitle?: string;
    propertyImage?: string;
    location: string;
    date: string;
    time: string;
    status: AppointmentStatus;
    rating?: number;
    hasUserRated?: boolean;
    featureRatings?: FeatureRatings;
    google_event_id?: string | null;
    google_calendar_id?: string | null;
    google_last_synced_at?: string | null;
    agente?: {
        id: string;
        nombre: string;
        apellido_paterno: string;
        foto: string | null;
        prefijo_celular?: string | null;
        celular?: string | null;
    };
    cliente?: {
        id: string;
        nombre: string;
        apellido_paterno: string;
        foto: string | null;
        prefijo_celular?: string | null;
        celular?: string | null;
    };
}