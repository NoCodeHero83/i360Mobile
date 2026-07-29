/**
 * Normaliza un string para comparaciones: minúsculas, sin acentos, sin espacios extra.
 * Centraliza las 3+ implementaciones dispersas con regex inconsistentes.
 */
export function normalizeStr(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ'.?-]/g, "");
}

/**
 * Colapsa espacios internos repetidos y recorta los extremos, CONSERVANDO
 * acentos y mayúsculas. Es para valores que se GUARDAN/MUESTRAN (nombres), no
 * para comparar. Evita el "Alejandro  Gutiérrez" (doble espacio) que rompía la
 * búsqueda por apellido parcial.
 */
export function collapseSpaces(s?: string | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Produce un slug de tipo de post: minúsculas, sin acentos, sin espacios.
 * Usado para comparar "Open House" → "openhouse", "Aniversario" → "aniversario", etc.
 */
export function normalizePostType(tipo?: string): string {
  if (!tipo) return "post";
  return tipo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "");
}
