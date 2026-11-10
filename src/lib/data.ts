import { CONDITIONS as CONDITION_LIST, MODES as MODE_LIST, SEED_CATEGORIES } from '../../shared/constants'
import { foldText } from '../../shared/text'
import { SEED_USERS } from '../../shared/seed-data'
import type { Category, Condition, Material, Mode, State, User } from './types'

export { CAREERS, COMMUNITY_RULES, CYCLES, REPORT_REASONS, SAFE_POINTS } from '../../shared/constants'
export { SEED_REVIEWS, type SeedReview } from '../../shared/seed-data'

export const MODES: Mode[] = [...MODE_LIST]
/** Categorías de ejemplo: completan las sugerencias y las tarjetas de Explorar cuando hay pocas. */
export const SEED_CATEGORY_LIST: Category[] = [...SEED_CATEGORIES]

/**
 * Valores distintos de `pick` en los materiales, ordenados por cuántas veces aparecen (sin distinguir
 * mayúsculas ni tildes; se muestra la primera forma encontrada). Sirven para las sugerencias de Publicar.
 */
export function rankedValues(materials: Material[], pick: (m: Material) => string): { name: string; count: number }[] {
  const byKey = new Map<string, { name: string; count: number }>()
  for (const m of materials) {
    const name = pick(m).trim()
    if (!name) continue
    const entry = byKey.get(foldText(name)) ?? { name, count: 0 }
    entry.count++
    byKey.set(foldText(name), entry)
  }
  return [...byKey.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
}
export const CONDITIONS: Condition[] = [...CONDITION_LIST]

const seedUsers: User[] = SEED_USERS.map((u) => ({ ...u, verified: true, createdAt: 0 }))


/** 3: chats, acuerdos y notificaciones vienen del servidor (etapas 3 y 4); la simulación local ya no existe. */
export const STATE_VERSION = 3

export function createSeedState(): State {
  return {
    version: STATE_VERSION,
    sessionUserId: null,
    users: seedUsers,
    materials: [],
    conversations: [],
    agreements: [],
    notifications: [],
    reports: [],
    savedSearches: [],
    saved: {},
  }
}

export { simulatedReply } from '../../shared/bot-replies'
