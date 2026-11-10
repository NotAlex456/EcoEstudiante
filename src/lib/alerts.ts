import { useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { navigate } from './router'
import { currentUser, getState, subscribe } from './store'
import { getSettings, type NotificationCategory } from './settings'
import type { Notification } from './types'

const isNative = Capacitor.isNativePlatform()
const SOUND_URL = `${import.meta.env.BASE_URL}sounds/notificacion.mp3`

export const categoryOf = (link: string): NotificationCategory =>
  link.startsWith('#/chat') ? 'mensajes' : link.startsWith('#/acuerdo') ? 'acuerdos' : link.startsWith('#/material') ? 'busquedas' : 'cuenta'

/* ---------- preferencias del servidor ---------- */

const ALL_ON = { push: true, quietNight: false, categories: { mensajes: true, acuerdos: true, busquedas: true, cuenta: true } }

/** Preferencias guardadas en el servidor (si aún no llegaron, todo activo). */
export const serverPrefs = () => currentUser(getState())?.notificationPrefs ?? ALL_ON

/** Horario silencioso (22:00 a 07:00): sin sonido ni vibración dentro de la app, y sin push desde el servidor. */
export function isQuietTime(date = new Date()) {
  const hour = date.getHours()
  return serverPrefs().quietNight && (hour >= 22 || hour < 7)
}

/* ---------- in-app pop-up ---------- */

export type Banner = { id: string; text: string; link: string; category: NotificationCategory }
let banner: Banner | null = null
let bannerTimer: ReturnType<typeof setTimeout> | undefined
const bannerListeners = new Set<() => void>()

function setBanner(next: Banner | null) {
  banner = next
  clearTimeout(bannerTimer)
  if (next) bannerTimer = setTimeout(() => setBanner(null), 6000)
  bannerListeners.forEach((l) => l())
}

export const dismissBanner = () => setBanner(null)

export function useBanner() {
  return useSyncExternalStore(
    (listener) => {
      bannerListeners.add(listener)
      return () => bannerListeners.delete(listener)
    },
    () => banner,
  )
}

/* ---------- sound and vibration ---------- */

let audio: HTMLAudioElement | null = null

function playSound() {
  const { notifications } = getSettings()
  audio ??= new Audio(SOUND_URL)
  audio.volume = notifications.volume
  audio.currentTime = 0
  // Browsers block sound until the person has touched the page; the pop-up still shows.
  audio.play().catch(() => undefined)
}

function vibrate() {
  if (isNative) Haptics.vibrate({ duration: 300 }).catch(() => undefined)
  else navigator.vibrate?.([120, 80, 120])
}

/** Shows a notification inside the app with the person's chosen pop-up, sound and vibration. */
export function alertInApp(item: Pick<Notification, 'id' | 'text' | 'link'>, options: { test?: boolean } = {}) {
  const { notifications } = getSettings()
  const category = categoryOf(item.link)
  if (!options.test && serverPrefs().categories[category] === false) return
  // Already looking at that chat or agreement: the new content is on screen.
  if (!options.test && location.hash === item.link) return
  if (notifications.popup || options.test) setBanner({ id: item.id, text: item.text, link: item.link, category })
  if (isQuietTime()) return
  if (notifications.sound) playSound()
  if (notifications.vibrate) vibrate()
}

/* ---------- Android notifications (app in the background) ---------- */

const channelId = (sound: boolean, vibration: boolean) => `eco-${sound ? 'sonido' : 'silencio'}-${vibration ? 'vibra' : 'quieto'}`

// Android ids must be 32-bit integers; derive a stable one from the notification id.
function androidId(id: string) {
  let h = 0
  for (const ch of id) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0
  return Math.abs(h) || 1
}

let channelsReady: Promise<void> | undefined

// Android drops notifications whose channel doesn't exist, so every post waits for this.
const ensureChannels = () => (channelsReady ??= createChannels().catch(() => {
  channelsReady = undefined
}))

async function createChannels() {
  for (const sound of [true, false]) {
    for (const vibration of [true, false]) {
      await LocalNotifications.createChannel({
        id: channelId(sound, vibration),
        name: `Avisos${sound ? ' con sonido' : ' silenciosos'}${vibration ? ' y vibración' : ''}`,
        description: 'Mensajes, acuerdos y alertas de EcoEstudiante',
        importance: 5,
        visibility: 1,
        // A silent file: without one Android plays its default tone.
        sound: sound ? 'eco_alerta.mp3' : 'eco_silencio.wav',
        vibration,
      })
    }
  }
}

export type SystemPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export async function systemPermission(): Promise<SystemPermission> {
  if (!isNative) return 'unsupported'
  const { display } = await LocalNotifications.checkPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

export async function requestSystemPermission(): Promise<SystemPermission> {
  if (!isNative) return 'unsupported'
  const { display } = await LocalNotifications.requestPermissions()
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt'
}

let inForeground = !document.hidden

// Track foreground from the start (not only after login); the WebView's own visibility isn't reliable on Android.
if (isNative) {
  App.getState().then(({ isActive }) => (inForeground = isActive)).catch(() => undefined)
  App.addListener('appStateChange', ({ isActive }) => {
    inForeground = isActive
  })
} else {
  document.addEventListener('visibilitychange', () => (inForeground = !document.hidden))
}

/*
 * Con la app en segundo plano o cerrada, los avisos llegan como push (Firebase) desde el servidor:
 * la app cierra su conexión en vivo al salir, así el servidor sabe que debe enviarlo (ver socket.ts).
 */

/** Comprueba el aviso de Android y su sonido al instante (con la app abierta). */
export async function testSystemNotification() {
  if ((await systemPermission()) !== 'granted') return false
  await ensureChannels()
  const { notifications } = getSettings()
  const text = 'Así se ven los avisos de EcoEstudiante en Android.'
  await LocalNotifications.schedule({
    notifications: [{
      id: androidId(`prueba-${Date.now()}`),
      title: 'EcoEstudiante',
      body: text,
      largeBody: text,
      smallIcon: 'ic_stat_eco',
      iconColor: '#176B4B',
      channelId: channelId(notifications.sound, notifications.vibrate),
      extra: { link: '#/cuenta/notificaciones' },
    }],
  })
  return true
}

/* ---------- start ---------- */

// Solo avisan las notificaciones que llegan en vivo por el socket; las que se cargan del servidor
// al abrir la app ya se ven en la lista y no muestran la ventana emergente.
const seen = new Set(getState().notifications.map((n) => n.id))
subscribe(() => {
  const state = getState()
  for (const n of state.notifications) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    if (!n.live || n.userId !== state.sessionUserId || n.read) continue
    if (inForeground) alertInApp(n)
  }
})

let started = false

/** Android setup once someone is signed in: channels and taps on local notifications (the permission is asked by push.ts). */
export function startAlerts() {
  if (started) return
  started = true
  if (!isNative) return
  ensureChannels()
  LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const link = notification.extra?.link
    if (typeof link === 'string') navigate(link)
  })
}
