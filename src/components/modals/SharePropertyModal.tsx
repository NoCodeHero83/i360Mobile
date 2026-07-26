import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";
import { pdfService } from "../../services/pdfService";
import { useShare } from "../../hooks";
import { Modal } from "@/design-system/components";
import { useToast } from "../../context/ToastContext";
import { logger } from "@/utils/logger";

const log = logger.scoped("SharePropertyModal");

//////////////////////////////////////
// URL a futuro:
// https://ilyroxox.app/property/${propertyId}
// https://ilyroxox.app/post/${postId}
// https://ilyroxox0.app/reel/${reelId}
//////////////////////////////////////

interface SharePropertyModalProps {
  visible: boolean;
  onClose: () => void;
  propertyTitle: string;
  propertyId: string;
  shareCode?: string;
  feedItemId?: string;
  shareDescription?: string;
  shareImageUrl?: string;
  onShared?: () => void;
}

const SharePropertyModal: React.FC<SharePropertyModalProps> = ({
  visible,
  onClose,
  propertyTitle,
  propertyId,
  shareCode,
  feedItemId,
  shareDescription,
  shareImageUrl,
  onShared,
}) => {
  const [activeTab, setActiveTab] = useState<"con" | "sin">("con");
  const [downloading, setDownloading] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      cancelledRef.current = true;
    }
  }, [visible]);

  const { shareContent } = useShare();
  const { showToast } = useToast();

  const handleShare = async () => {
    const success = await shareContent({
      feedItemId: feedItemId || propertyId,
      shareId: shareCode || propertyId,
      type: "property",
      title: propertyTitle,
      description: shareDescription || "Mira esta propiedad en ilyrox",
      imageUrl: shareImageUrl,
    });

    if (success) {
      onShared?.();
      onClose();
    }
  };

  const downloadPdf = async (includeAllData: boolean = true) => {
    if (downloading || cancelledRef.current) return;
    setDownloading(true);
    cancelledRef.current = false;
    try {
      const result = await pdfService.generateAndOpenPropertyPdf(
        propertyId,
        includeAllData,
        cancelledRef,
      );

      if (cancelledRef.current) return;

      if (!result?.opened && result?.filePath) {
        showToast("PDF generado correctamente", "success");
      }

      if (!cancelledRef.current) {
        onClose();
      }
    } catch (e: any) {
      if (cancelledRef.current) return;
      log.error("Error generating PDF:", e);
      showToast(e?.message || "No se pudo generar el PDF", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      variant="bottom"
      title="Compartir Propiedad"
      contentStyle={styles.container}
    >
      <View style={styles.body}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "con" && styles.tabBtnActive]}
            onPress={() => setActiveTab("con")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "con" && styles.tabTextActive,
              ]}
            >
              Con datos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === "sin" && styles.tabBtnActive]}
            onPress={() => setActiveTab("sin")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "sin" && styles.tabTextActive,
              ]}
            >
              Sin datos
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.tabDescription}>
          {activeTab === "con"
            ? "Incluye todos los datos de la propiedad e información del agente."
            : "PDF simplificado sin información de contacto."}
        </Text>

        {activeTab === "con" ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>Compartir propiedad</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                downloading && styles.actionBtnDisabled,
                { marginBottom: 30 },
              ]}
              onPress={() => downloadPdf(true)}
              activeOpacity={0.85}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.actionText}>Generando PDF...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download" size={18} color={COLORS.primary} />
                  <Text style={styles.actionText}>
                    Descargar PDF completo
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                downloading && styles.actionBtnDisabled,
                { marginBottom: 30 },
              ]}
              onPress={() => downloadPdf(false)}
              activeOpacity={0.85}
              disabled={downloading}
            >
              {downloading ? (
                <>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={styles.actionText}>Generando PDF...</Text>
                </>
              ) : (
                <>
                  <Ionicons name="download" size={18} color={COLORS.primary} />
                  <Text style={styles.actionText}>
                    Descargar PDF simplificado
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    // bottom-sheet provisto por primitivo
  },
  body: {
    padding: 16,
    paddingTop: 12,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTransparent,
  },
  tabText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  tabDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  actions: {
    gap: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actionBtnDisabled: {
    opacity: 0.6,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textPrimary,
  },
});

export default SharePropertyModal;
