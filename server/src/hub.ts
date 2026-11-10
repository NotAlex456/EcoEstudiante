import type { Config } from './config'
import type { Notifier } from './notify/notify'
import type { Realtime } from './realtime/socket'

/** Lo que necesitan los servicios que avisan a otros: configuración, socket y notificaciones. */
export type Hub = { config: Config; realtime: Realtime; notifier: Notifier }
