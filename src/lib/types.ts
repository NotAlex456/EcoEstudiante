export type Mode = 'Venta' | 'Intercambio' | 'Donación'
/** Categoría escrita libremente (normalizada con normalizeCategory). */
export type Category = string
export type Condition = 'Como nuevo' | 'Buen estado' | 'Usado'
export type MaterialStatus = 'Disponible' | 'Reservado' | 'Entregado' | 'Pausado'
export type AgreementStatus = 'Pendiente' | 'Confirmado' | 'Completado' | 'Cancelado'

/** Preferencias de aviso que guarda el servidor (el push las necesita con la app cerrada). */
export type NotificationPrefs = {
  push: boolean
  quietNight: boolean
  categories: { mensajes: boolean; acuerdos: boolean; busquedas: boolean; cuenta: boolean }
}

export type User = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  verified: boolean
  createdAt: number
  /** Reputación calculada por el servidor (reseñas recibidas). */
  rating?: { value: number; count: number }
  /** Solo del usuario con sesión. */
  notificationPrefs?: NotificationPrefs
  /** Solo datos de ejemplo locales; la reputación real viene del servidor (`rating`). */
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
  /** Mensajes sin leer según el servidor (se suma uno por cada mensaje nuevo del otro). */
  unread?: number
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
  /** Llegó en vivo por el socket (solo esas muestran la ventana emergente). */
  live?: boolean
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
}
