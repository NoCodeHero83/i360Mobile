import { Image } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { documentDirectory, moveAsync } from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";
import firstUpperCase from "@/utils/firstUpperCase";
import { logger } from "@/utils/logger";
import { LogoBase64 } from "@/assets/logoBase64";

const log = logger.scoped("pdfService");
// ============================================================================
// CONFIGURACION DE CAMPOS - Editar aquí qué información mostrar en el PDF
// ============================================================================

export const PDF_FIELD_CONFIG = {
  // Información básica de la propiedad
  showCodigo: true,
  showTipo: true,
  showSubtipo: true,
  showDescripcion: true,
  showStatus: true,

  // Ubicación
  showDireccionCompleta: true,
  showColonia: true,
  showCiudad: true,
  showMunicipio: true,
  showEstado: true,

  // Características físicas
  showMetrosConstruccion: true,
  showMetrosTerreno: true,
  showHabitaciones: true,
  showBanos: true,
  showMediosBanos: true,
  showEstacionamientos: true,
  showPisos: true,
  showAntiguedad: true,
  showAmueblado: true,
  showPetFriendly: true,

  // Descripciones de plantas
  showDescripcionPlantaBaja: true,
  showDescripcionPlantaAlta: true,

  // Características especiales
  showCaracteristicasEspecificas: true,
  showAmenidades: true,

  // Información financiera
  showPrecio: true,
  showMoneda: true,
  showTipoOperacion: true,
  showPeriodoRenta: true,
  showMontoEnganche: true,
  showFinanciamientos: true,

  // Gravámenes
  showGravamenes: true,

  // Datos del creador/agente
  showNombreCreador: true,
  showTelefonoCreador: true,
  showEmailCreador: true,
  showFotoCreador: true,
  showExperienciaCreador: true,
  showInmobiliariaCreador: true,
  showBiografiaCreador: true,

  // Imágenes
  showImagenes: true,
  showVideos: false, // Videos solo como links
};

// Configuración para "Sin Datos" - campos a ocultar cuando se elige esta opción
export const PDF_SIN_DATOS_OVERRIDE: Partial<typeof PDF_FIELD_CONFIG> = {
  showGravamenes: false,
  showTelefonoCreador: false,
  showEmailCreador: false,
  showBiografiaCreador: false,
};

// ============================================================================
// TIPOS
// ============================================================================

export interface PropertyPdfData {
  // Datos básicos
  id: string;
  codigo_propiedad: string;
  tipo: string;
  subtipo: string | null;
  descripcion: string | null;
  status: string | null;

  // Ubicación
  calle: string | null;
  numero_exterior: string | null;
  numero_interior: string | null;
  colonia: string | null;
  ciudad: string | null;
  municipio: string | null;
  estado: string | null;

  // Características
  metros_cuadrados_construccion: number | null;
  metros_cuadrados_terreno: number | null;
  habitaciones: number;
  banos: number;
  medios_banos: number | null;
  estacionamientos: number;
  pisos: number | null;
  antiguedad: string | null;
  amueblado: string | null;
  pet_friendly: string;

  // Descripciones
  descripcion_planta_baja: string | null;
  descripcion_planta_alta: string | null;
  caracteristicas_especificas: string[] | null;

  // Financiero
  monto_enganche: number | null;

  // Media
  fotos: string[] | null;
  videos: string[] | null;

  // Relaciones
  operaciones: OperacionPropiedad[];
  amenidades: { amenidad: { nombre: string } }[];
  financiamientos: { tipo: { nombre: string } }[];
  gravamenes: {
    monto: number | null;
    notas: string | null;
    institucion: { nombre: string };
  }[];
  perfil: PerfilCreador | null;
}

interface OperacionPropiedad {
  tipo_operacion: string;
  precio: number;
  moneda: string;
  periodo_renta: string | null;
}

interface PerfilCreador {
  id?: string | null;
  nombre: string | null;
  nombre_completo: string | null;
  apellido_paterno: string | null;
  apellido_materno: string | null;
  celular: string | null;
  prefijo_celular: string | null;
  email: string | null;
  foto: string | null;
  fecha_inicio_carrera: string | null;
  nombre_inmobiliaria: string | null;
  biografia: string | null;
  ocupacion: string | null;
  calificacion_promedio?: number | null;
  total_resenas?: number | null;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Sanitiza texto para evitar errores con valores null/undefined
 * y escapa caracteres especiales HTML
 */
const safeText = (text: string | null | undefined): string => {
  if (text === null || text === undefined) return "";
  const str = String(text);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatPrice = (
  price: number | null | undefined,
  currency: string = "MXN",
): string => {
  if (price === null || price === undefined) return "";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `$${price}`;
  }
};

const getCreatorFullName = (perfil: PerfilCreador | null): string => {
  if (!perfil) return "Agente";

  if (perfil.nombre_completo) return perfil.nombre_completo;

  const parts: string[] = [];
  if (perfil.nombre) parts.push(perfil.nombre);
  if (perfil.apellido_paterno) parts.push(perfil.apellido_paterno);
  if (perfil.apellido_materno) parts.push(perfil.apellido_materno);

  return parts.length > 0 ? parts.join(" ") : "Agente";
};

const getCreatorPhone = (perfil: PerfilCreador | null): string => {
  if (!perfil?.celular) return "";
  const prefix = perfil.prefijo_celular || "+52";
  return `${prefix} ${perfil.celular}`;
};

// ============================================================================
// OBTENER DATOS DE LA PROPIEDAD
// ============================================================================

export const fetchPropertyData = async (
  propertyId: string,
): Promise<PropertyPdfData | null> => {
  try {
    const { data, error } = await supabase
      .from("propiedades")
      .select(
        `
        *,
        operaciones:operaciones_propiedad(*),
        perfil:perfiles!propiedades_creado_por_fkey(*),
        amenidades:propiedad_amenidades(amenidad:catalogo_amenidades(nombre)),
        gravamenes:propiedad_gravamenes(*, institucion:catalogo_instituciones_financieras(nombre)),
        financiamientos:propiedad_financiamientos(tipo:catalogo_tipos_financiamiento(nombre))
      `,
      )
      .eq("id", propertyId)
      .single();

    if (error) {
      log.error("Error fetching property data:", error);
      return null;
    }

    return data as PropertyPdfData;
  } catch (err) {
    log.error("Error in fetchPropertyData:", err);
    return null;
  }
};

// ============================================================================
// GENERADOR DE HTML
// ============================================================================

/**
 * Devuelve true si la imagen es VERTICAL (retrato, alto > ancho). Se usa para
 * la portada del PDF: una foto vertical no cabe en la caja apaisada de alto fijo
 * y `object-fit: cover` la recortaba. Si no se puede medir, asume horizontal.
 */
const isImagePortrait = (url: string): Promise<boolean> =>
  new Promise((resolve) => {
    if (!url) return resolve(false);
    Image.getSize(
      url,
      (w, h) => resolve(h > w),
      () => resolve(false),
    );
  });

const generatePropertyHtml = (
  data: PropertyPdfData,
  config: typeof PDF_FIELD_CONFIG & {
    showDatosCompletos?: boolean;
    heroIsPortrait?: boolean;
  }, // Asumo que esta flag vendrá en tu config o puedes forzarla
): string => {
  const operacionPrincipal = data.operaciones?.[0];
  const statusLabel =
    data.status && data.status.toLowerCase() !== "publicada"
      ? data.status.toUpperCase()
      : operacionPrincipal?.tipo_operacion === "renta"
        ? "EN RENTA"
        : "EN VENTA";

  // LOGICA CONDICIONAL: Mostrar datos sensibles del agente.
  // Si config.showDatosCompletos es true, mostramos los datos del agente. Si no, los ocultamos.
  // Nota: las comisiones NUNCA se renderizan en el PDF, sin importar esta flag.
  const showSensitiveData = config.showDatosCompletos === true;

  // --- PREPARACIÓN DE DATOS ---

  // 1. Imágenes: Separar la principal (Hero) de las secundarias (Galería)
  const MAX_IMAGES = 10;
  const validPhotos = (data.fotos || []).filter(
    (foto) => foto && typeof foto === "string" && foto.startsWith("http"),
  );

  const heroImage = validPhotos.length > 0 ? validPhotos[0] : "";
  const galleryPhotos = validPhotos.slice(0, MAX_IMAGES);

  // 2. Iconos SVG (Inline para asegurar que se vean en el PDF sin dependencias externas)
  const icons = {
    bed: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" class="ionicon" viewBox="0 0 512 512"><path fill="none" stroke-width="32" d="M384 240H96V136a40.12 40.12 0 0 1 40-40h240a40.12 40.12 0 0 1 40 40v104zM48 416V304a64.19 64.19 0 0 1 64-64h288a64.19 64.19 0 0 1 64 64v112"/><path fill="none" stroke-width="32" d="M48 416v-8a24.07 24.07 0 0 1 24-24h368a24.07 24.07 0 0 1 24 24v8M112 240v-16a32.09 32.09 0 0 1 32-32h80a32.09 32.09 0 0 1 32 32v16m0 0v-16a32.09 32.09 0 0 1 32-32h80a32.09 32.09 0 0 1 32 32v16"/></svg>`,
    bath: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008f85" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-toilet"><path d="M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18"/><path d="M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v9"/></svg>`,
    car: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" class="ionicon" viewBox="0 0 512 512"><path d="M80 224l37.78-88.15C123.93 121.5 139.6 112 157.11 112h197.78c17.51 0 33.18 9.5 39.33 23.85L432 224M80 224h352v144H80zM112 368v32H80v-32M432 368v32h-32v-32" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="144" cy="288" r="16" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="368" cy="288" r="16" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>`,
    area: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" fill="none" class="ionicon" viewBox="0 0 512 512"><path d="M342.59 80H424a24.07 24.07 0 0124 24v80.41M168.83 80H88a24.07 24.07 0 00-24 24v80.41M344.34 432H424a24.07 24.07 0 0024-24v-80.46M168.83 432H88a24.07 24.07 0 01-24-24v-80.46" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>`,
    home: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#008f85" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>`,
    pin: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" class="ionicon" viewBox="0 0 512 512"><path d="M256 48c-79.5 0-144 61.39-144 137 0 87 96 224.87 131.25 272.49a15.77 15.77 0 0025.5 0C304 409.89 400 272.07 400 185c0-75.61-64.5-137-144-137z" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><circle cx="256" cy="192" r="48" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" class="ionicon" viewBox="0 0 512 512"><path d="M448 256c0-106-86-192-192-192S64 150 64 256s86 192 192 192 192-86 192-192z" fill="none" stroke-miterlimit="10" stroke-width="32"/><path fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="32" d="M352 176L217.6 336 160 272"/></svg>`,
    level: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" stroke="#008f85" fill="none" class="ionicon" viewBox="0 0 512 512"><path d="M448 341L255.8 448 64 341M448 256L256 363 64 256" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/><path d="M255.8 64L448 171 256 278 64 171 255.8 64z" stroke-linecap="round" stroke-linejoin="round" stroke-width="32"/></svg>`,
  };

  // 3. Formateadores
  const formatPriceSafe = (price?: number, currency?: string) => {
    if (!price) return "";
    return formatPrice(price, currency); // Asumiendo que formatPrice existe en tu contexto
  };

  // --- CONSTRUCCIÓN DE SECCIONES HTML ---

  // Galería de imágenes como TABLA de 2 columnas (no grid). Los motores de
  // impresión (WebKit en iOS, Chromium en Android) paginan de forma fiable por
  // filas de tabla y respetan page-break-inside en <tr>, cosa que NO hacen con
  // los items de un `display: grid` → por eso las fotos se partían entre hojas.
  let galleryHtml = "";
  if (config.showImagenes && galleryPhotos.length > 0) {
    const rows: string[][] = [];
    for (let i = 0; i < galleryPhotos.length; i += 2) {
      rows.push(galleryPhotos.slice(i, i + 2));
    }
    galleryHtml = rows
      .map((row) => {
        const cells = row
          .map(
            (foto) => `
          <td class="gallery-cell"${row.length === 1 ? ' colspan="2"' : ""}>
            <img src="${foto}" alt="Foto" onerror="this.style.display='none'" />
          </td>`,
          )
          .join("");
        return `<tr class="gallery-row">${cells}</tr>`;
      })
      .join("");
  }

  // Amenidades (Estilo Grid con iconos)
  let amenidadesHtml = "";
  if (config.showAmenidades && data.amenidades && data.amenidades.length > 0) {
    const list = data.amenidades
      .map((a) => a.amenidad?.nombre)
      .filter(Boolean)
      .slice(0, 8) // Limitamos a 8 para que no rompa el diseño de la tarjeta
      .map(
        (nombre) => `
        <div class="amenity-item">
          ${icons.check} <span>${safeText(nombre)}</span>
        </div>
      `,
      )
      .join("");

    if (list) {
      amenidadesHtml = `
        <div class="section-title">Amenidades</div>
        <div class="amenities-grid">${list}</div>
      `;
    }
  }

  // ID y Fecha (se mantiene en ambos modos)
  const idDateHtml = `
    <div class="id-date-footer">
      ID: ${data.codigo_propiedad || "N/A"} | ${new Date().toLocaleDateString("es-MX")}
    </div>
  `;

  // Información del Creador (SOLO SI showSensitiveData es true)
  let creatorHtml = "";
  if (showSensitiveData && data.perfil) {
    creatorHtml = `
      <div class="footer-agent">
        <div class="agent-info">
            ${data.perfil.foto && config.showFotoCreador ? `<img src="${data.perfil.foto}" class="agent-avatar" />` : ""}
            <div class="agent-details">
                ${config.showNombreCreador ? `<div class="agent-name">${safeText(getCreatorFullName(data.perfil))}</div>` : ""}
                ${(() => {
                  const rating = data.perfil?.calificacion_promedio;
                  const reviews = data.perfil?.total_resenas;
                  if (!rating || !reviews) return "";
                  const fullStars = Math.floor(rating);
                  const halfStar = rating - fullStars >= 0.5;
                  const stars = "★".repeat(fullStars) + (halfStar ? "½" : "") + "☆".repeat(5 - fullStars - (halfStar ? 1 : 0));
                  return `<div class="agent-rating"><span class="agent-stars">${stars}</span><span class="agent-reviews">${rating.toFixed(1)} (${reviews} reseñas)</span></div>`;
                })()}
                ${config.showInmobiliariaCreador && data.perfil.nombre_inmobiliaria ? `<div class="agent-company">${safeText(data.perfil.nombre_inmobiliaria)}</div>` : ""}
                <div class="agent-contact">
                    ${config.showTelefonoCreador ? `<span>${safeText(getCreatorPhone(data.perfil))}</span>` : ""}
                </div>
                ${idDateHtml}
            </div>
        </div>
        <div class="footer-logo-container">
          <img src="${LogoBase64}" alt="Ilyrox" class="Logo" />
        </div>
      </div>
    `;
  } else {
    // Footer genérico si no hay datos completos
    creatorHtml = `
      <div class="footer-agent">
         <div class="agent-details">
            <div class="footer-logo-container">
              <img src="${LogoBase64}" alt="Ilyrox" class="Logo" />
            </div>
            ${idDateHtml}
         </div>
      </div>
    `;
  }

  // Descripción por plantas
  let descripcionHtml = "";
  if (data.descripcion) {
    descripcionHtml += `<p>${safeText(data.descripcion)}</p>`;
  }
  if (config.showDescripcionPlantaBaja && data.descripcion_planta_baja) {
    descripcionHtml += `<h3>Planta Baja</h3><p>${safeText(data.descripcion_planta_baja)}</p>`;
  }
  if (config.showDescripcionPlantaAlta && data.descripcion_planta_alta) {
    descripcionHtml += `<h3>Planta Alta</h3><p>${safeText(data.descripcion_planta_alta)}</p>`;
  }

  // --- RETURN HTML ---
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        /* Forzar impresion de colores de fondo. En iPhone el motor de PDF
           (WebKit) descarta los backgrounds al imprimir por defecto, asi el
           fondo verde del logo (y otros) desaparecia y el logo quedaba flotando.
           Con esto el fondo se respeta en iOS igual que en Android. */
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        html, body {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: 'Inter', sans-serif;
          background-color: #f3f4f6;
          color: #1f2937;
          font-size: 14px;
        }

        /* --- HERO SECTION (Imagen 1) --- */
        .hero-container {
            position: relative;
            width: 100%;
            height: 420px; /* Ajuste para que se vea la imagen principal grande */
            background-color: #ddd;
            overflow: hidden;
            /* Sin esto, el motor de impresión parte la imagen en el salto de página */
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
        }
        .hero-img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        /* Portada VERTICAL: MISMA altura que la horizontal (420px) + object-fit
           contain para que la foto se vea COMPLETA (sin recortar) centrada con
           fondo neutro. No se sube la altura a proposito: una caja mas alta
           empujaba la tarjeta/Descripcion a la 2a pagina (por page-break-inside:
           avoid). Manteniendo la altura, los detalles quedan en la pagina 1. */
        .hero-container.hero-portrait {
            background-color: #f3f4f6;
        }
        .hero-container.hero-portrait .hero-img {
            object-fit: contain;
        }
        .tag-badge {
            position: absolute;
            top: 40px;
            left: 0;
            background-color: #D12E87; /* Color magenta de la imagen */
            color: white;
            padding: 10px 25px 10px 40px;
            font-weight: 700;
            font-size: 18px;
            text-transform: uppercase;
            border-top-right-radius: 4px;
            border-bottom-right-radius: 4px;
            box-shadow: 2px 2px 10px rgba(0,0,0,0.2);
        }

        /* --- MAIN CARD --- */
        .content-wrapper {
            padding: 0 40px;
            margin-top: -40px; /* Efecto de superposición */
            position: relative;
            z-index: 10;
        }

        .property-card {
            background: white;
            border-radius: 20px;
            padding: 30px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.08);
            margin-bottom: 30px;
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
        }

        .card-header {
            margin-bottom: 20px;
            border-bottom: 1px solid #eee;
            padding-bottom: 20px;
        }
        
        .property-title {
            font-size: 28px;
            font-weight: 800;
            color: #111;
            margin-bottom: 8px;
            line-height: 1.2;
        }
        
        .property-subtitle {
            font-size: 16px;
            color: #666;
            margin-bottom: 15px;
        }

        .price-section {
            font-size: 26px;
            font-weight: 800;
            color: #111;
            margin-bottom: 10px;
        }
        
        .location-row {
            display: flex;
            align-items: center;
            gap: 6px;
            color: #111;
            font-weight: 600;
            font-size: 14px;
        }

        /* --- STATS ICONS --- */
        .stats-row {
            display: flex;
            justify-content: flex-start;
            flex-wrap: wrap;
            gap: 28px;
            padding: 20px 0;
            border-bottom: 1px solid #f0f0f0;
            margin-bottom: 20px;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
        }
        
        .stat-icon {
            width: 40px;
            height: 40px;
            border: 1px solid #e0e0e0; /* Borde suave como en la imagen */
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .stat-label {
            font-size: 13px;
            font-weight: 500;
            color: #777;
        }

        .stat-value {
            font-size: 18px;
            font-weight: 700;
            color: #111;
        }

        /* --- AMENITIES --- */
        .section-title {
            font-size: 14px;
            font-weight: 700;
            color: #008f85; /* Color verde azulado de la imagen */
            margin-bottom: 15px;
            text-transform: uppercase;
        }

        .amenities-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr); /* 2 Columnas */
            gap: 12px;
        }

        .amenity-item {
            display: flex;
            align-items: center;
            gap: 8px;
            color: #444;
            font-size: 13px;
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
        }

        /* --- DESCRIPTION SECTION (Imagen 2) --- */
        .details-section {
            background: white;
            padding: 40px;
            margin: 0 40px 30px 40px;
            border-radius: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
            -webkit-column-break-inside: avoid;
        }
        
        .details-section h2 {
            font-size: 22px;
            font-weight: 800;
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .details-section h3 {
            font-size: 16px;
            font-weight: 700;
            margin-top: 20px;
            margin-bottom: 10px;
            text-transform: uppercase;
        }

        .details-section p {
            line-height: 1.6;
            color: #555;
            margin-bottom: 15px;
            text-align: justify;
        }

        /* --- GALLERY (tabla: paginación fiable en impresión) --- */
        .gallery-container {
            margin-top: 30px;
            padding: 20px 40px 40px 40px;
        }
        .gallery-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        /* La fila entera no se parte: si no cabe, salta completa a la siguiente
           página. Es lo que WebKit/Chromium sí respetan (a diferencia del grid). */
        .gallery-row {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .gallery-cell {
            width: 50%;
            padding: 6px;
            vertical-align: top;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .gallery-cell img {
            width: 100%;
            height: 220px;
            object-fit: cover;
            border-radius: 4px;
            display: block;
        }

        /* --- FOOTER & AGENT --- */
        .footer-agent {
            background: white;
            padding: 20px 40px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #ddd;
            margin-top: auto;
        }

        .agent-info {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .agent-avatar {
            width: 50px;
            height: 50px;
            border-radius: 50%;
            object-fit: cover;
        }

        .agent-name {
            font-weight: 700;
            font-size: 16px;
        }
        
        .without-agent-name {
            color: #008f86e4;
            font-weight: 700;
            font-size: 16px;
        }

        .agent-company {
            font-size: 12px;
            color: #666;
        }

        .agent-rating {
            display: flex;
            align-items: center;
            gap: 4px;
            margin-top: 2px;
        }

        .agent-stars {
            color: #f59e0b;
            font-size: 13px;
            letter-spacing: 1px;
        }

        .agent-reviews {
            font-size: 11px;
            color: #888;
        }

        .footer-logo-container {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #45a0a5; /* teal de marca, como el header del feed */
            padding: 8px 14px;
            border-radius: 10px;
        }

        .Logo {
            height: 40px;
            width: auto;
            object-fit: contain;
        }
        
        .id-date-footer {
            font-size: 10px;
            color: #008f86e4;
            margin-top: 4px;
        }

        .internal-data-box {
            background: #fff3cd;
            color: #856404;
            padding: 10px;
            border-radius: 4px;
            margin: 20px 40px;
            font-size: 12px;
            border: 1px solid #ffeeba;
        }
        
        @page {
            margin: 40px 0;
        }
        @page :first {
            margin-top: 0;
        }
      </style>
    </head>
    <body>
      
      <div class="hero-container${config.heroIsPortrait ? " hero-portrait" : ""}">
        ${heroImage ? `<img src="${heroImage}" class="hero-img" />` : '<div style="width:100%;height:100%;background:#ccc;"></div>'}
        <div class="tag-badge">${statusLabel}</div>
      </div>

      <div class="content-wrapper">
        <div class="property-card">
            
            <div class="card-header">
                <div class="property-title">${
                  data.subtipo
                    ? firstUpperCase(data.subtipo)
                    : firstUpperCase(data.tipo)
                } en ${safeText(data.municipio || data.estado || data.ciudad || "")}</div>
                <div class="property-subtitle">${firstUpperCase(data.tipo)}</div>
                
                <div class="price-section">
                    ${formatPriceSafe(operacionPrincipal?.precio, operacionPrincipal?.moneda)}
                </div>
                
                <div class="location-row">
                     ${icons.pin}
                     <span>
                        ${data.calle ? safeText(data.calle) + ", " : ""}
                        ${[data.ciudad, data.estado].filter(Boolean).join(", ")}
                     </span>
                </div>
            </div>

            <div class="stats-row">
                ${
                  config.showHabitaciones && data.habitaciones > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.bed}</div>
                    <span class="stat-label">Rec.</span>
                    <span class="stat-value">${data.habitaciones}</span>
                </div>`
                    : ""
                }

                ${
                  config.showBanos && data.banos > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.bath}</div>
                    <span class="stat-label">Baños</span>
                    <span class="stat-value">${data.banos}</span>
                </div>`
                    : ""
                }

                ${
                  config.showMediosBanos && (data.medios_banos ?? 0) > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.bath}</div>
                    <span class="stat-label">Medios</span>
                    <span class="stat-value">${data.medios_banos}</span>
                </div>`
                    : ""
                }

                ${
                  config.showEstacionamientos && data.estacionamientos > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.car}</div>
                    <span class="stat-label">Estac.</span>
                    <span class="stat-value">${data.estacionamientos}</span>
                </div>`
                    : ""
                }

                ${
                  data.metros_cuadrados_construccion &&
                  data.metros_cuadrados_construccion > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.home}</div>
                    <span class="stat-label">Const.</span>
                    <span class="stat-value">${data.metros_cuadrados_construccion} <span style="font-size:12px; font-weight:400;">m²</span></span>
                </div>`
                    : ""
                }

                ${
                  data.metros_cuadrados_terreno &&
                  data.metros_cuadrados_terreno > 0
                    ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.area}</div>
                    <span class="stat-label">Terreno</span>
                    <span class="stat-value">${data.metros_cuadrados_terreno} <span style="font-size:12px; font-weight:400;">m²</span></span>
                </div>`
                    : ""
                }
                 ${
                   data.pisos && data.pisos > 0
                     ? `
                <div class="stat-item">
                    <div class="stat-icon">${icons.level}</div>
                    <span class="stat-label">Niveles</span>
                    <span class="stat-value">${data.pisos}</span>
                </div>`
                     : ""
                 }
            </div>

            ${amenidadesHtml}
        
        </div>
      </div>

      <div class="details-section">
         <h2>Descripción</h2>
         ${descripcionHtml}
      </div>

      ${galleryHtml ? `<div class="gallery-container"><table class="gallery-table"><tbody>${galleryHtml}</tbody></table></div>` : ""}

      ${creatorHtml}
    </body>
    </html>
  `;
};

// ============================================================================
// SERVICIO PRINCIPAL
// ============================================================================

export const pdfService = {
  /**
   * Genera y abre un PDF con todos los datos de la propiedad
   * @param propertyId - ID de la propiedad
   * @param includeAllData - Si es true, incluye todos los datos. Si es false, usa PDF_SIN_DATOS_OVERRIDE
   */
  async generateAndOpenPropertyPdf(
    propertyId: string,
    includeAllData: boolean = true,
    signal?: { aborted: boolean },
  ): Promise<{ filePath: string; opened: boolean }> {
    // Obtener datos de la propiedad
    const propertyData = await fetchPropertyData(propertyId);

    if (!propertyData) {
      throw new Error("No se pudieron obtener los datos de la propiedad");
    }

    // Orientación de la portada: si la primera foto es vertical, la caja de la
    // portada se adapta (más alta + contain) para no recortarla.
    const firstPhoto = (propertyData.fotos || []).find(
      (f) => f && typeof f === "string" && f.startsWith("http"),
    );
    const heroIsPortrait = firstPhoto ? await isImagePortrait(firstPhoto) : false;

    // Determinar configuración según el modo
    const config = {
      ...(includeAllData
        ? { ...PDF_FIELD_CONFIG }
        : { ...PDF_FIELD_CONFIG, ...PDF_SIN_DATOS_OVERRIDE }),
      showDatosCompletos: includeAllData,
      heroIsPortrait,
    };

    // Generar HTML
    let html = generatePropertyHtml(propertyData, config);
    let uri: string;

    // Intentar generar PDF, si falla por imágenes, reintentar sin ellas
    try {
      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });
      uri = result.uri;
    } catch (printError) {
      log.warn(
        "Error generando PDF con imágenes, reintentando sin imágenes:",
        printError,
      );

      // Reintentar sin imágenes
      const configWithoutImages = {
        ...config,
        showImagenes: false,
        showFotoCreador: false,
      };
      html = generatePropertyHtml(propertyData, configWithoutImages);

      const result = await Print.printToFileAsync({
        html,
        base64: false,
      });
      uri = result.uri;
    }

    // Mover a un nombre más descriptivo
    const fileName = `propiedad_${safeText(propertyData.codigo_propiedad) || propertyId}_${Date.now()}.pdf`;
    const newPath = `${documentDirectory}${fileName}`;

    await moveAsync({
      from: uri,
      to: newPath,
    });

    // Si el modal se cerró, no mostrar dialogo nativo
    if (signal?.aborted) return { filePath: newPath, opened: false };

    // Intentar compartir/abrir el PDF
    let opened = false;

    if (await Sharing.isAvailableAsync()) {
      try {
        await Sharing.shareAsync(newPath, {
          mimeType: "application/pdf",
          dialogTitle: `Propiedad ${propertyData.codigo_propiedad || ""}`,
          UTI: "com.adobe.pdf",
        });
        opened = true;
      } catch (error) {
        log.error("Error sharing PDF:", error);
      }
    }

    // Fallback a react-native-file-viewer si sharing no funcionó
    if (!opened) {
      try {
        const FileViewer = require("react-native-file-viewer");
        if (FileViewer?.default?.open) {
          await FileViewer.default.open(newPath, {
            showOpenWithDialog: true,
            showAppsSuggestions: true,
          });
          opened = true;
        }
      } catch (error) {
        log.warn("FileViewer not available:", error);
      }
    }

    return { filePath: newPath, opened };
  },

  /**
   * Obtiene la configuración actual de campos del PDF
   */
  getFieldConfig() {
    return { ...PDF_FIELD_CONFIG };
  },

  /**
   * Obtiene la configuración de "Sin Datos"
   */
  getSinDatosOverride() {
    return { ...PDF_SIN_DATOS_OVERRIDE };
  },
};
