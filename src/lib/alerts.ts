import { useSyncExternalStore } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Haptics } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { navigate } from './router'
import { eventNotice, getState, noticeId, subscribe } from './store'
import { getSettings, isQuietTime, type NotificationCategory } from './settings'
import type { Notification } from './types'

const isNative = Capacitor.isNativePlatform()
const SOUND_URL = `${import.meta.env.BASE_URL}sounds/notificacion.mp3`

export const categoryOf = (link: string): NotificationCategory =>
  link.startsWith('#/chat') ? 'mensajes' : link.startsWith('#/acuerdo') ? 'acuerdos' : link.startsWith('#/material') ? 'busquedas' : 'cuenta'

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
  if (!options.test && !notifications.categories[category]) return
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

/** Ids handed to Android: scheduled when leaving the app, or posted while it was away. */
const handedToSystem = new Set<string>()

let inForeground = !document.hidden

// Track foreground from the start (not only after login); the WebView's own visibility isn't reliable on Android.
if (isNative) {
  App.getState().then(({ isActive }) => (inForeground = isActive)).catch(() => undefined)
  App.addListener('appStateChange', ({ isActive }) => {
    inForeground = isActive
    if (isActive) cancelBackgroundAlerts().catch(() => undefined)
    else scheduleBackgroundAlerts().catch(() => undefined)
  })
} else {
  document.addEventListener('visibilitychange', () => (inForeground = !document.hidden))
}

/** Without `at` Android shows it right away; with it, an alarm fires it later. */
function systemNotification(id: string, text: string, link: string, at?: number) {
  const { notifications } = getSettings()
  const quiet = isQuietTime(at ? new Date(at) : new Date())
  return {
    id: androidId(id),
    title: 'EcoEstudiante',
    body: text,
    largeBody: text,
    smallIcon: 'ic_stat_eco',
    iconColor: '#176B4B',
    channelId: channelId(notifications.sound && !quiet, notifications.vibrate && !quiet),
    ...(at && at > Date.now() + 1000 ? { schedule: { at: new Date(at), allowWhileIdle: true } } : {}),
    extra: { link },
  }
}

async function canNotifySystem() {
  if (!getSettings().notifications.system || (await systemPermission()) !== 'granted') return false
  await ensureChannels()
  return true
}

/** Leaving the app: Android shows the replies still on their way, even if the app gets closed. */
async function scheduleBackgroundAlerts() {
  if (!(await canNotifySystem())) return
  const state = getState()
  const { categories } = getSettings().notifications
  const pending = state.scheduled.flatMap((event) => {
    const notice = eventNotice(state, event)
    if (!notice || notice.userId !== state.sessionUserId || !categories[categoryOf(notice.link)]) return []
    handedToSystem.add(noticeId(event))
    return [systemNotification(noticeId(event), notice.text, notice.link, event.dueAt)]
  })
  if (pending.length) await LocalNotifications.schedule({ notifications: pending })
}

async function cancelBackgroundAlerts() {
  const { notifications } = await LocalNotifications.getPending()
  if (notifications.length) await LocalNotifications.cancel({ notifications: notifications.map((n) => ({ id: n.id })) })
  // Events not yet due will be shown inside the app instead; due ones Android already showed.
  const now = Date.now()
  const waiting = new Set(getState().scheduled.filter((e) => e.dueAt > now).map(noticeId))
  for (const id of handedToSystem) if (waiting.has(id)) handedToSystem.delete(id)
}

/** A notification created while the app is in the background that Android doesn't have yet. */
async function postNow(n: Notification) {
  if (!getSettings().notifications.categories[categoryOf(n.link)] || !(await canNotifySystem())) return
  handedToSystem.add(n.id)
  await LocalNotifications.schedule({ notifications: [systemNotification(n.id, n.text, n.link)] })
}

/** Back in the app (or opening it after it was closed): skip what Android already showed. */
async function alertUnlessShown(n: Notification) {
  if (handedToSystem.has(n.id)) return
  if (isNative) {
    const { notifications } = await LocalNotifications.getDeliveredNotifications()
    if (notifications.some((d) => d.id === androidId(n.id))) return
  }
  alertInApp(n)
}

/** Checks the Android notification and its sound: right away (`seconds` 0), or later to test with the app closed. */
export async function testSystemNotification(seconds: number) {
  if (!(await canNotifySystem())) return false
  const id = `prueba-${Date.now()}`
  const text = seconds ? 'Así te avisaremos cuando EcoEstudiante esté cerrada.' : 'Así se ven los avisos de EcoEstudiante en Android.'
  await LocalNotifications.schedule({
    notifications: [systemNotification(id, text, '#/cuenta/notificaciones', seconds ? Date.now() + seconds * 1000 : undefined)],
  })
  return true
}

/** Whether Android lets alarms fire on time (needed for avisos a few seconds after leaving the app). */
export async function exactAlarmsAllowed() {
  if (!isNative) return true
  const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
  return exact_alarm === 'granted'
}

export async function openExactAlarmSetting() {
  if (isNative) await LocalNotifications.changeExactNotificationSetting()
}

/* ---------- start ---------- */

// Watch from the moment the app loads, so replies that came while it was closed are noticed too.
const seen = new Set(getState().notifications.map((n) => n.id))
subscribe(() => {
  const state = getState()
  for (const n of state.notifications) {
    if (seen.has(n.id)) continue
    seen.add(n.id)
    if (n.userId !== state.sessionUserId || n.read) continue
    if (inForeground) alertUnlessShown(n).catch(() => undefined)
    else if (isNative && !handedToSystem.has(n.id)) postNow(n).catch(() => undefined)
  }
})

let started = false

/** Android setup once someone is signed in: channels, taps, app state and the permission prompt. */
export function startAlerts() {
  if (started) return
  started = true
  if (!isNative) return
  ensureChannels()
  LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const link = notification.extra?.link
    if (typeof link === 'string') navigate(link)
  })
  // First run: Android 13+ asks once for permission to show notifications.
  if (getSettings().notifications.system) {
    systemPermission().then((p) => (p === 'prompt' ? requestSystemPermission() : p)).catch(() => undefined)
  }
}
