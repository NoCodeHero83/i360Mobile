import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("appointmentService");

export type AppointmentType = "visita" | "llamada" | "videollamada" | string;
export type AppointmentStatus =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada";

export interface CreateAppointmentInput {
  propertyId: string;
  agenteId: string;
  clienteId: string;
  createdBy: string;
  fecha: string;
  hora: string;
  tipo: AppointmentType;
  descripcion?: string | null;
}

export interface PropertyCalendarInfo {
  titulo: string;
  location: string;
}

export interface UserBasicInfo {
  nombre: string;
  apellido_paterno: string;
}

export const appointmentService = {
  async getUserRole(userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("perfiles")
      .select("rol")
      .eq("id", userId)
      .single();

    if (error) {
      log.warn("getUserRole failed", { userId, error });
      return null;
    }
    return data?.rol ?? null;
  },

  async resolveRoles(currentUserId: string, otherUserId: string) {
    const [currentRole, otherRole] = await Promise.all([
      appointmentService.getUserRole(currentUserId),
      appointmentService.getUserRole(otherUserId),
    ]);

    if (currentRole === "agente") {
      return { agenteId: currentUserId, clienteId: otherUserId };
    }
    if (otherRole === "agente") {
      return { agenteId: otherUserId, clienteId: currentUserId };
    }
    return { agenteId: currentUserId, clienteId: otherUserId };
  },

  async createAppointment(input: CreateAppointmentInput) {
    const { data, error } = await supabase
      .from("citas")
      .insert({
        propiedad_id: input.propertyId,
        agente_id: input.agenteId,
        cliente_id: input.clienteId,
        created_by: input.createdBy,
        fecha: input.fecha,
        hora: input.hora,
        tipo: input.tipo,
        descripcion: input.descripcion ?? null,
        estado: "pendiente" as AppointmentStatus,
      })
      .select()
      .single();

    if (error) {
      log.error("createAppointment failed", error);
      throw error;
    }
    return data;
  },

  async getPropertyCalendarInfo(
    propertyId: string,
  ): Promise<PropertyCalendarInfo | null> {
    if (!propertyId) return null;

    const { data, error } = await supabase
      .from("propiedades")
      .select("tipo, subtipo, calle, numero_exterior, ciudad, codigo_postal")
      .eq("id", propertyId)
      .single();

    if (error || !data) {
      log.warn("getPropertyCalendarInfo failed", { propertyId, error });
      return null;
    }

    const parts = [data.calle, data.numero_exterior, data.ciudad, data.codigo_postal]
      .filter(Boolean)
      .join(", ");

    return {
      titulo:
        [data.tipo, data.subtipo, data.ciudad].filter(Boolean).join(" en ") ||
        "Propiedad",
      location: parts,
    };
  },

  async getUserBasicInfo(userId: string): Promise<UserBasicInfo | null> {
    const { data, error } = await supabase
      .from("perfiles")
      .select("nombre, apellido_paterno")
      .eq("id", userId)
      .single();

    if (error || !data) {
      log.warn("getUserBasicInfo failed", { userId, error });
      return null;
    }
    return {
      nombre: data.nombre ?? "",
      apellido_paterno: data.apellido_paterno ?? "",
    };
  },
};