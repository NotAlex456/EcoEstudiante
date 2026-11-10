import { FormEvent, useMemo, useRef, useState } from 'react'
import { normalizeCategory } from '../../shared/text'
import { Autocomplete, Select } from '../components/inputs'
import { BackLink, Button, Field, Icon, ModeTag } from '../components/ui'
import { CAREERS, CONDITIONS, CYCLES, MODES, rankedValues, SEED_CATEGORY_LIST } from '../lib/data'
import { compressImage } from '../lib/images'
import { navigate } from '../lib/router'
import { currentUser, materialById, MaterialInput, publishMaterial, toast, updateMaterial, useStore } from '../lib/store'
import type { Condition, Mode } from '../lib/types'

const MAX_PHOTOS = 3

export function Publish({ editId }: { editId?: string }) {
  const me = useStore(currentUser)!
  const editing = useStore((s) => (editId ? materialById(s, editId) : undefined))
  const [step, setStep] = useState(1)
  const [done, setDone] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busyPhotos, setBusyPhotos] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<MaterialInput>(() =>
    editing
      ? { title: editing.title, course: editing.course, career: editing.career, cycle: editing.cycle, category: editing.category, mode: editing.mode, price: editing.price, exchangeFor: editing.exchangeFor, condition: editing.condition, description: editing.description, images: editing.images }
      : { title: '', course: '', career: me.career, cycle: me.cycle, category: '', mode: 'Venta', price: 0, exchangeFor: '', condition: 'Buen estado', description: '', images: [] },
  )
  const [accepted, setAccepted] = useState(Boolean(editing))
  // Sugerencias: lo que otros ya escribieron (más usado primero) + las categorías de ejemplo.
  const allMaterials = useStore((s) => s.materials)
  const categorySuggestions = useMemo(() => {
    const used = rankedValues(allMaterials, (m) => m.category).map((c) => c.name)
    return [...used, ...SEED_CATEGORY_LIST.filter((c) => !used.includes(c))]
  }, [allMaterials])
  const courseSuggestions = useMemo(() => rankedValues(allMaterials, (m) => m.course).map((c) => c.name), [allMaterials])

  if (editId && (!editing || editing.ownerId !== me.id)) {
    return <section className="publish-page page-enter"><BackLink label="Volver" fallback="#/actividad/publicaciones" /><p>No puedes editar esta publicación.</p></section>
  }

  const set = <K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  const validate = (current: number) => {
    const next: Record<string, string> = {}
    if (current === 1) {
      if (form.title.trim().length < 5) next.title = 'Escribe un título de al menos 5 caracteres.'
      if (form.course.trim().length < 2) next.course = 'Indica el curso (al menos 2 caracteres).'
      if (normalizeCategory(form.category).length < 2) next.category = 'Indica la categoría (por ejemplo: Libros, Uniformes, Material de laboratorio).'
      if (form.mode === 'Venta' && !(form.price > 0)) next.price = 'Indica un precio mayor a S/ 0.'
      if (form.mode === 'Venta' && form.price > 500) next.price = 'El precio máximo es S/ 500.'
    }
    if (current === 2) {
      if (form.description.trim().length < 20) next.description = 'Describe el material en al menos 20 caracteres (estado, accesorios, señales de uso).'
      if (!form.images.length) next.images = 'Agrega al menos una foto real del material.'
    }
    setErrors(next)
    return !Object.keys(next).length
  }

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return
    const room = MAX_PHOTOS - form.images.length
    if (room <= 0) return toast(`Máximo ${MAX_PHOTOS} fotos por publicación.`, 'error')
    setBusyPhotos(true)
    try {
      const picked = Array.from(files).slice(0, room)
      const tooBig = picked.find((f) => f.size > 15 * 1024 * 1024)
      if (tooBig) throw new Error('Una de las fotos pesa más de 15 MB.')
      const images = await Promise.all(picked.map((f) => compressImage(f)))
      set('images', [...form.images, ...images])
      if (files.length > room) toast(`Solo se agregaron ${room} foto(s). Máximo ${MAX_PHOTOS}.`, 'error')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No pudimos cargar la foto.', 'error')
    } finally {
      setBusyPhotos(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (saving || !validate(step)) return
    if (step < 3) {
      setStep(step + 1)
      window.scrollTo({ top: 0 })
      return
    }
    const data: MaterialInput = {
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      price: form.mode === 'Venta' ? form.price : 0,
      exchangeFor: form.mode === 'Intercambio' ? form.exchangeFor?.trim() || undefined : undefined,
    }
    // Si el servidor falla, el error ya se mostró y el formulario conserva lo escrito.
    setSaving(true)
    if (editing) {
      const ok = await updateMaterial(editing.id, data)
      setSaving(false)
      if (!ok) return
      toast('Publicación actualizada')
      navigate(`#/material/${editing.id}`, { replace: true })
    } else {
      const id = await publishMaterial(data)
      setSaving(false)
      if (id) setDone(id)
    }
  }

  if (done) {
    return (
      <section className="success-view page-enter">
        <div className="success-view__icon"><Icon name="check" size={38} /></div>
        <p className="eyebrow">Publicación creada</p>
        <h1>Tu material ya puede encontrar una nueva vida</h1>
        <p><strong>{form.title}</strong> ahora está visible para la comunidad estudiantil. Te avisaremos cuando alguien te escriba.</p>
        <div className="success-view__actions">
          <Button onClick={() => navigate(`#/material/${done}`, { replace: true })}>Ver mi publicación</Button>
          <Button variant="secondary" onClick={() => { setDone(null); setStep(1); setAccepted(false); setForm({ ...form, title: '', description: '', images: [], price: 0, exchangeFor: '' }) }}>Publicar otro</Button>
        </div>
      </section>
    )
  }

  return (
    <section className="publish-page page-enter">
      {editing && <BackLink label="Volver" fallback={`#/material/${editing.id}`} />}
      <div className="page-title">
        <p className="eyebrow">{editing ? 'Actualiza tu publicación' : 'Comparte con la comunidad'}</p>
        <h1>{editing ? 'Editar material' : 'Publicar un material'}</h1>
        <p>Completa los datos con honestidad para que otro estudiante pueda decidir con confianza.</p>
      </div>
      <div className="stepper">
        {[1, 2, 3].map((n) => (
          <div key={n} className={step >= n ? 'is-active' : ''}>
            <i>{step > n ? <Icon name="check" size={14} /> : n}</i>
            <span>{n === 1 ? 'Datos' : n === 2 ? 'Estado y fotos' : 'Revisar'}</span>
          </div>
        ))}
      </div>
      <form className="publish-form" onSubmit={submit} noValidate>
        {step === 1 && <>
          <div className="form-section-title"><span>01</span><div><h2>Cuéntanos qué material tienes</h2><p>Estos datos ayudarán a encontrarlo por curso.</p></div></div>
          <Field label="Título del material" error={errors.title}>
            <input value={form.title} maxLength={70} onChange={(e) => set('title', e.target.value)} placeholder="Ej.: Calculadora científica Casio" />
          </Field>
          <div className="form-grid">
            <Field label="Categoría" error={errors.category} hint="Escribe lo que es: libro, uniforme, kit de laboratorio…">
              <Autocomplete value={form.category} maxLength={40} suggestions={categorySuggestions} onChange={(v) => set('category', v)} placeholder="Ej.: Libros" />
            </Field>
            <Field label="Carrera">
              <Select label="Carrera" value={form.career} options={CAREERS.map((c) => ({ value: c, label: c }))} onChange={(v) => set('career', v)} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Curso" error={errors.course}>
              <Autocomplete value={form.course} maxLength={80} suggestions={courseSuggestions} onChange={(v) => set('course', v)} placeholder="Escribe el curso" />
            </Field>
            <Field label="Ciclo del curso">
              <Select label="Ciclo del curso" value={form.cycle} options={CYCLES.map((c) => ({ value: c, label: `${c}.° ciclo` }))} onChange={(v) => set('cycle', v)} />
            </Field>
          </div>
          <Field label="¿Qué quieres hacer?">
            <div className="mode-selector">
              {MODES.map((item) => <button type="button" aria-pressed={form.mode === item} className={form.mode === item ? 'is-active' : ''} onClick={() => set('mode', item as Mode)} key={item}>{item}</button>)}
            </div>
          </Field>
          {form.mode === 'Venta' && (
            <Field label="Precio (S/)" error={errors.price} hint="Sugerencia: entre 30 % y 60 % del precio nuevo.">
              <input type="number" inputMode="decimal" min="1" max="500" value={form.price || ''} onChange={(e) => set('price', Number(e.target.value))} placeholder="0.00" />
            </Field>
          )}
          {form.mode === 'Intercambio' && (
            <Field label="¿Qué te gustaría recibir a cambio? (opcional)">
              <input value={form.exchangeFor ?? ''} maxLength={80} onChange={(e) => set('exchangeFor', e.target.value)} placeholder="Ej.: apuntes de Física I" />
            </Field>
          )}
        </>}

        {step === 2 && <>
          <div className="form-section-title"><span>02</span><div><h2>Muestra el estado real</h2><p>Las fotos honestas generan acuerdos más seguros.</p></div></div>
          <Field label="Estado del material">
            <div className="mode-selector">
              {CONDITIONS.map((c) => <button type="button" aria-pressed={form.condition === c} className={form.condition === c ? 'is-active' : ''} onClick={() => set('condition', c as Condition)} key={c}>{c}</button>)}
            </div>
          </Field>
          <Field label="Descripción" error={errors.description} hint={`${form.description.trim().length}/400 · Menciona señales de uso, accesorios o páginas marcadas.`}>
            <textarea rows={4} maxLength={400} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe señales de uso, accesorios incluidos o detalles importantes..." />
          </Field>
          <div className={`field ${errors.images ? 'has-error' : ''}`}>
            <span className="field__label">Fotos reales (obligatorio · hasta {MAX_PHOTOS})</span>
            {form.images.length > 0 && (
              <div className="photo-grid">
                {form.images.map((src, i) => (
                  <div key={i} className="photo-grid__item">
                    <img src={src} alt={`Foto ${i + 1}`} />
                    {i === 0 && <span>Portada</span>}
                    <button type="button" aria-label={`Quitar foto ${i + 1}`} onClick={() => set('images', form.images.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            {form.images.length < MAX_PHOTOS && (
              <div className="upload-zone">
                <Icon name="camera" size={30} />
                <strong>{busyPhotos ? 'Procesando fotos…' : 'Agrega fotos del material'}</strong>
                <span>Toma una foto o elígela de tu galería</span>
                <Button type="button" variant="secondary" disabled={busyPhotos} onClick={() => fileRef.current?.click()}><Icon name="upload" size={18} /> Seleccionar fotos</Button>
                <input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} />
              </div>
            )}
            {errors.images ? <span className="field__error" role="alert">{errors.images}</span> : <span className="field__hint">JPG o PNG. Las reducimos automáticamente para ahorrar datos.</span>}
          </div>
        </>}

        {step === 3 && <>
          <div className="form-section-title"><span>03</span><div><h2>Revisa antes de publicar</h2><p>Podrás editar esta información después.</p></div></div>
          <div className="review-card">
            <img className="review-card__visual" src={form.images[0]} alt="" />
            <div>
              <ModeTag mode={form.mode} />
              <h3>{form.title}</h3>
              <p>{form.course} · {form.cycle}.° ciclo · {form.condition}</p>
              <strong>{form.mode === 'Venta' ? `S/ ${form.price}` : form.mode === 'Donación' ? 'Gratis' : `Intercambio${form.exchangeFor ? ` por ${form.exchangeFor}` : ''}`}</strong>
            </div>
          </div>
          <p className="review-description">{form.description}</p>
          <label className="check-row">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
            <span>Afirmo que la información es real y que el material cumple las <a href="#/cuenta/seguridad">normas de la comunidad</a>.</span>
          </label>
        </>}

        <div className="form-actions">
          {step > 1 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Volver</Button>}
          <Button type="submit" disabled={saving || (step === 3 && !accepted)}>{step === 3 ? (saving ? (editing ? 'Guardando…' : 'Publicando…') : editing ? 'Guardar cambios' : 'Publicar material') : 'Continuar'}</Button>
        </div>
      </form>
    </section>
  )
}
