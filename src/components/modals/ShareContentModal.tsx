import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  InteractionManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/colors";
import { pdfService } from "../../services/pdfService";
import { useShare } from "../../hooks";
import { Modal } from "@/design-system/components";
import { useToast } from "../../context/ToastContext";
import { logger } from "@/utils/logger";

const log = logger.scoped("ShareContentModal");

interface ShareContentModalProps {
  visible: boolean;
  onClose: () => void;
  feedItemType: "property" | "post" | "reel";
  contentTitle: string;
  contentId: string;
  shareCode?: string;
  feedItemId?: string;
  shareDescription?: string;
  shareImageUrl?: string;
  onShared?: () => void;
}

const ShareContentModal: React.FC<ShareContentModalProps> = ({
  visible,
  onClose,
  feedItemType,
  contentTitle,
  contentId,
  shareCode,
  feedItemId,
  shareDescription,
  shareImageUrl,
  onShared,
}) => {
  const [activeTab, setActiveTab] = useState<"con" | "sin">("con");
  const [downloading, setDownloading] = useState(false);

  const { shareContent } = useShare();
  const { showToast } = useToast();

  const isProperty = feedItemType === "property";
  const shareButtonLabel = isProperty
    ? "Compartir propiedad"
    : "Compartir publicación";

  const handleShare = async () => {
    const success = await shareContent({
      feedItemId: feedItemId || contentId,
      shareId: shareCode || contentId,
      type: feedItemType,
      title: contentTitle,
      description: shareDescription || "Mira esta propiedad en ilyrox",
      imageUrl: shareImageUrl,
      sinDatos: activeTab === "sin",
    });

    if (success) {
      onShared?.();
      onClose();
    }
  };

  /**
   * Descarga el PDF de la propiedad
   * @param includeAllData - true para "Con Datos", false para "Sin Datos"
   *
   * CONFIGURACION DE CAMPOS:
   * Para modificar qué campos se muestran en cada modo, edita los siguientes
   * objetos en services/pdfService.ts:
   *
   * - PDF_FIELD_CONFIG: Configuración base con todos los campos disponibles
   * - PDF_SIN_DATOS_OVERRIDE: Campos que se ocultan en modo "Sin Datos"
   *
   * Ejemplo para ocultar el precio en modo "Sin Datos":
   * export const PDF_SIN_DATOS_OVERRIDE = {
   *   ...
   *   showPrecio: false,
   * };
   */
  const downloadPdf = async (includeAllData: boolean = true) => {
    if (downloading) return;
    setDownloading(true);
    try {
      // Se genera el PDF con InteractionManager: la generación es pesada
      // (descarga de imágenes, armado del documento) y, si se ejecuta mientras
      // el modal cierra su animación, puede congelar el hilo de UI (o crashear
      // en Android con "script executed too long"). Se difiere hasta que las
      // interacciones/animaciones pendientes terminen.
      const result = (await InteractionManager.runAfterInteractions(() =>
        pdfService.generateAndOpenPropertyPdf(contentId, includeAllData),
      )) as { filePath: string; opened: boolean } | null;

      if (!result?.opened && result?.filePath) {
        showToast("PDF generado correctamente", "success");
      }

      onClose();
    } catch (e: any) {
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
      title={isProperty ? "Compartir Propiedad" : "Compartir Publicación"}
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
            ? isProperty
              ? "Incluye todos los datos de la propiedad e información del agente."
              : "Incluye todos los datos de la publicación."
            : isProperty
              ? "PDF simplificado sin información de contacto."
              : "Sin información de contacto."}
        </Text>

        {activeTab === "con" ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>{shareButtonLabel}</Text>
            </TouchableOpacity>
            {isProperty && (
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
            )}
          </View>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-social" size={18} color={COLORS.primary} />
              <Text style={styles.actionText}>{shareButtonLabel}</Text>
            </TouchableOpacity>
            {isProperty && (
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
            )}
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

export default ShareContentModal;
