/** Lima no tiene horario de verano: siempre UTC-5. */
const LIMA_OFFSET = '-05:00'

/**
 * Reglas de fecha y hora de una entrega (las mismas que muestra la app).
 * Devuelve el mensaje de error en español, o null si el horario es válido.
 */
export function checkSchedule(date: string, time: string, now = new Date()): string | null {
  const invalid = 'Elige una fecha y hora válidas.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return invalid
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  const calendar = new Date(Date.UTC(y, m - 1, d))
  if (calendar.getUTCFullYear() !== y || calendar.getUTCMonth() !== m - 1 || calendar.getUTCDate() !== d) return invalid
  if (h > 23 || min > 59) return invalid

  if (new Date(`${date}T${time}:00${LIMA_OFFSET}`).getTime() < now.getTime())
    return 'Elige una fecha y hora que todavía no hayan pasado.'
  if (h < 7 || h > 20) return 'Para tu seguridad, elige un horario de clases (7:00 a. m. a 9:00 p. m.).'
  if (calendar.getUTCDay() === 0) return 'El campus no atiende los domingos. Elige otro día.'
  return null
}
