import React from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants";
import { propertyDetailStyles as styles } from "./propertyDetailStyles";

export interface PropertyFinancialSectionProps {
  operations: any[];
  gravamenes: any[];
  financiamientos: string[];
  sinDatos?: boolean;
}

export const PropertyFinancialSection: React.FC<PropertyFinancialSectionProps> = ({
  operations,
  gravamenes,
  financiamientos,
  sinDatos,
}) => {
  const showFinancial = financiamientos.length > 0 || gravamenes.length > 0;

  const hasCommissionData = (op: any) =>
    !!op?.comparte_comision &&
    (op.comision_porcentaje != null ||
      op.comision_monto_fijo != null ||
      op.comision_meses != null ||
      op.porcentaje_comision_compartida != null ||
      op.monto_comision_compartida != null);

  const validOps = operations.filter(hasCommissionData);
  const showCommissions = !sinDatos && validOps.length > 0;

  if (!showFinancial && !showCommissions) return null;

  return (
    <>
      {showFinancial && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financiero y Legal</Text>

          {gravamenes.length > 0 && (
            <View style={styles.warningBox}>
              <Ionicons
                name="warning-outline"
                size={20}
                color={COLORS.error}
              />
              <View>
                <Text style={styles.warningTitle}>Propiedad con Gravamen</Text>
                {gravamenes.map((g, i) => (
                  <Text key={i} style={styles.warningText}>
                    {g.institucion?.nombre} :
                    {g.monto != null
                      ? ` $${Number(g.monto).toLocaleString("es-MX")}`
                      : " Sí"}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {financiamientos.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.label, { marginBottom: 8 }]}>
                Acepta Financiamiento:
              </Text>
              <View style={styles.amenitiesContainer}>
                {financiamientos.map((f, i) => (
                  <View
                    key={i}
                    style={[
                      styles.amenityChip,
                      { borderColor: COLORS.cardBorder },
                    ]}
                  >
                    <Ionicons
                      name="cash-outline"
                      size={14}
                      color={COLORS.textSecondary}
                    />
                    <Text
                      style={[
                        styles.amenityText,
                        { color: COLORS.textSecondary },
                      ]}
                    >
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {showCommissions && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Esquema de Comisión</Text>
          {validOps.map((op, i) => {
            const hasComision =
              op.comision_porcentaje != null ||
              op.comision_monto_fijo != null ||
              op.comision_meses != null;
            const hasComparte =
              op.porcentaje_comision_compartida != null ||
              op.monto_comision_compartida != null;

            return (
              <View key={i} style={styles.commissionBox}>
                <Text style={styles.commissionTitle}>
                  {op.tipo_operacion === "venta" ? "Venta" : "Renta"}
                </Text>
                {hasComision && (
                  <View style={styles.commissionRow}>
                    <Text style={styles.commissionLabel}>Comisión:</Text>
                    <Text style={styles.commissionValue}>
                      {op.comision_meses != null
                        ? `${Number(op.comision_meses)} ${Number(op.comision_meses) === 1 ? "mes" : "meses"}`
                        : op.comision_porcentaje != null
                          ? `${Number(op.comision_porcentaje)}%`
                          : op.comision_monto_fijo != null
                            ? `$${Number(op.comision_monto_fijo).toLocaleString("es-MX")}`
                            : "No especificada"}
                    </Text>
                  </View>
                )}
                {hasComparte && (
                  <View style={styles.commissionRow}>
                    <Text style={styles.commissionLabel}>Comparte:</Text>
                    <Text style={styles.commissionValue}>
                      {op.porcentaje_comision_compartida != null
                        ? `${op.porcentaje_comision_compartida}%`
                        : op.monto_comision_compartida != null
                          ? `$${Number(op.monto_comision_compartida).toLocaleString("es-MX")}`
                          : "No especificado"}
                    </Text>
                  </View>
                )}
                {op.condiciones_comision_compartida && (
                  <View style={styles.commissionRow}>
                    <Text style={styles.commissionLabel}>Condiciones:</Text>
                    <Text style={styles.commissionValue} numberOfLines={2}>
                      {op.condiciones_comision_compartida}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </>
  );
};
