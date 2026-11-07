import { useSyncExternalStore } from 'react'

/** Hash routes keep the phone's back button working without a server. */
export type Route =
  | { name: 'explore' }
  | { name: 'material'; id: string }
  | { name: 'chat'; id: string }
  | { name: 'schedule'; materialId: string }
  | { name: 'scheduled'; agreementId: string }
  | { name: 'agreement'; id: string }
  | { name: 'publish'; editId?: string }
  | { name: 'activity'; tab?: string }
  | { name: 'account'; section?: string }
  | { name: 'notifications' }
  | { name: 'profile'; id: string }

export function parseRoute(hash: string): Route {
  const [, section = '', id = '', extra = ''] = hash.replace(/^#/, '').split('/')
  switch (section) {
    case 'material':
      if (id && extra === 'acordar') return { name: 'schedule', materialId: id }
      return id ? { name: 'material', id } : { name: 'explore' }
    case 'chat':
      return id ? { name: 'chat', id } : { name: 'activity', tab: 'mensajes' }
    case 'acuerdo':
      if (id && extra === 'listo') return { name: 'scheduled', agreementId: id }
      return id ? { name: 'agreement', id } : { name: 'activity', tab: 'acuerdos' }
    case 'publicar':
      return { name: 'publish', editId: id || undefined }
    case 'actividad':
      return { name: 'activity', tab: id || undefined }
    case 'cuenta':
      return { name: 'account', section: id || undefined }
    case 'notificaciones':
      return { name: 'notifications' }
    case 'perfil':
      return id ? { name: 'profile', id } : { name: 'account' }
    default:
      return { name: 'explore' }
  }
}

export function navigate(hash: string, options: { replace?: boolean } = {}) {
  if (options.replace) history.replaceState(history.state, '', hash)
  else history.pushState({ inApp: true }, '', hash)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
  window.scrollTo({ top: 0 })
}

export function goBack(fallback: string) {
  // Entries pushed by the app can go back; a deep link opened directly cannot.
  if (history.state?.inApp) history.back()
  else navigate(fallback, { replace: true })
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    (listener) => {
      window.addEventListener('hashchange', listener)
      return () => window.removeEventListener('hashchange', listener)
    },
    () => location.hash,
  )
  return parseRoute(hash)
}

export const tabOf = (route: Route) =>
  route.name === 'publish'
    ? 'publish'
    : route.name === 'activity' || route.name === 'agreement' || route.name === 'chat'
      ? 'activity'
      : route.name === 'account'
        ? 'account'
        : route.name === 'notifications'
          ? 'notifications'
          : 'explore'
