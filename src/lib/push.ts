/**
 * Push de Android (Firebase Cloud Messaging). Al iniciar sesión se pide permiso y se registra el token del celular
 * en el servidor; al tocar un aviso se abre su pantalla; al cerrar sesión se quita el token. En la web no hace nada.
 */
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { api } from './api'
import { navigate } from './router'

const isNative = Capacitor.isNativePlatform()

let currentToken: string | null = null
let listening = false

function listen() {
  if (listening) return
  listening = true
  PushNotifications.addListener('registration', ({ value }) => {
    currentToken = value
    api('POST', '/devices', { token: value, platform: 'android' }).catch(() => undefined)
  })
  PushNotifications.addListener('registrationError', () => undefined)
  // Tocar el aviso abre la conversación, el acuerdo o lo que corresponda.
  PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
    const link = notification.data?.link
    if (typeof link === 'string' && link.startsWith('#/')) navigate(link)
  })
}

/** Pide permiso (solo la primera vez lo pregunta Android) y registra este celular para recibir push. */
export async function registerPush() {
  if (!isNative) return
  try {
    listen()
    let { receive } = await PushNotifications.checkPermissions()
    if (receive === 'prompt' || receive === 'prompt-with-rationale') receive = (await PushNotifications.requestPermissions()).receive
    if (receive === 'granted') await PushNotifications.register()
  } catch {
    // sin Firebase configurado en el APK o sin servicios de Google: la app sigue funcionando sin push
  }
}

/**
 * Quita este celular de la cuenta (al cerrar sesión). La petición sale en este mismo instante, todavía con la
 * sesión activa; si falla (sin conexión), el servidor lo reasigna cuando otra cuenta registre el mismo token.
 */
export function unregisterPush() {
  if (!currentToken) return
  const token = currentToken
  currentToken = null
  api('DELETE', `/devices/${encodeURIComponent(token)}`).catch(() => undefined)
}
