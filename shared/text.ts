/** Utilidades de texto compartidas por la app y el servidor. */

/** Minúsculas y sin tildes, para comparar "Electrónica" con "electronica". */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
}

/**
 * Categoría escrita libremente → forma única: sin espacios de más, primera letra en mayúscula y el resto en
 * minúscula. "  kit  de LABORATORIO " → "Kit de laboratorio".
 */
export function normalizeCategory(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
  return clean.charAt(0).toLocaleUpperCase('es') + clean.slice(1)
}
