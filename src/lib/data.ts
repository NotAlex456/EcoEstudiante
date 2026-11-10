import { CATEGORIES as CATEGORY_LIST, CONDITIONS as CONDITION_LIST, MODES as MODE_LIST } from '../../shared/constants'
import { SEED_USERS } from '../../shared/seed-data'
import type { Category, Condition, Material, Mode, State, User } from './types'

export { CAREERS, COMMUNITY_RULES, COURSES, CYCLES, REPORT_REASONS, SAFE_POINTS } from '../../shared/constants'
export { SEED_REVIEWS, type SeedReview } from '../../shared/seed-data'

export const MODES: Mode[] = [...MODE_LIST]
export const CATEGORIES: Category[] = [...CATEGORY_LIST]
export const CONDITIONS: Condition[] = [...CONDITION_LIST]

const seedUsers: User[] = SEED_USERS.map((u) => ({ ...u, verified: true, createdAt: 0 }))


/** 2: los materiales vienen del servidor (etapa 2); el seed local ya no los incluye. */
export const STATE_VERSION = 2

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
    scheduled: [],
  }
}

export { simulatedReply } from '../../shared/bot-replies'
