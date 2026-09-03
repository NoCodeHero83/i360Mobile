import { COLORS } from "@/constants";
import React, { useEffect, useState } from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

const log = logger.scoped("communityWelcome");

const STORED_INVITE_CODE_KEY = "ilyrox:asesor_invite_code";

interface InvitadorInfo {
  invitador_id: string;
  nombre: string | null;
  apellido_paterno: string | null;
  foto: string | null;
}

export default function CommunityWelcome() {
  const router = useRouter();
  const [invitador, setInvitador] = useState<InvitadorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvitador() {
      try {
        const code = await AsyncStorage.getItem(STORED_INVITE_CODE_KEY);
        if (code) {
          log.info("communityWelcome: Codigo encontrado", { code });
          const { data, error } = await supabase.rpc("get_invitador_info", {
            p_codigo: code,
          });
          if (error) {
            log.warn("communityWelcome: Error al obtener invitador", error);
          } else if (data) {
            log.info("communityWelcome: Invitador info", data);
            setInvitador(data);
          }
        } else {
          log.info("communityWelcome: No hay codigo en storage");
        }
      } catch (e) {
        log.warn("communityWelcome: Error al cargar invitador", e);
      } finally {
        setLoading(false);
      }
    }
    loadInvitador();
  }, []);

  const handleEmpezar = () => {
    log.info("communityWelcome: Usuario presiono Empezar, navegando a /login");
    router.replace("/login");
  };

  const getNombreCompleto = () => {
    if (!invitador) return "";
    const nombre = invitador.nombre || "";
    const apellido = invitador.apellido_paterno || "";
    return `${nombre} ${apellido}`.trim();
  };

  const SOURCE_LOGO = require("../../../assets/Icon-size.png");

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image
          source={SOURCE_LOGO}
          style={styles.logo}
          resizeMode="contain"
        />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.subtitle}>BIENVENIDO.</Text>
              {invitador ? (
                <>
                  <Text style={styles.invitedText}>Fuiste invitado por</Text>
                  <Text style={styles.invitedName}>{getNombreCompleto()}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.titleDark}>Descargaste</Text>
                  <Text style={styles.titleBlue}>una comunidad.</Text>
                </>
              )}
            </View>

            <View style={styles.dividerContainer}>
              <View style={styles.line} />
              <View style={styles.iconCircle}>
                <Ionicons name="people-outline" size={26} color="#007B99" />
              </View>
              <View style={styles.line} />
            </View>

            <View style={styles.section}>
              <Text style={styles.subtitle}>NUESTRO COMPROMISO</Text>
              <Text style={styles.titleDark}>La colaboración</Text>
              <Text style={styles.titleDark}>
                nunca tendrá costo<Text style={styles.dot}>.</Text>
              </Text>
              <View style={styles.smallUnderline} />
              <Text style={styles.description}>
                Publicar y compartir propiedades{"\n"}
                en <Text style={styles.boldText}>ILYROX</Text> siempre será{" "}
                <Text style={styles.highlightText}>gratis.</Text>
              </Text>
            </View>

            <TouchableOpacity style={styles.button} activeOpacity={0.8} onPress={handleEmpezar}>
              <Text style={styles.buttonText}>Empezar</Text>
              <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 240,
    height: 140,
    marginTop: 30,
  },
  section: {
    alignItems: "center",
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#007B99",
    letterSpacing: 2,
    marginBottom: 8,
  },
  titleDark: {
    fontSize: 30,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    lineHeight: 36,
  },
  titleBlue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#007B99",
    textAlign: "center",
    lineHeight: 34,
  },
  invitedText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6B7280",
    marginTop: 8,
  },
  invitedName: {
    fontSize: 26,
    fontWeight: "800",
    color: "#007B99",
    textAlign: "center",
    marginTop: 4,
  },
  dot: {
    color: "#007B99",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginVertical: 0,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 12,
  },
  smallUnderline: {
    width: 32,
    height: 3,
    backgroundColor: "#007B99",
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 16,
  },
  description: {
    fontSize: 14,
    color: "#4B5563",
    textAlign: "center",
    lineHeight: 20,
  },
  boldText: {
    fontWeight: "700",
    color: "#111827",
  },
  highlightText: {
    fontWeight: "700",
    color: "#007B99",
  },
  button: {
    backgroundColor: "#007B99",
    width: "100%",
    height: 52,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  buttonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
});
