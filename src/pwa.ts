import { Capacitor } from '@capacitor/core'
import { useSyncExternalStore } from 'react'

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** True inside the Android APK built with Capacitor. */
export const isNativeApp = Capacitor.isNativePlatform()

const standalone = () =>
  isNativeApp ||
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

let installState: 'installed' | 'ios' | 'browser' = standalone()
  ? 'installed'
  : /iphone|ipad|ipod/i.test(navigator.userAgent)
    ? 'ios'
    : 'browser'

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferred = event as InstallPromptEvent
  emit()
})

window.addEventListener('appinstalled', () => {
  deferred = null
  installState = 'installed'
  emit()
})

export const canInstall = () => deferred !== null

export async function installApp() {
  if (!deferred) return
  await deferred.prompt()
  await deferred.userChoice
  deferred = null
  emit()
}

export function useInstallState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => `${installState}${deferred ? '+' : ''}`,
  ).replace('+', '') as typeof installState
}

export function registerServiceWorker() {
  // The APK already ships every file, so only the web version needs the service worker.
  if (isNativeApp || !('serviceWorker' in navigator) || import.meta.env.DEV) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // Offline support is optional; the app works without it.
    })
  })
}
