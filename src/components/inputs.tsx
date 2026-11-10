/**
 * Controles de formulario con la identidad de la app: selector (en lugar del <select> del sistema, que en Android
 * abre un menú oscuro), campo de contraseña con 👁 y campo de texto con sugerencias.
 */
import { useEffect, useId, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { foldText } from '../../shared/text'
import { Icon } from './ui'

/* ---------- selector ---------- */

export type SelectOption<T> = { value: T; label: string }

const isNarrow = () => window.matchMedia('(max-width: 760px)').matches

/**
 * En el celular abre un panel desde abajo; en pantallas anchas, una lista desplegable bajo el campo.
 * Teclado: flechas, Inicio/Fin, Enter o Espacio para elegir, Escape para cerrar y la primera letra para saltar.
 */
export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  className = '',
}: {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [active, setActive] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value))
  const selected = options[selectedIndex]

  const openList = () => {
    if (disabled) return
    setActive(selectedIndex)
    setSheet(isNarrow())
    setOpen(true)
  }
  const close = (focusTrigger = true) => {
    setOpen(false)
    if (focusTrigger) triggerRef.current?.focus()
  }
  const choose = (index: number) => {
    const option = options[index]
    if (option) onChange(option.value)
    close()
  }

  // Al abrir, el foco va a la opción activa; la página no se desplaza detrás del panel.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.focus()
  }, [open, active])
  useEffect(() => {
    if (!open || !sheet) return
    document.body.classList.add('no-scroll')
    return () => document.body.classList.remove('no-scroll')
  }, [open, sheet])
  useEffect(() => {
    if (!open || sheet) return
    const onDown = (e: MouseEvent) => {
      if (!listRef.current?.parentElement?.contains(e.target as Node)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, sheet])

  const onListKey = (e: KeyboardEvent) => {
    const last = options.length - 1
    if (e.key === 'ArrowDown') setActive((i) => Math.min(last, i + 1))
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(0, i - 1))
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(last)
    else if (e.key === 'Enter' || e.key === ' ') choose(active)
    else if (e.key === 'Escape' || e.key === 'Tab') close(e.key === 'Escape')
    else if (e.key.length === 1) {
      const letter = foldText(e.key)
      const start = (active + 1) % options.length
      const order = [...options.slice(start), ...options.slice(0, start)]
      const hit = order.findIndex((o) => foldText(o.label).startsWith(letter))
      if (hit >= 0) setActive((start + hit) % options.length)
      else return
    } else return
    e.preventDefault()
  }

  const list = (
    <ul ref={listRef} id={listId} role="listbox" aria-label={label} className="select__list" onKeyDown={onListKey}>
      {options.map((o, i) => (
        <li
          key={String(o.value)}
          role="option"
          data-index={i}
          tabIndex={i === active ? 0 : -1}
          aria-selected={o.value === value}
          className={`select__option ${i === active ? 'is-active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(i)}
        >
          <span>{o.label}</span>
          {o.value === value && <Icon name="check" size={18} />}
        </li>
      ))}
    </ul>
  )

  return (
    <div className={`select ${open ? 'is-open' : ''} ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        className="select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openList()
          }
        }}
      >
        <span>{selected?.label}</span>
        <Icon name="chevron" size={18} className="select__chevron" />
      </button>
      {open && !sheet && <div className="select__dropdown">{list}</div>}
      {open && sheet && createPortal(
        // En <body>: dentro de una pantalla animada (transform), position:fixed quedaría desplazado.
        <div className="sheet-backdrop" onClick={() => close()}>
          <div className="sheet select__sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <div className="sheet__header">
              <h2>{label}</h2>
              <button type="button" className="icon-button" onClick={() => close()} aria-label="Cerrar"><Icon name="close" /></button>
            </div>
            {list}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

/* ---------- contraseña con 👁 ---------- */

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <span className="password-input">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="password-input__toggle"
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={20} />
      </button>
    </span>
  )
}

/* ---------- texto libre con sugerencias ---------- */

/**
 * Campo de texto libre que sugiere hasta 6 valores ya usados (sin distinguir mayúsculas ni tildes).
 * Elegir una sugerencia la completa, pero siempre se puede escribir otra cosa.
 */
export function Autocomplete({
  value,
  onChange,
  suggestions,
  maxLength,
  placeholder,
  id,
}: {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  maxLength: number
  placeholder?: string
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const matches = useMemo(() => {
    const term = foldText(value.trim())
    return suggestions
      .filter((s) => (!term || foldText(s).includes(term)) && foldText(s) !== term)
      .slice(0, 6)
  }, [value, suggestions])
  const showList = open && matches.length > 0

  const pick = (s: string) => {
    onChange(s)
    setOpen(false)
    setActive(-1)
  }

  return (
    <span className="autocomplete">
      <input
        id={id}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!showList) return
          if (e.key === 'ArrowDown') setActive((i) => Math.min(matches.length - 1, i + 1))
          else if (e.key === 'ArrowUp') setActive((i) => Math.max(-1, i - 1))
          else if (e.key === 'Enter' && active >= 0) pick(matches[active])
          else if (e.key === 'Escape') setOpen(false)
          else return
          e.preventDefault()
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" className="autocomplete__list">
          {matches.map((s, i) => (
            <li
              key={s}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}
