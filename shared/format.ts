/** Fecha `YYYY-MM-DD` como "mar, 10 nov" (sin zona horaria: es una fecha de calendario). */
export function formatDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Hora `HH:mm` como "12:30 p. m.". */
export function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('es-PE', { hour: 'numeric', minute: '2-digit' })
}
