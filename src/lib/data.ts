import { CATEGORIES as CATEGORY_LIST, CONDITIONS as CONDITION_LIST, MODES as MODE_LIST } from '../../shared/constants'
import { DAY, SEED_MATERIALS, SEED_USERS } from '../../shared/seed-data'
import type { Category, Condition, Material, Mode, State, User } from './types'

export { CAREERS, COMMUNITY_RULES, COURSES, CYCLES, REPORT_REASONS, SAFE_POINTS } from '../../shared/constants'
export { SEED_REVIEWS, type SeedReview } from '../../shared/seed-data'

export const MODES: Mode[] = [...MODE_LIST]
export const CATEGORIES: Category[] = [...CATEGORY_LIST]
export const CONDITIONS: Condition[] = [...CONDITION_LIST]

const seedUsers: User[] = SEED_USERS.map((u) => ({ ...u, verified: true, createdAt: 0 }))

function seedMaterials(now: number): Material[] {
  return SEED_MATERIALS.map(({ daysAgo, ...m }) => ({ ...m, createdAt: now - daysAgo * DAY }))
}

export const STATE_VERSION = 1

export function createSeedState(now = Date.now()): State {
  return {
    version: STATE_VERSION,
    sessionUserId: null,
    users: seedUsers,
    materials: seedMaterials(now),
    conversations: [],
    agreements: [],
    notifications: [],
    reports: [],
    savedSearches: [],
    saved: {},
    scheduled: [],
  }
}

/** Canned replies used to simulate the other student while there is no backend. */
export function simulatedReply(text: string, material: Material): string {
  const t = text.toLocaleLowerCase()
  if (material.status === 'Reservado') return 'Hola, por ahora está reservado. Si se libera te escribo por aquí 🙌'
  if (/(disponible|todav|sigue)/.test(t)) return '¡Hola! Sí, sigue disponible. ¿Cuándo te gustaría recogerlo?'
  if (/(precio|rebaja|descuento|menos)/.test(t))
    return material.mode === 'Venta' ? `Te lo puedo dejar en S/ ${Math.max(1, Math.round(material.price * 0.9))} si lo recoges esta semana.` : 'No tiene costo 😊 solo coordinemos la entrega.'
  if (/(foto|estado|falla|marca)/.test(t)) return 'Está tal como en las fotos. Al entregarlo puedes revisarlo con calma.'
  if (/(cambio|intercambi)/.test(t)) return material.exchangeFor ? `Me interesaría a cambio: ${material.exchangeFor}.` : 'Podemos conversarlo, ¿qué tienes para intercambiar?'
  if (/(hora|cuando|cuándo|mañana|hoy|lugar|biblioteca|patio|cafeter)/.test(t))
    return 'Me queda bien. Envíame la propuesta con "Acordar entrega" y la confirmo.'
  if (/(gracias|ok|listo|perfecto)/.test(t)) return '¡A ti! Nos vemos en el campus 👋'
  return '¡Hola! Claro, cuéntame. Si te interesa, propón lugar y hora con "Acordar entrega".'
}
