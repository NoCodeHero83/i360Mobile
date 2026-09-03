import { supabase } from "../lib/supabase";
import { useModal } from "@/context/ModalContext";
import { useToast } from "@/context/ToastContext";
import { googleCalendarService } from "@/services/googleCalendarService";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { logger } from "@/utils/logger";

const log = logger.scoped("useAppointment");

const useAppointment = (userId?: string | null) => {
  const { showModal } = useModal();
  const { showToast } = useToast();
  const { ensureConnection } = useGoogleCalendar(userId);

  const handleCancelAppointment = async (
    id: string,
    googleEventId?: string | null,
    googleOwnerId?: string | null,
  ): Promise<boolean> => {
    try {
      if (googleEventId) {
        try {
          const result = await googleCalendarService.syncAppointmentOnServer(
            "delete",
            id,
          );
          if (!result?.ok) {
            throw new Error(result?.skipped || "server_calendar_delete_skipped");
          }
        } catch (serverError) {
          log.warn("Server Google Calendar delete failed", serverError);
          if (googleOwnerId && userId !== googleOwnerId) {
            showToast(
              "Cita cancelada en Ilyrox. El asesor debe reconectar Google Calendar para cancelar el evento externo.",
              "info",
            );
          } else {
            const connection = await ensureConnection();
            if (connection) {
              await googleCalendarService.deleteEvent(connection, googleEventId);
              await googleCalendarService.clearEventFromAppointment(id);
            } else {
              showToast(
                "Cita cancelada en Ilyrox. El asesor debe reconectar Google Calendar para cancelar el evento externo.",
                "info",
              );
            }
          }
        }
      }

      const { error } = await supabase
        .from("citas")
        .update({
          estado: "cancelada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      showModal({
        title: "Éxito",
        message: "Cita ha sido cancelada exitosamente",
        confirmText: "OK",
      });
      return true;
    } catch (error) {
      log.error("Error canceling appointment:", error);
      showModal({
        title: "Error",
        message: "No se pudo cancelar la cita",
        confirmText: "OK",
      });
      return false;
    }
  };

  return {
    handleCancelAppointment,
  };
};

export default useAppointment;