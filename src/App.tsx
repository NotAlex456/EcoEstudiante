import { useEffect, useState } from 'react'
import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { AppLogo, Avatar, Button, Icon, IconName, NotificationBanner, Toasts } from './components/ui'
import { getToken, setUnauthorizedHandler, waitForServer } from './lib/api'
import { syncAll } from './lib/sync'
import { startAlerts } from './lib/alerts'
import { registerPush } from './lib/push'
import { connectSocket, disconnectSocket } from './lib/socket'
import { navigate, Route, tabOf, useRoute } from './lib/router'
import { currentUser, logout, restoreSession, unreadCount, useStore } from './lib/store'
import { Account, Notifications } from './screens/Account'
import { Activity } from './screens/Activity'
import { AgreementDetail, Schedule, Scheduled } from './screens/Agreement'
import { Auth } from './screens/Auth'
import { Chat } from './screens/Chat'
import { Detail } from './screens/Detail'
import { Profile } from './screens/Profile'
import { Explore } from './screens/Explore'
import { Publish } from './screens/Publish'

const navItems: { id: string; hash: string; label: string; short: string; icon: IconName }[] = [
  { id: 'explore', hash: '#/', label: 'Explorar', short: 'Explorar', icon: 'home' },
  { id: 'publish', hash: '#/publicar', label: 'Publicar', short: 'Publicar', icon: 'plus' },
  { id: 'activity', hash: '#/actividad', label: 'Mi actividad', short: 'Actividad', icon: 'heart' },
  { id: 'account', hash: '#/cuenta', label: 'Mi cuenta', short: 'Cuenta', icon: 'user' },
]

function useBadges() {
  const state = useStore((s) => s)
  const me = currentUser(state)
  if (!me) return { notifications: 0, activity: 0 }
  const notifications = state.notifications.filter((n) => n.userId === me.id && !n.read).length
  const messages = state.conversations.filter((c) => c.participants.includes(me.id)).reduce((n, c) => n + unreadCount(state, c, me.id), 0)
  const toRate = state.agreements.filter((a) => a.buyerId === me.id && (a.status === 'Confirmado' || (a.status === 'Completado' && !a.rating))).length
  return { notifications, activity: messages + toRate }
}

function Sidebar({ active }: { active: string }) {
  const me = useStore(currentUser)!
  const badges = useBadges()
  const recirculated = useStore((s) => s.materials.filter((m) => m.status === 'Entregado').length + s.agreements.filter((a) => a.status === 'Completado').length)
  return (
    <aside className="sidebar">
      <AppLogo />
      <nav className="sidebar__nav" aria-label="Navegación principal">
        {navItems.map((item) => (
          <a key={item.id} href={item.hash} className={active === item.id ? 'is-active' : ''} aria-current={active === item.id ? 'page' : undefined}>
            <Icon name={item.icon} />
            <span>{item.label}</span>
            {item.id === 'activity' && badges.activity > 0 && <span className="count-badge">{badges.activity}</span>}
          </a>
        ))}
        <a href="#/notificaciones" className={active === 'notifications' ? 'is-active' : ''}>
          <Icon name="bell" /><span>Notificaciones</span>
          {badges.notifications > 0 && <span className="count-badge">{badges.notifications}</span>}
        </a>
      </nav>
      <div className="sidebar__impact">
        <span><Icon name="leaf" size={18} /></span>
        <div><strong>{recirculated} materiales</strong><small>recirculados en la comunidad</small></div>
      </div>
      <a className="sidebar__profile" href="#/cuenta">
        <Avatar name={me.name} />
        <div><strong>{me.name.split(' ').slice(0, 2).join(' ')}</strong><small>Estudiante verificado/a</small></div>
        <span className="verified"><Icon name="check" size={13} /></span>
      </a>
    </aside>
  )
}

function Topbar() {
  const me = useStore(currentUser)!
  const { notifications } = useBadges()
  return (
    <header className="topbar">
      <a href="#/" aria-label="Inicio"><AppLogo compact /></a>
      <div className="topbar__actions">
        <a href="#/notificaciones" aria-label={`Notificaciones${notifications ? `, ${notifications} sin leer` : ''}`}>
          <Icon name="bell" size={21} />
          {notifications > 0 && <i />}
        </a>
        <a href="#/cuenta" aria-label="Mi cuenta"><Avatar name={me.name} size="small" /></a>
      </div>
    </header>
  )
}

function MobileNav({ active }: { active: string }) {
  const { activity } = useBadges()
  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      {navItems.map((item) => (
        <a key={item.id} href={item.hash} className={active === item.id ? 'is-active' : ''} aria-current={active === item.id ? 'page' : undefined}>
          <span className="mobile-nav__icon">
            <Icon name={item.icon} size={21} />
            {item.id === 'activity' && activity > 0 && <span className="count-badge">{activity}</span>}
          </span>
          <span>{item.short}</span>
        </a>
      ))}
    </nav>
  )
}

type Boot = 'checking' | 'slow' | 'offline' | 'ready'

/** Espera al servidor (que puede estar "dormido" en el hosting gratuito) y confirma la sesión guardada. */
function useBoot(hasCachedSession: boolean) {
  const [boot, setBoot] = useState<Boot>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setBoot('checking')
    waitForServer(() => !cancelled && setBoot('slow')).then(async (online) => {
      if (cancelled) return
      if (online) await restoreSession()
      if (!cancelled) setBoot(online || hasCachedSession ? 'ready' : 'offline')
    })
    return () => {
      cancelled = true
    }
  }, [attempt])
  return { boot, retry: () => setAttempt((n) => n + 1) }
}

function BootScreen({ boot, onRetry }: { boot: Boot; onRetry: () => void }) {
  return (
    <div className="boot-screen" role="status" aria-live="polite">
      <AppLogo />
      {boot === 'slow' && <p>Conectando con el servidor…</p>}
      {boot === 'offline' && (
        <>
          <p>No pudimos conectar con el servidor.</p>
          <Button onClick={onRetry}>Reintentar</Button>
        </>
      )}
    </div>
  )
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'material': return <Detail key={route.id} id={route.id} />
    case 'chat': return <Chat key={route.id} id={route.id} />
    case 'schedule': return <Schedule materialId={route.materialId} />
    case 'scheduled': return <Scheduled agreementId={route.agreementId} />
    case 'agreement': return <AgreementDetail key={route.id} id={route.id} />
    case 'publish': return <Publish key={route.editId ?? 'new'} editId={route.editId} />
    case 'activity': return <Activity tab={route.tab} />
    case 'account': return <Account section={route.section} />
    case 'notifications': return <Notifications />
    case 'profile': return <Profile key={route.id} id={route.id} />
    default: return <Explore />
  }
}

export default function App() {
  const route = useRoute()
  const me = useStore(currentUser)
  const { boot, retry } = useBoot(Boolean(me))

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
      navigate('#/', { replace: true })
    })
  }, [])

  useEffect(() => {
    if (me) startAlerts()
  }, [me])

  // Al abrir la app o iniciar sesión: traer todo del servidor y escuchar los cambios en vivo.
  useEffect(() => {
    const token = getToken()
    if (boot !== 'ready' || !me?.id || !token) return
    void syncAll()
    connectSocket(token)
    void registerPush()
    // En Android, al salir de la app se cierra la conexión en vivo: así el servidor sabe que debe mandar
    // push. Al volver, se reconecta (y la conexión vuelve a sincronizar todo).
    const appState = Capacitor.isNativePlatform()
      ? NativeApp.addListener('appStateChange', ({ isActive }) => (isActive ? connectSocket(token) : disconnectSocket()))
      : null
    return () => {
      disconnectSocket()
      void appState?.then((handle) => handle.remove())
    }
  }, [boot, me?.id])

  // In-app links go through the router so the back button stays inside the app.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a')
      const href = link?.getAttribute('href')
      if (!href?.startsWith('#/') || event.defaultPrevented || event.metaKey || event.ctrlKey) return
      event.preventDefault()
      if (href !== location.hash) navigate(href)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  if (boot !== 'ready') return <><BootScreen boot={boot} onRetry={retry} /><Toasts /></>
  if (!me) return <><Auth /><Toasts /></>

  const active = tabOf(route)
  const fullScreen = route.name === 'chat'

  return (
    <div className={`app-shell ${fullScreen ? 'app-shell--focus' : ''}`}>
      <Sidebar active={active} />
      <Topbar />
      <main className="main-content">
        <Screen route={route} />
      </main>
      <MobileNav active={active} />
      <NotificationBanner />
      <Toasts />
    </div>
  )
}
