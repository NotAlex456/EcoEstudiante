import { CONDITIONS as CONDITION_LIST, MODES as MODE_LIST, SEED_CATEGORIES } from '../../shared/constants'
import { SEED_USERS } from '../../shared/seed-data'
import type { Category, Condition, Material, Mode, State, User } from './types'

export { CAREERS, COMMUNITY_RULES, CYCLES, REPORT_REASONS, SAFE_POINTS } from '../../shared/constants'
/** Provisional hasta la Task 6 (curso y categoría pasan a texto libre con sugerencias). */
export const COURSES: Record<string, string[]> = {}
export { SEED_REVIEWS, type SeedReview } from '../../shared/seed-data'

export const MODES: Mode[] = [...MODE_LIST]
export const CATEGORIES: Category[] = [...SEED_CATEGORIES]
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
