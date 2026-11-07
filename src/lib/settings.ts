import { useSyncExternalStore } from 'react'

/** Device preferences: kept apart from the app data so "Restablecer datos" doesn't undo them. */
const STORAGE_KEY = 'ecoestudiante:ajustes'

export type NotificationCategory = 'mensajes' | 'acuerdos' | 'busquedas' | 'cuenta'
export type TextSize = 'normal' | 'grande' | 'muy-grande'

export type Settings = {
  notifications: {
    popup: boolean
    sound: boolean
    vibrate: boolean
    /** Android notifications while the app is in the background. */
    system: boolean
    volume: number
    /** No sound or vibration from 22:00 to 07:00. */
    quietNight: boolean
    categories: Record<NotificationCategory, boolean>
  }
  a11y: {
    textSize: TextSize
    highContrast: boolean
    reduceMotion: boolean
    readingSpacing: boolean
    boldText: boolean
  }
}

export const DEFAULT_SETTINGS: Settings = {
  notifications: {
    popup: true,
    sound: true,
    vibrate: true,
    system: true,
    volume: 0.8,
    quietNight: false,
    categories: { mensajes: true, acuerdos: true, busquedas: true, cuenta: true },
  },
  a11y: { textSize: 'normal', highContrast: false, reduceMotion: false, readingSpacing: false, boldText: false },
}

export const CATEGORY_LABELS: Record<NotificationCategory, { title: string; detail: string }> = {
  mensajes: { title: 'Mensajes', detail: 'Respuestas y nuevos interesados en tus materiales' },
  acuerdos: { title: 'Acuerdos de entrega', detail: 'Confirmaciones y cambios en tus entregas' },
  busquedas: { title: 'Alertas de búsqueda', detail: 'Cuando publiquen algo que guardaste para buscar' },
  cuenta: { title: 'Cuenta y novedades', detail: 'Verificación, seguridad y avisos de EcoEstudiante' },
}

const TEXT_SCALE: Record<TextSize, number> = { normal: 1, grande: 1.15, 'muy-grande': 1.3 }

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Settings> | null
    if (saved) {
      return {
        notifications: {
          ...DEFAULT_SETTINGS.notifications,
          ...saved.notifications,
          categories: { ...DEFAULT_SETTINGS.notifications.categories, ...saved.notifications?.categories },
        },
        a11y: { ...DEFAULT_SETTINGS.a11y, ...saved.a11y },
      }
    }
  } catch {
    // unreadable preferences: use the defaults
  }
  return DEFAULT_SETTINGS
}

let settings = load()
const listeners = new Set<() => void>()

export function getSettings() {
  return settings
}

export function useSettings() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => settings,
  )
}

export function updateSettings(patch: { notifications?: Partial<Settings['notifications']>; a11y?: Partial<Settings['a11y']> }) {
  settings = {
    notifications: { ...settings.notifications, ...patch.notifications },
    a11y: { ...settings.a11y, ...patch.a11y },
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // preferences still apply for this session
  }
  applyAccessibility()
  listeners.forEach((listener) => listener())
}

export function resetAccessibility() {
  updateSettings({ a11y: DEFAULT_SETTINGS.a11y })
}

/** Accessibility options are attributes on <html> that app.css reacts to. */
export function applyAccessibility() {
  const root = document.documentElement
  const { a11y } = settings
  root.style.setProperty('--fs', String(TEXT_SCALE[a11y.textSize]))
  root.toggleAttribute('data-alto-contraste', a11y.highContrast)
  root.toggleAttribute('data-sin-animaciones', a11y.reduceMotion)
  root.toggleAttribute('data-espaciado', a11y.readingSpacing)
  root.toggleAttribute('data-negrita', a11y.boldText)
}

export function isQuietTime(date = new Date()) {
  const hour = date.getHours()
  return settings.notifications.quietNight && (hour >= 22 || hour < 7)
}
