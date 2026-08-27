/**
 * CreateAppointmentModal.tsx
 * Modal para crear citas desde el chat
 */

import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "../../constants";
import { useModal } from "../../context/ModalContext";
import { useToast } from "../../context/ToastContext";
import { appointmentService } from "@/services/appointmentService";
import { googleCalendarService } from "@/services/googleCalendarService";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { logger } from "@/utils/logger";
import DatePickerField from "./DatePickerField";
import TimePickerField from "./TimePickerField";
import AppointmentTypeSelector from "./AppointmentTypeSelector";
import { createAppointmentStyles as styles } from "./createAppointmentStyles";

const log = logger.scoped("CreateAppointmentModal");

interface CreateAppointmentModalProps {
  visible: boolean;
  onClose: () => void;
  propertyId: string;
  otherUserId: string;
  currentUserId: string;
}

export default function CreateAppointmentModal({
  visible,
  onClose,
  propertyId,
  otherUserId,
  currentUserId,
}: CreateAppointmentModalProps) {
  const insets = useSafeAreaInsets();
  const { showModal } = useModal();
  const { showToast } = useToast();
  const { ensureConnection } = useGoogleCalendar(currentUserId);
  const scrollRef = useRef<ScrollView>(null);

  const [fechaText, setFechaText] = useState("");
  const [horaText, setHoraText] = useState("");
  const [tipo, setTipo] = useState<string>("visita");
  const [descripcion, setDescripcion] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  React.useEffect(() => {
    if (visible) {
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const year = tomorrow.getFullYear();
      const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
      const day = String(tomorrow.getDate()).padStart(2, "0");
      setFechaText(`${year}-${month}-${day}`);
      setHoraText("09:00");
    }
  }, [visible]);

  const validateDate = (dateStr: string): boolean => {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return date >= today;
  };

  const validateTime = (timeStr: string): boolean => {
    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(timeStr);
  };

  const determineRoles = () =>
    appointmentService.resolveRoles(currentUserId, otherUserId);

  const resetForm = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const day = String(tomorrow.getDate()).padStart(2, "0");
    setFechaText(`${year}-${month}-${day}`);
    setHoraText("09:00");
    setTipo("visita");
    setDescripcion("");
  };

  const handleCreateAppointment = async () => {
    if (!validateDate(fechaText)) {
      showModal({
        title: "Error",
        message:
          "Fecha inválida. Usa formato YYYY-MM-DD y asegúrate que no sea anterior a hoy",
        confirmText: "OK",
      });
      return;
    }

    if (!validateTime(horaText)) {
      showModal({
        title: "Error",
        message: "Hora inválida. Usa formato HH:MM (24 horas)",
        confirmText: "OK",
      });
      return;
    }

    try {
      setIsCreating(true);

      const { agenteId, clienteId } = await determineRoles();

      if (agenteId === clienteId) {
        showModal({
          title: "Error",
          message: "No se puede crear una cita con el mismo usuario",
          confirmText: "OK",
        });
        return;
      }

      const horaStr = `${horaText}:00`;

      const createdAppointment = await appointmentService.createAppointment({
        propertyId,
        agenteId,
        clienteId,
        createdBy: currentUserId,
        fecha: fechaText,
        hora: horaStr,
        tipo,
        descripcion: descripcion.trim() || null,
      });

      let propertyTitle = "";
      let location = "";
      let otherUserName = "";

      try {
        const propInfo =
          await appointmentService.getPropertyCalendarInfo(propertyId);
        if (propInfo) {
          propertyTitle = propInfo.titulo;
          location = propInfo.location;
        }

        const userData = await appointmentService.getUserBasicInfo(otherUserId);
        if (userData) {
          otherUserName =
            `${userData.nombre} ${userData.apellido_paterno}`.trim();
        }
      } catch (err) {
        log.warn("Could not fetch details for calendar", err);
      }

      if (currentUserId === agenteId) {
        try {
          const connection = await ensureConnection();
          if (connection) {
            const event = await googleCalendarService.createEvent(connection, {
              id: createdAppointment.id,
              fecha: fechaText,
              hora: horaStr,
              tipo,
              descripcion: descripcion.trim() || null,
              propertyTitle,
              location,
              otherUserName,
            });
            await googleCalendarService.attachEventToAppointment(
              createdAppointment.id,
              event.id,
            );
            showToast(
              "Cita creada y sincronizada con Google Calendar",
              "success",
            );
          } else {
            showToast("Cita creada exitosamente", "success");
          }
        } catch (calendarError) {
          log.warn("Could not sync appointment with Google Calendar", calendarError);
          showToast(
            "La cita se creó, pero no se pudo sincronizar con Google Calendar",
            "info",
          );
        }
      } else {
        showToast("Cita creada exitosamente", "success");
      }

      onClose();
      resetForm();
    } catch (error: any) {
      log.error("Error creating appointment:", error);
      showToast(error.message || "Error al crear la cita", "error");
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputFocus = (_y?: number) => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 300);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayBackground}
          activeOpacity={1}
          onPress={onClose}
        />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <View style={styles.container}>
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <Ionicons name="calendar" size={22} color={COLORS.primary} />
                <Text style={styles.title}>Nueva Cita</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={isCreating}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              bounces
            >
              <DatePickerField
                fechaText={fechaText}
                onDateChange={setFechaText}
                disabled={isCreating}
              />

              <TimePickerField
                horaText={horaText}
                onTimeChange={setHoraText}
                disabled={isCreating}
              />

              <AppointmentTypeSelector
                selectedType={tipo}
                onTypeChange={setTipo}
                disabled={isCreating}
              />

              <View style={styles.field}>
                <Text style={styles.label}>
                  <Ionicons
                    name="document-text-outline"
                    size={14}
                    color={COLORS.textSecondary}
                  />
                  {"  "}Detalles adicionales
                  <Text style={styles.optionalLabel}> (opcional)</Text>
                </Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Escribe detalles sobre la cita..."
                  placeholderTextColor={COLORS.textTertiary}
                  value={descripcion}
                  onChangeText={setDescripcion}
                  multiline
                  numberOfLines={4}
                  editable={!isCreating}
                  textAlignVertical="top"
                  onFocus={() => handleInputFocus(350)}
                />
              </View>

              <View style={{ height: 250 }} />
            </ScrollView>

            <View
              style={[
                styles.footer,
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={onClose}
                disabled={isCreating}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonSecondaryText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  isCreating && styles.buttonDisabled,
                ]}
                onPress={handleCreateAppointment}
                disabled={isCreating}
                activeOpacity={0.8}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={COLORS.white}
                    />
                    <Text style={styles.buttonPrimaryText}>Crear Cita</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}