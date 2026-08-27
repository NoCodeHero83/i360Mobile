import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppointmentCard } from "../AppointmentCard";
import { COLORS } from "../../constants/colors";
import { AppointmentItem } from "./appointmentTypes";

interface AppointmentListProps {
    loading: boolean;
    appointments: AppointmentItem[];
    activeTab: "upcoming" | "past";
    onMarkComplete: (id: string) => void;
    onMarkCancel: (id: string) => void;
    onOpenRating: (id: string) => void;
    onSyncCalendar: (id: string) => void;
    onContact: (id: string) => void;
    onPropertyPress: (id: string) => void;
    onUserPress: (id: string) => void;
}

const AppointmentList: React.FC<AppointmentListProps> = ({
    loading,
    appointments,
    activeTab,
    onMarkComplete,
    onMarkCancel,
    onOpenRating,
    onSyncCalendar,
    onContact,
    onPropertyPress,
    onUserPress,
}) => {
    if (loading) {
        return (
            <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Cargando citas...</Text>
            </View>
        );
    }

    if (appointments.length === 0) {
        return (
            <View style={styles.emptyState}>
                <Ionicons
                    name="calendar-outline"
                    size={64}
                    color={COLORS.textDisabled}
                />
                <Text style={styles.emptyText}>
                    No hay citas{" "}
                    {activeTab === "upcoming" ? "próximas" : "en el historial"}
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.list}>
            {appointments.map((appt) => (
                <AppointmentCard
                    key={appt.id}
                    appointment={appt}
                    onMarkComplete={onMarkComplete}
                    onMarkCancel={onMarkCancel}
                    onOpenRating={onOpenRating}
                    onSyncCalendar={onSyncCalendar}
                    onContact={onContact}
                    activeTab={activeTab}
                    onPropertyPress={onPropertyPress}
                    onUserPress={onUserPress}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    loadingState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 60,
    },
    loadingText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 12,
    },
    emptyState: {
        alignItems: "center",
        paddingVertical: 60,
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        borderStyle: "dashed",
    },
    emptyText: {
        marginTop: 16,
        color: COLORS.textTertiary,
        fontSize: 14,
    },
    list: {
        gap: 16,
    },
});

export default AppointmentList;