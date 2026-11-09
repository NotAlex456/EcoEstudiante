/** Constantes compartidas entre la app (src/) y el servidor (server/). */

export const MODES = ['Venta', 'Intercambio', 'Donación'] as const
export const CATEGORIES = ['Libros', 'Apuntes', 'Calculadoras', 'Separatas'] as const
export const CONDITIONS = ['Como nuevo', 'Buen estado', 'Usado'] as const
export const CAREERS = ['Ingeniería de Sistemas', 'Administración', 'Contabilidad', 'Enfermería', 'Derecho']
export const CYCLES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const COURSES: Record<string, string[]> = {
  'Ingeniería de Sistemas': ['Matemática I', 'Cálculo I', 'Programación I', 'Física I', 'Base de Datos', 'Estadística General'],
  Administración: ['Matemática Básica', 'Estadística General', 'Contabilidad General', 'Microeconomía', 'Marketing'],
  Contabilidad: ['Contabilidad I', 'Matemática Financiera', 'Estadística General', 'Tributación', 'Costos'],
  Enfermería: ['Anatomía', 'Bioquímica', 'Fundamentos de Enfermería', 'Farmacología'],
  Derecho: ['Introducción al Derecho', 'Derecho Civil I', 'Derecho Constitucional', 'Redacción Jurídica'],
}

export const SAFE_POINTS = [
  { name: 'Biblioteca central', detail: 'Ingreso principal, junto al módulo de préstamos.' },
  { name: 'Patio principal', detail: 'Zona techada frente al pabellón A.' },
  { name: 'Entrada de la cafetería', detail: 'Mesas exteriores, siempre concurridas.' },
  { name: 'Hall de Bienestar Universitario', detail: 'Primer piso, con personal de la filial.' },
]

export const REPORT_REASONS = [
  'La foto no corresponde al material',
  'El estado no es el indicado',
  'Precio abusivo o engañoso',
  'Contenido inadecuado',
  'Posible estafa o suplantación',
  'Otro motivo',
]

export const COMMUNITY_RULES = [
  'Publica solo materiales académicos propios y con fotos reales.',
  'Describe el estado con honestidad, incluidas marcas o fallas.',
  'Respeta los acuerdos de lugar y hora; si no puedes asistir, cancela desde la app.',
  'Encuéntrate siempre en un punto seguro del campus y en horario de clases.',
  'No compartas tu teléfono ni datos personales por el chat.',
  'Reporta cualquier publicación engañosa: la moderación la revisará.',
]

/** Correo institucional de la UPSJB. */
export const INSTITUTIONAL_EMAIL = /^[a-z0-9._-]+@upsjb.edu.pe$/i
