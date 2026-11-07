export type Mode = 'Venta' | 'Intercambio' | 'Donación'
export type Category = 'Libros' | 'Apuntes' | 'Calculadoras' | 'Separatas'
export type Condition = 'Como nuevo' | 'Buen estado' | 'Usado'
export type MaterialStatus = 'Disponible' | 'Reservado' | 'Entregado' | 'Pausado'
export type AgreementStatus = 'Pendiente' | 'Confirmado' | 'Completado' | 'Cancelado'

export type User = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  passwordHash?: string
  verified: boolean
  /** Verification code "sent" to the institutional email (simulated, no backend). */
  pendingCode?: string
  createdAt: number
  /** Base reputation for seeded students; real ratings are added on top. */
  baseRating?: number
  baseRatingCount?: number
}

export type Material = {
  id: string
  title: string
  course: string
  career: string
  cycle: number
  category: Category
  mode: Mode
  price: number
  exchangeFor?: string
  condition: Condition
  description: string
  ownerId: string
  images: string[]
  status: MaterialStatus
  createdAt: number
}

export type Message = { id: string; from: string; text: string; at: number }

export type Conversation = {
  id: string
  materialId: string
  participants: [string, string]
  messages: Message[]
  /** Last time each participant opened the conversation. */
  readAt: Record<string, number>
}

export type Agreement = {
  id: string
  materialId: string
  buyerId: string
  sellerId: string
  place: string
  date: string
  time: string
  note?: string
  status: AgreementStatus
  createdAt: number
  updatedAt: number
  rating?: { stars: number; comment: string; at: number }
}

export type Notification = {
  id: string
  userId: string
  text: string
  link: string
  at: number
  read: boolean
}

export type Report = {
  id: string
  materialId: string
  userId: string
  reason: string
  detail: string
  at: number
}

export type SavedSearch = {
  id: string
  userId: string
  query: string
  category: string
  mode: string
  at: number
}

/** Simulated actions by other students that fire at a given time (survive reloads). */
export type ScheduledEvent =
  | { id: string; dueAt: number; kind: 'reply'; conversationId: string; from: string; text: string }
  | { id: string; dueAt: number; kind: 'confirm-agreement'; agreementId: string }
  | { id: string; dueAt: number; kind: 'buyer-interest'; materialId: string; ownerId: string; buyerId?: string; conversationId?: string }

export type State = {
  version: number
  sessionUserId: string | null
  users: User[]
  materials: Material[]
  conversations: Conversation[]
  agreements: Agreement[]
  notifications: Notification[]
  reports: Report[]
  savedSearches: SavedSearch[]
  /** Saved material ids per user. */
  saved: Record<string, string[]>
  scheduled: ScheduledEvent[]
}
