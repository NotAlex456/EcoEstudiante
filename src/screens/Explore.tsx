import { useEffect, useMemo, useState } from 'react'
import { Button, EmptyState, Icon, IconName, MaterialCard } from '../components/ui'
import { CAREERS, CATEGORIES, CONDITIONS, CYCLES, MODES } from '../lib/data'
import { currentUser, matchesSearch, saveSearch, toggleSaved, useStore } from '../lib/store'

const categoryIcons: Record<string, IconName> = { Libros: 'book', Apuntes: 'notes', Calculadoras: 'calculator', Separatas: 'file' }

type Filters = {
  query: string
  category: string
  mode: string
  career: string
  cycle: string
  condition: string
  maxPrice: string
  sort: 'recientes' | 'precio'
}

const emptyFilters: Filters = { query: '', category: 'Todos', mode: 'Todos', career: 'Todas', cycle: 'Todos', condition: 'Todos', maxPrice: '', sort: 'recientes' }
// Survives leaving the screen, so going back from a detail keeps the search.
let remembered: Filters = emptyFilters

export function Explore() {
  const me = useStore(currentUser)!
  const materials = useStore((s) => s.materials)
  const saved = useStore((s) => s.saved[me.id]) ?? []
  const reports = useStore((s) => s.reports)
  const reported = useMemo(() => reports.filter((r) => r.userId === me.id).map((r) => r.materialId), [reports, me.id])
  const savedSearches = useStore((s) => s.savedSearches)
  const [filters, setFilters] = useState<Filters>(remembered)
  const [showFilters, setShowFilters] = useState(false)
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }))

  useEffect(() => { remembered = filters }, [filters])

  const visible = useMemo(() => materials.filter((m) => (m.status === 'Disponible' || m.status === 'Reservado') && !reported.includes(m.id)), [materials, reported])

  const filtered = useMemo(() => {
    const list = visible.filter((m) =>
      matchesSearch(m, filters) &&
      (filters.career === 'Todas' || m.career === filters.career) &&
      (filters.cycle === 'Todos' || m.cycle === Number(filters.cycle)) &&
      (filters.condition === 'Todos' || m.condition === filters.condition) &&
      (!filters.maxPrice || m.mode !== 'Venta' || m.price <= Number(filters.maxPrice)),
    )
    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Disponible' ? -1 : 1
      if (filters.sort === 'precio') return (a.mode === 'Venta' ? a.price : 0) - (b.mode === 'Venta' ? b.price : 0)
      return b.createdAt - a.createdAt
    })
  }, [visible, filters])

  const activeFilters = ['career', 'cycle', 'condition', 'mode'].filter((k) => !['Todas', 'Todos'].includes(filters[k as keyof Filters])).length + (filters.maxPrice ? 1 : 0)
  const alreadySaved = savedSearches.some((s) => s.userId === me.id && s.query === filters.query && s.category === filters.category && s.mode === filters.mode)
  const firstName = me.name.split(' ')[0]

  return (
    <section className="explore page-enter">
      <div className="hero">
        <div className="hero__content">
          <span className="hero__pill"><Icon name="leaf" size={16} /> Hola, {firstName}</span>
          <h1>Lo que necesitas para estudiar, <em>ya está cerca.</em></h1>
          <p>Encuentra, intercambia o recibe materiales de otros estudiantes de la UPSJB Chincha.</p>
          <form className="search-box" role="search" onSubmit={(e) => { e.preventDefault(); (document.activeElement as HTMLElement)?.blur(); document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }) }}>
            <Icon name="search" />
            <input type="search" enterKeyHint="search" aria-label="Buscar por curso o material" placeholder="Busca por curso o material..." value={filters.query} onChange={(e) => set({ query: e.target.value })} />
            {filters.query && <button type="button" className="icon-button" aria-label="Borrar búsqueda" onClick={() => set({ query: '' })}><Icon name="close" size={18} /></button>}
            <Button type="submit">Buscar</Button>
          </form>
          <div className="trust-row"><span><Icon name="shield" size={16} /> Comunidad verificada</span><span><Icon name="pin" size={16} /> Entregas en el campus</span></div>
        </div>
        <div className="hero__art">
          <div className="hero__shape" />
          <img src={materials.find((m) => m.id === 'm-3')?.images[0] ?? materials[0]?.images[0]} alt="Materiales de estudio listos para reutilizar" />
          <div className="floating-card floating-card--top"><span><Icon name="book" /></span><div><strong>{visible.length}</strong><small>materiales disponibles</small></div></div>
          <div className="floating-card floating-card--bottom"><span><Icon name="check" /></span><div><strong>Verificado</strong><small>Solo comunidad UPSJB</small></div></div>
        </div>
      </div>

      <div className="category-section">
        <div className="section-heading"><div><p className="eyebrow">Explora fácilmente</p><h2>¿Qué estás buscando?</h2></div><button onClick={() => set({ category: 'Todos' })}>Ver todo</button></div>
        <div className="categories">
          {CATEGORIES.map((label, index) => (
            <button className={filters.category === label ? 'is-active' : ''} key={label} aria-pressed={filters.category === label} onClick={() => set({ category: filters.category === label ? 'Todos' : label })}>
              <span className={`category-icon category-icon--${index}`}><Icon name={categoryIcons[label]} /></span>
              <strong>{label}</strong>
              <small>{visible.filter((m) => m.category === label).length} disponibles</small>
            </button>
          ))}
        </div>
      </div>

      <div className="results-section" id="results">
        <div className="section-heading section-heading--results">
          <div><p className="eyebrow">Recién publicados</p><h2>Materiales para ti</h2></div>
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}><Icon name="sliders" /> Filtros{activeFilters > 0 && <span className="count-badge">{activeFilters}</span>}</Button>
        </div>
        <div className="mode-chips" role="group" aria-label="Modalidad">
          {['Todos', ...MODES].map((item) => (
            <button key={item} className={filters.mode === item ? 'is-active' : ''} aria-pressed={filters.mode === item} onClick={() => set({ mode: item })}>{item}</button>
          ))}
        </div>
        <div className={`filters ${showFilters ? 'is-open' : ''}`}>
          <label><span>Carrera</span><select value={filters.career} onChange={(e) => set({ career: e.target.value })}><option>Todas</option>{CAREERS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span>Ciclo</span><select value={filters.cycle} onChange={(e) => set({ cycle: e.target.value })}><option>Todos</option>{CYCLES.map((c) => <option key={c} value={c}>{c}.° ciclo</option>)}</select></label>
          <label><span>Estado</span><select value={filters.condition} onChange={(e) => set({ condition: e.target.value })}><option>Todos</option>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span>Precio máx. (S/)</span><input type="number" inputMode="numeric" min="0" placeholder="Sin límite" value={filters.maxPrice} onChange={(e) => set({ maxPrice: e.target.value })} /></label>
          <label><span>Ordenar</span><select value={filters.sort} onChange={(e) => set({ sort: e.target.value as Filters['sort'] })}><option value="recientes">Más recientes</option><option value="precio">Menor precio</option></select></label>
          <button className="filters__clear" onClick={() => setFilters({ ...emptyFilters, query: filters.query })}>Limpiar filtros</button>
        </div>
        <p className="result-count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'material encontrado' : 'materiales encontrados'} {filters.query && <>para “{filters.query}”</>}</p>
        {filtered.length ? (
          <div className="materials-grid">
            {filtered.map((m) => <MaterialCard key={m.id} material={m} mine={m.ownerId === me.id} saved={saved.includes(m.id)} onSave={() => toggleSaved(m.id)} />)}
          </div>
        ) : (
          <EmptyState
            icon="search"
            title="No encontramos coincidencias"
            text="Prueba con otro curso, quita filtros o guarda la búsqueda y te avisaremos cuando alguien lo publique."
            action={
              <div className="empty-state__actions">
                <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>Limpiar filtros</Button>
                <Button disabled={alreadySaved} onClick={() => saveSearch({ query: filters.query, category: filters.category, mode: filters.mode })}><Icon name="bell" size={18} /> {alreadySaved ? 'Búsqueda guardada' : 'Avisarme'}</Button>
              </div>
            }
          />
        )}
      </div>
    </section>
  )
}
