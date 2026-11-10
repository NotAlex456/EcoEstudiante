import { useEffect, useState } from 'react'
import { BackLink, Button, Icon, Switch } from '../components/ui'
import { api, ApiError } from '../lib/api'
import { alertInApp, requestSystemPermission, serverPrefs, systemPermission, testSystemNotification, type SystemPermission } from '../lib/alerts'
import { registerPush } from '../lib/push'
import { CATEGORY_LABELS, resetAccessibility, updateSettings, useSettings, type NotificationCategory, type TextSize } from '../lib/settings'
import { currentUser, toast, updateNotificationPrefs, useStore } from '../lib/store'
import type { NotificationPrefs } from '../lib/types'

export function NotificationSettings() {
  const { notifications } = useSettings()
  // Push, horario silencioso y categorías se guardan en el servidor; lo demás, en este dispositivo.
  const prefs = useStore((s) => currentUser(s)?.notificationPrefs) ?? serverPrefs()
  const [saving, setSaving] = useState(false)
  const [permission, setPermission] = useState<SystemPermission>('unsupported')

  // Re-read while open: the person may come back from the phone's settings.
  useEffect(() => {
    const check = () => systemPermission().then(setPermission).catch(() => undefined)
    check()
    const timer = setInterval(check, 2000)
    return () => clearInterval(timer)
  }, [])

  const savePrefs = async (patch: Partial<NotificationPrefs>) => {
    setSaving(true)
    await updateNotificationPrefs(patch)
    setSaving(false)
  }

  const testNow = async () => {
    if (!(await testSystemNotification())) return toast('Primero permite las notificaciones de Android (arriba).', 'error')
    toast('Revisa la barra de notificaciones: el aviso debió aparecer.')
  }

  const testClosed = async () => {
    try {
      await api('POST', '/devices/test')
      toast('Cierra la app ahora: el aviso llegará en 10 segundos.')
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'No pudimos programar la prueba.', 'error')
    }
  }

  const set = (patch: Partial<typeof notifications>) => updateSettings({ notifications: patch })
  const setCategory = (category: NotificationCategory, on: boolean) =>
    savePrefs({ categories: { ...prefs.categories, [category]: on } })

  const enablePush = async (on: boolean) => {
    await savePrefs({ push: on })
    if (on && permission !== 'granted') {
      const result = await requestSystemPermission()
      setPermission(result)
      // Con el permiso recién concedido, registra este celular para recibir push (antes solo pasaba al iniciar sesión).
      if (result === 'granted') void registerPush()
      if (result === 'denied') toast('Android bloqueó las notificaciones. Actívalas en Ajustes del teléfono › Apps › EcoEstudiante.', 'error')
    }
  }

  return (
    <section className="account-page settings-page page-enter">
      <BackLink label="Volver" fallback="#/cuenta" />
      <div className="page-title"><p className="eyebrow">Ajustes</p><h1>Notificaciones</h1><p>Elige cómo y sobre qué quieres que te avisemos.</p></div>

      <h2 className="settings-heading">Cómo te avisamos</h2>
      <div className="settings-group">
        <Switch label="Ventana emergente" detail="Muestra el aviso arriba de la pantalla mientras usas la app" checked={notifications.popup} onChange={(popup) => set({ popup })} />
        <Switch label="Sonido" detail="Reproduce el tono de EcoEstudiante" checked={notifications.sound} onChange={(sound) => set({ sound })} />
        {notifications.sound && (
          <label className="setting-row setting-row--slider">
            <span><strong>Volumen del tono</strong><small>{Math.round(notifications.volume * 100)} %</small></span>
            <input type="range" min={0.1} max={1} step={0.1} value={notifications.volume} onChange={(e) => set({ volume: Number(e.target.value) })} aria-label="Volumen del tono" />
          </label>
        )}
        <Switch label="Vibración" checked={notifications.vibrate} onChange={(vibrate) => set({ vibrate })} />
        <Switch label="Silenciar de noche" detail="Sin avisos ni sonido de 10:00 p. m. a 7:00 a. m." checked={prefs.quietNight} disabled={saving} onChange={(quietNight) => savePrefs({ quietNight })} />
        {permission !== 'unsupported' && (
          <Switch
            label="Avisos con la app cerrada"
            detail={permission === 'denied' ? 'Bloqueado por Android: actívalo en Ajustes del teléfono › Apps › EcoEstudiante' : 'Notificaciones de Android cuando EcoEstudiante está cerrada o en segundo plano'}
            checked={prefs.push && permission === 'granted'}
            disabled={saving}
            onChange={enablePush}
          />
        )}
      </div>
      <Button variant="secondary" className="full-button" onClick={() => alertInApp({ id: `prueba-${Date.now()}`, text: 'Así se verán tus avisos de EcoEstudiante.', link: '#/notificaciones' }, { test: true })}>
        <Icon name="volume" size={18} /> Probar notificación
      </Button>
      {permission !== 'unsupported' && <>
        <h2 className="settings-heading">Revisar avisos de Android</h2>
        <div className="settings-group">
          <div className="setting-row">
            <span><strong>Permiso de notificaciones</strong><small>{permission === 'granted' ? 'Permitido' : permission === 'denied' ? 'Bloqueado: actívalo en Ajustes del teléfono › Apps › EcoEstudiante › Notificaciones' : 'Aún no concedido'}</small></span>
            {permission === 'granted' ? <span className="status-dot status-dot--ok">Listo</span> : <Button variant="secondary" onClick={() => enablePush(true)}>Permitir</Button>}
          </div>
        </div>
        <Button variant="secondary" className="full-button" onClick={testNow}>
          <Icon name="bell" size={18} /> Paso 1: probar aviso de Android ahora
        </Button>
        <Button variant="secondary" className="full-button" onClick={testClosed}>
          <Icon name="clock" size={18} /> Paso 2: probar con la app cerrada (10 s)
        </Button>
      </>}

      <h2 className="settings-heading">Sobre qué te avisamos</h2>
      <div className="settings-group">
        {(Object.keys(CATEGORY_LABELS) as NotificationCategory[]).map((category) => (
          <Switch key={category} label={CATEGORY_LABELS[category].title} detail={CATEGORY_LABELS[category].detail} checked={prefs.categories[category]} disabled={saving} onChange={(on) => setCategory(category, on)} />
        ))}
      </div>
      <div className="notice notice--soft"><Icon name="info" /><p><strong>No te perderás nada</strong><span>Aunque apagues un tipo de aviso, lo seguirás viendo en la campana de notificaciones.</span></p></div>
      {permission !== 'unsupported' && (
        <div className="account-card phone-tips">
          <h3>¿No te llegan los avisos con la app cerrada?</h3>
          <p>Algunos celulares (Xiaomi, POCO y Redmi con HyperOS o MIUI, también Huawei y Oppo) cierran las apps para ahorrar batería. En Ajustes del teléfono › Apps › Administrar apps › EcoEstudiante:</p>
          <ol>
            <li><strong>Inicio automático:</strong> actívalo.</li>
            <li><strong>Ahorro de batería:</strong> elige “Sin restricciones”.</li>
            <li><strong>Notificaciones:</strong> permite las notificaciones y, en cada categoría, activa “Notificaciones flotantes” (el pop-up), “Pantalla de bloqueo” y el sonido.</li>
            <li>En la lista de apps recientes, mantén presionada EcoEstudiante y toca el candado para que no se cierre al limpiar.</li>
          </ol>
        </div>
      )}
    </section>
  )
}

const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'grande', label: 'Grande' },
  { id: 'muy-grande', label: 'Muy grande' },
]

export function AccessibilitySettings() {
  const { a11y } = useSettings()
  const set = (patch: Partial<typeof a11y>) => updateSettings({ a11y: patch })

  return (
    <section className="account-page settings-page page-enter">
      <BackLink label="Volver" fallback="#/cuenta" />
      <div className="page-title"><p className="eyebrow">Ajustes</p><h1>Accesibilidad</h1><p>Adapta EcoEstudiante para leerla y usarla con comodidad.</p></div>

      <h2 className="settings-heading">Lectura</h2>
      <div className="settings-group">
        <div className="setting-row setting-row--stack">
          <span><strong>Tamaño del texto</strong><small>Agranda las letras de toda la app</small></span>
          <div className="segmented" role="radiogroup" aria-label="Tamaño del texto">
            {TEXT_SIZES.map((size) => (
              <button key={size.id} role="radio" aria-checked={a11y.textSize === size.id} className={a11y.textSize === size.id ? 'is-active' : ''} onClick={() => set({ textSize: size.id })}>
                <span className={`segmented__sample segmented__sample--${size.id}`}>Aa</span>{size.label}
              </button>
            ))}
          </div>
        </div>
        <Switch label="Texto en negrita" detail="Letras más gruesas y fáciles de distinguir" checked={a11y.boldText} onChange={(boldText) => set({ boldText })} />
        <Switch label="Espaciado de lectura" detail="Más espacio entre letras, palabras y líneas (útil con dislexia)" checked={a11y.readingSpacing} onChange={(readingSpacing) => set({ readingSpacing })} />
      </div>

      <h2 className="settings-heading">Visión y movimiento</h2>
      <div className="settings-group">
        <Switch label="Alto contraste" detail="Textos más oscuros, bordes marcados y foco visible" checked={a11y.highContrast} onChange={(highContrast) => set({ highContrast })} />
        <Switch label="Reducir animaciones" detail="Quita transiciones y movimientos de pantalla" checked={a11y.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })} />
      </div>

      <div className="settings-preview" aria-hidden="true">
        <small>Vista previa</small>
        <strong>Calculadora científica Casio fx-991</strong>
        <p>Como nuevo · Matemática I · S/ 45. Entrega en la biblioteca central.</p>
      </div>

      <Button variant="ghost" className="full-button" onClick={() => { resetAccessibility(); toast('Accesibilidad restablecida') }}>
        <Icon name="refresh" size={18} /> Volver a los valores originales
      </Button>
      <div className="notice notice--soft"><Icon name="info" /><p><strong>Lector de pantalla</strong><span>EcoEstudiante funciona con TalkBack de Android. Actívalo en Ajustes del teléfono › Accesibilidad.</span></p></div>
    </section>
  )
}
