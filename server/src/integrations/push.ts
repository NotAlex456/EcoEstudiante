import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import type { Config } from '../config'

export type PushMessage = { title: string; body: string; link: string }

export type PushSender = {
  mode: 'firebase' | 'off'
  /** Envía a varios celulares. Devuelve los tokens que Firebase ya no reconoce (para borrarlos). */
  send(tokens: string[], message: PushMessage): Promise<{ invalidTokens: string[] }>
}

/** Errores de Firebase que significan "este celular ya no existe para nosotros". */
const GONE = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'])

/** Lima no tiene horario de verano: siempre UTC-5. */
const LIMA_OFFSET_HOURS = -5

/** Horario silencioso: de 22:00 a 06:59 en Lima, sin importar la zona horaria del servidor. */
export function isQuietHour(now: Date): boolean {
  const hour = (now.getUTCHours() + 24 + LIMA_OFFSET_HOURS) % 24
  return hour >= 22 || hour < 7
}

/** Firebase Cloud Messaging si hay credencial; si no, no envía nada (modo local). */
export function createPushSender(config: Config): PushSender {
  if (!config.firebaseServiceAccount) return { mode: 'off', send: async () => ({ invalidTokens: [] }) }

  const app = getApps()[0] ?? initializeApp({ credential: cert(config.firebaseServiceAccount as Parameters<typeof cert>[0]) })
  const messaging = getMessaging(app)

  return {
    mode: 'firebase',
    async send(tokens, message) {
      if (!tokens.length) return { invalidTokens: [] }
      const result = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: message.title, body: message.body },
        data: { link: message.link },
        android: {
          priority: 'high',
          // Canal que la app crea al iniciar (con sonido y vibración) y el ícono de la barra de estado.
          notification: { channelId: 'eco-sonido-vibra', icon: 'ic_stat_eco', color: '#176B4B' },
        },
      })
      const invalidTokens = result.responses.flatMap((r, i) => (!r.success && r.error && GONE.has(r.error.code) ? [tokens[i]] : []))
      return { invalidTokens }
    },
  }
}
