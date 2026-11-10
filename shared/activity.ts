/** Contadores de la app: qué acuerdos son nuevos para el usuario y cómo se escribe un globito. */

/**
 * Registro de "visto": desde cuándo se registra (`since`) y, por acuerdo, la última actualización que el usuario ya
 * vio (ms). Un acuerdo sin registro cuenta como nuevo solo si cambió después de `since`.
 */
export type Seen = { since: number; at: Record<string, number> }

type AgreementLike = { id: string; updatedAt: number; buyerId: string; sellerId: string }

/** Acuerdos míos que cambiaron desde la última vez que los vi. Sin registro (primer uso) no hay pendientes. */
export function newAgreementsCount(agreements: AgreementLike[], userId: string, seen: Seen | null): number {
  if (!seen) return 0
  return agreements.filter((a) => (a.buyerId === userId || a.sellerId === userId) && a.updatedAt > (seen.at[a.id] ?? seen.since)).length
}

/** Marca estos acuerdos como vistos en su versión actual. */
export function markSeen(seen: Seen, agreements: Pick<AgreementLike, 'id' | 'updatedAt'>[]): Seen {
  return { since: seen.since, at: { ...seen.at, ...Object.fromEntries(agreements.map((a) => [a.id, a.updatedAt])) } }
}

/** Número del globito: "9+" desde 10. */
export const badgeText = (n: number) => (n > 9 ? '9+' : String(n))
