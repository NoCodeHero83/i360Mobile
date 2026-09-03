import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useModal } from "../context/ModalContext";
import { useChatInitiator } from "../hooks/messaging/useChatInitiator";
import useAppointment from "../hooks/useAppointment";
import { router } from "expo-router";
import {
    AppointmentItem,
    AppointmentStatus,
    FeatureRatings,
    RatingTarget,
} from "../components/Appointments/appointmentTypes";
import { profileService } from "../services/profileService";
import { formatPhoneNumber } from "../components/Profile/profileFormatters";
import { googleCalendarService } from "@/services/googleCalendarService";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { logger } from "@/utils/logger";

const log = logger.scoped("useAppointments");

export const useAppointments = () => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { showModal } = useModal();
    const { handleContact } = useChatInitiator();
    const { ensureConnection } = useGoogleCalendar(profile?.id);
    const { handleCancelAppointment } = useAppointment(profile?.id);

    const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
    const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showRateModal, setShowRateModal] = useState(false);
    const [rateApptId, setRateApptId] = useState<string | null>(null);
    const [editingAppointment, setEditingAppointment] =
        useState<AppointmentItem | null>(null);

    useEffect(() => {
        if (profile?.id) {
            loadAppointments();
        }
    }, [profile?.id, activeTab]);

    const loadAppointments = async () => {
        if (!profile?.id) return;

        try {
            setLoading(true);

            let query = supabase
                .from("citas")
                .select(
                    `
          *,
          agente:perfiles!agente_id(id, nombre, apellido_paterno, foto, rol, prefijo_celular, celular, email),
          cliente:perfiles!cliente_id(id, nombre, apellido_paterno, foto, rol, prefijo_celular, celular, email),
          propiedad:propiedades(id, tipo, subtipo, ciudad, fotos),
          resenas:resenas(id, revisor_id, calificacion_general)
        `,
                )
                .or(`agente_id.eq.${profile.id},cliente_id.eq.${profile.id}`)
                .is("deleted_at", null);

            if (activeTab === "upcoming") {
                query = query
                    .eq("estado", "pendiente")
                    .gte("fecha", new Date().toISOString().split("T")[0]);
            } else {
                query = query.or(
                    `estado.in.(completada,cancelada),fecha.lt.${new Date().toISOString().split("T")[0]
                    }`,
                );
            }

            query = query.order("fecha", { ascending: activeTab === "upcoming" });
            query = query.order("hora", { ascending: activeTab === "upcoming" });

            const { data, error } = await query;

            if (error) throw error;

            const transformedData: AppointmentItem[] = (data || []).map(
                (cita: any) => {
                    const isAgente = cita.agente_id === profile.id;
                    const otherUser = isAgente ? cita.cliente : cita.agente;

                    const userReview = (cita.resenas || []).find(
                        (resena: any) => resena.revisor_id === profile.id,
                    );

                    const hasUserRated = !!userReview;

                    return {
                        ...cita,
                        user: {
                            id: otherUser.id,
                            name: `${otherUser.nombre || ""} ${otherUser.apellido_paterno || ""
                                }`.trim(),
                            avatar: otherUser.foto,
                            role: isAgente ? "Cliente" : "Agente",
                            email: otherUser.email,
                        },
                        propertyId: cita.propiedad_id,
                        propertyTitle: cita.propiedad
                            ? `${cita.propiedad.tipo} en ${cita.propiedad.ciudad}`
                            : undefined,
                        propertyImage: cita.propiedad?.fotos?.[0],
                        location: cita.propiedad?.ciudad || "No especificado",
                        date: formatDate(cita.fecha),
                        time: formatTime(cita.hora),
                        status: cita.estado as AppointmentStatus,
                        hasUserRated,
                        rating: userReview?.calificacion_general,
                    };
                },
            );

            setAppointments(transformedData);
        } catch (error: any) {
            log.error("Error loading appointments:", error);
            showToast(error.message || "Error al cargar las citas", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!profile?.id) return;

        const channel = supabase
            .channel(`appointments-list-${profile.id}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "citas",
                    filter: `agente_id=eq.${profile.id}`,
                },
                () => {
                    loadAppointments();
                },
            )
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "citas",
                    filter: `cliente_id=eq.${profile.id}`,
                },
                () => {
                    loadAppointments();
                },
            )
            .subscribe((status) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    log.warn("Realtime de lista de citas no disponible", status);
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [profile?.id, activeTab]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        date.setDate(date.getDate() + 1);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const dateOnly = date.toDateString();
        const todayOnly = today.toDateString();
        const tomorrowOnly = tomorrow.toDateString();

        if (dateOnly === todayOnly) return "Hoy";
        if (dateOnly === tomorrowOnly) return "Mañana";

        return date.toLocaleDateString("es-MX", {
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    };

    const formatTime = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(":");
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? "PM" : "AM";
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    };

    const handleMarkComplete = (id: string) => {
        handleOpenRating(id);
    };

    const handleMarkCancel = (id: string) => {
        showModal({
            title: "Cancelar Cita",
            message: "¿Estás seguro de que deseas cancelar esta cita? Esta acción no se puede deshacer.",
            confirmText: "Sí, cancelar",
            cancelText: "Volver",
            confirmVariant: "danger",
            // Pasar onCancel hace que el modal pinte el segundo botón ("Volver");
            // sin él, ConfirmationModal solo muestra el botón de confirmar.
            onCancel: () => {},
            onConfirm: async () => {
                const appointment = appointments.find((a) => a.id === id);
                const success = await handleCancelAppointment(
                    id,
                    appointment?.google_event_id,
                    appointment?.agente_id,
                );
                if (success) {
                    await loadAppointments();
                    showToast("Cita cancelada correctamente", "success");
                }
            },
        });
    };

    const handleSyncCalendar = async (id: string) => {
        const appointment = appointments.find((a) => a.id === id);
        if (!appointment || !profile?.id) return;

        try {
            if (profile.id === appointment.agente_id) {
                await ensureConnection();
            }

            const result = await googleCalendarService.syncAppointmentOnServer(
                appointment.google_event_id ? "update" : "create",
                appointment.id,
            );

            if (!result?.ok && profile.id !== appointment.agente_id) {
                showToast(
                    "El asesor debe conectar Google Calendar para sincronizar esta cita",
                    "info",
                );
                return;
            }

            if (!result?.ok) {
                const connection = await ensureConnection();
                if (!connection) return;

const payload = {
                    id: appointment.id,
                    fecha: appointment.fecha,
                    hora: appointment.hora,
                    tipo: appointment.tipo,
                    descripcion: appointment.descripcion,
                    propertyTitle: appointment.propertyTitle,
                    location: appointment.location,
                    otherUserName: appointment.user.name,
                    otherUserEmail: appointment.user.email,
                };

                const event = appointment.google_event_id
                    ? await googleCalendarService.updateEvent(
                        connection,
                        appointment.google_event_id,
                        payload,
                    )
                    : await googleCalendarService.createEvent(connection, payload);

                await googleCalendarService.attachEventToAppointment(
                    appointment.id,
                    event.id,
                );
            }
            await loadAppointments();
            showToast("Cita sincronizada con Google Calendar", "success");
        } catch (error: any) {
            log.warn("Error syncing Google Calendar:", error);
            showToast(
                error.message || "No se pudo sincronizar Google Calendar",
                "error",
            );
        }
    };

    const handleOpenRating = (id: string) => {
        setRateApptId(id);
        setShowRateModal(true);
    };

    const handleEditAppointment = (id: string) => {
        if (!profile?.id) return;

        const appointment = appointments.find((appt) => appt.id === id);
        if (!appointment) return;

        if (appointment.created_by !== profile.id) {
            showToast("Solo quien creó la cita puede editarla", "info");
            return;
        }

        setEditingAppointment(appointment);
    };

    const closeEditModal = () => {
        setEditingAppointment(null);
    };

    const handleAppointmentUpdated = async () => {
        await loadAppointments();
    };

    const handleSubmitRating = async (
        featureRatings: FeatureRatings,
        comentario: string,
        recomienda: boolean | null,
    ) => {
        if (!rateApptId || !profile?.id) return;

        try {
            const appointment = appointments.find((a) => a.id === rateApptId);
            if (!appointment) return;

            const profesionalId =
                appointment.agente_id === profile.id
                    ? appointment.cliente_id
                    : appointment.agente_id;

            // La calificación general la calcula el sistema (trigger en BD:
            // promedio simple de las 4 categorías).
            const { error: reviewError } = await supabase.from("resenas").insert({
                revisor_id: profile.id,
                profesional_id: profesionalId,
                cita_id: rateApptId,
                profesionalismo: featureRatings.profesionalismo,
                etica_valores: featureRatings.etica_valores,
                pago_comisiones: featureRatings.pago_comisiones,
                comunicacion_servicio: featureRatings.comunicacion_servicio,
                comentario: comentario.trim() || null,
                tipo_resena: "detallada",
                visible: true,
            });

            if (reviewError) throw reviewError;

            // La recomendación (¿Trabajarías nuevamente?) usa el mismo mecanismo
            // que el botón del perfil: tabla recomendaciones_usuarios.
            if (recomienda !== null && profesionalId) {
                try {
                    const current = await profileService.getUserRecommendation(
                        profile.id,
                        profesionalId,
                    );
                    // Fijar el valor (no alternar): solo insertar/actualizar si cambió.
                    if (current !== recomienda) {
                        await profileService.toggleRecommendation(
                            profile.id,
                            profesionalId,
                            current,
                            recomienda,
                        );
                    }
                } catch (recError) {
                    log.error("Error guardando recomendación:", recError);
                }
            }

            if (appointment.estado === "pendiente") {
                const { error: updateError } = await supabase
                    .from("citas")
                    .update({
                        estado: "completada",
                        completado_en: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", rateApptId);

                if (updateError) throw updateError;
            }

            showToast("Calificación enviada exitosamente", "success");
            setShowRateModal(false);
            setRateApptId(null);

            loadAppointments();
        } catch (error: any) {
            log.error("Error submitting rating:", error);
            showToast(error.message || "Error al enviar la calificación", "error");
            throw error;
        }
    };

    const handleContactPress = (id: string) => {
        const appointment = appointments.find((a) => a.id === id);
        if (!appointment || !profile?.id) return;

        const isAgente = appointment.agente_id === profile.id;
        const otherUser = isAgente ? appointment.cliente : appointment.agente;
        const otherUserId = isAgente
            ? appointment.cliente_id
            : appointment.agente_id;

        if (!otherUserId || !otherUser) {
            showToast("No se pudo identificar al usuario contactar", "error");
            return;
        }

        handleContact(
            otherUserId,
            appointment.propiedad_id || null,
            {
                id: otherUserId,
                nombre: otherUser.nombre,
                apellido_paterno: otherUser.apellido_paterno,
                foto: otherUser.foto,
            },
            true,
        );
    };

    const handlePropertyPress = (id: string) => {
        router.push(`/property/${id}`);
    };

    const handleUserPress = (id: string) => {
        router.push(`/user/${id}`);
    };

    const closeRatingModal = () => {
        setShowRateModal(false);
        setRateApptId(null);
    };

    // Datos del asesor a calificar (contraparte de la cita) para la tarjeta del modal.
    const rateTarget: RatingTarget | null = (() => {
        if (!rateApptId || !profile?.id) return null;
        const appt = appointments.find((a) => a.id === rateApptId);
        if (!appt) return null;
        const isAgente = appt.agente_id === profile.id;
        const other = isAgente ? appt.cliente : appt.agente;
        const otherId = isAgente ? appt.cliente_id : appt.agente_id;
        if (!other || !otherId) return null;
        const phone = formatPhoneNumber(
            other.prefijo_celular ?? null,
            other.celular ?? null,
        );
        return {
            id: otherId,
            name:
                `${other.nombre || ""} ${other.apellido_paterno || ""}`.trim() ||
                "Asesor",
            avatar: other.foto ?? null,
            phone: phone === "No especificado" ? null : phone,
            location:
                appt.location && appt.location !== "No especificado"
                    ? appt.location
                    : null,
        };
    })();

    return {
        activeTab,
        setActiveTab,
        appointments,
        loading,
        showRateModal,
        editingAppointment,
        rateTarget,
        handleMarkComplete,
        handleMarkCancel,
        handleOpenRating,
        handleEditAppointment,
        handleSyncCalendar,
        handleSubmitRating,
        handleAppointmentUpdated,
        handleContactPress,
        handlePropertyPress,
        handleUserPress,
        closeRatingModal,
        closeEditModal,
    };
};