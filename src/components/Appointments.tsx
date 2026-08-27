import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppHeader } from "./AppHeader";
import { RatingModal } from "./RatingModal";
import { COLORS } from "../constants/colors";
import { ScreenWrapper } from "@/screens/ScreenWrapper";
import { useAuth } from "@/context/AuthContext";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { useAppointments } from "../hooks/useAppointments";
import AppointmentTabs from "./Appointments/AppointmentTabs";
import AppointmentList from "./Appointments/AppointmentList";

const Appointments: React.FC = () => {
  const { profile } = useAuth();
  const {
    connect,
    disconnect,
    isConnected,
    loading: calendarLoading,
  } = useGoogleCalendar(profile?.id);
  const {
    activeTab,
    setActiveTab,
    appointments,
    loading,
    showRateModal,
    handleMarkComplete,
    handleMarkCancel,
    handleOpenRating,
    handleSyncCalendar,
    handleSubmitRating,
    handleContactPress,
    handlePropertyPress,
    handleUserPress,
    closeRatingModal,
    rateTarget,
  } = useAppointments();

  return (
    <ScreenWrapper withHeader={false} style={styles.container}>
      <AppHeader
        title="Citas"
        showBackButton
        onBack={() => router.push("/(tabs)")}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.calendarPanel}>
          <View style={styles.calendarPanelText}>
            <Text style={styles.calendarTitle}>Google Calendar</Text>
            <Text style={styles.calendarSubtitle}>
              {isConnected
                ? "Tus citas pueden sincronizarse con tu calendario."
                : "Conecta tu cuenta para guardar tus citas en Calendar."}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.calendarButton,
              isConnected && styles.calendarButtonConnected,
            ]}
            onPress={isConnected ? disconnect : connect}
            disabled={calendarLoading}
          >
            <Ionicons
              name={isConnected ? "checkmark-circle" : "link-outline"}
              size={16}
              color={isConnected ? COLORS.primaryDark : COLORS.white}
            />
            <Text
              style={[
                styles.calendarButtonText,
                isConnected && styles.calendarButtonTextConnected,
              ]}
            >
              {isConnected ? "Conectado" : "Conectar"}
            </Text>
          </TouchableOpacity>
        </View>

        <AppointmentTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <AppointmentList
          loading={loading}
          appointments={appointments}
          activeTab={activeTab}
          onMarkComplete={handleMarkComplete}
          onMarkCancel={handleMarkCancel}
          onOpenRating={handleOpenRating}
          onSyncCalendar={handleSyncCalendar}
          onContact={handleContactPress}
          onPropertyPress={handlePropertyPress}
          onUserPress={handleUserPress}
        />
      </ScrollView>

      <RatingModal
        visible={showRateModal}
        onClose={closeRatingModal}
        onSubmit={handleSubmitRating}
        target={rateTarget}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  calendarPanel: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    padding: 16,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  calendarPanelText: {
    flex: 1,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  calendarSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  calendarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  calendarButtonConnected: {
    backgroundColor: COLORS.primaryTransparent,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  calendarButtonText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  calendarButtonTextConnected: {
    color: COLORS.primaryDark,
  },
});

export default Appointments;