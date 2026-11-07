import type { Category, Condition, Material, Mode, State, User } from './types'

export const MODES: Mode[] = ['Venta', 'Intercambio', 'Donación']
export const CATEGORIES: Category[] = ['Libros', 'Apuntes', 'Calculadoras', 'Separatas']
export const CONDITIONS: Condition[] = ['Como nuevo', 'Buen estado', 'Usado']
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

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=900`

const DAY = 86_400_000

const seedUsers: User[] = [
  { id: 'u-maria', name: 'María Fernanda Quispe', email: 'maria.quispe@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 8, verified: true, createdAt: 0, baseRating: 4.9, baseRatingCount: 14 },
  { id: 'u-diego', name: 'Diego Salazar', email: 'diego.salazar@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 9, verified: true, createdAt: 0, baseRating: 4.8, baseRatingCount: 9 },
  { id: 'u-lucia', name: 'Lucía Mendoza', email: 'lucia.mendoza@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 10, verified: true, createdAt: 0, baseRating: 5, baseRatingCount: 6 },
  { id: 'u-jorge', name: 'Jorge Paredes', email: 'jorge.paredes@upsjb.edu.pe', career: 'Administración', cycle: 8, verified: true, createdAt: 0, baseRating: 4.7, baseRatingCount: 11 },
  { id: 'u-ana', name: 'Ana Torres', email: 'ana.torres@upsjb.edu.pe', career: 'Contabilidad', cycle: 9, verified: true, createdAt: 0, baseRating: 4.9, baseRatingCount: 7 },
  { id: 'u-carlos', name: 'Carlos Vela', email: 'carlos.vela@upsjb.edu.pe', career: 'Administración', cycle: 10, verified: true, createdAt: 0, baseRating: 4.6, baseRatingCount: 5 },
]

export type SeedReview = { author: string; stars: number; comment: string; daysAgo: number; material: string }

/** Example reviews so seeded students have a visible history (count matches baseRatingCount loosely). */
export const SEED_REVIEWS: Record<string, SeedReview[]> = {
  'u-maria': [
    { author: 'Kevin Huamán', stars: 5, comment: 'Muy puntual y la calculadora estaba impecable.', daysAgo: 6, material: 'Calculadora Casio fx-82' },
    { author: 'Rosa Pachas', stars: 5, comment: 'Me explicó cómo usar las funciones estadísticas. ¡Gracias!', daysAgo: 21, material: 'Separata de Física I' },
    { author: 'Luis Ramos', stars: 4, comment: 'Todo bien, llegó 10 minutos tarde pero avisó por el chat.', daysAgo: 40, material: 'Apuntes de Matemática I' },
  ],
  'u-diego': [
    { author: 'Camila Ortiz', stars: 5, comment: 'Intercambio justo, el libro está como nuevo.', daysAgo: 9, material: 'Fundamentos de Programación' },
    { author: 'Bruno Cárdenas', stars: 4, comment: 'Buena comunicación, el libro tenía algunas marcas que sí mencionó.', daysAgo: 33, material: 'Física I (Serway)' },
  ],
  'u-lucia': [
    { author: 'Andrés Yupanqui', stars: 5, comment: 'Donó sus apuntes y además me pasó ejercicios extra. Súper amable.', daysAgo: 4, material: 'Apuntes de Base de Datos' },
    { author: 'Fiorella Lévano', stars: 5, comment: 'Los apuntes me salvaron el parcial 🙌', daysAgo: 28, material: 'Resumen de Cálculo I' },
  ],
  'u-jorge': [
    { author: 'Mariana Soto', stars: 5, comment: 'La separata tenía anotaciones muy útiles.', daysAgo: 12, material: 'Separata de Microeconomía' },
    { author: 'Piero Hernández', stars: 4, comment: 'Todo conforme. Coordinamos rápido en el patio principal.', daysAgo: 25, material: 'Libro de Marketing' },
    { author: 'Valeria Muñoz', stars: 4, comment: 'Buen precio, aunque la portada estaba algo gastada.', daysAgo: 50, material: 'Matemática Básica' },
  ],
  'u-ana': [
    { author: 'Diego Salazar', stars: 5, comment: 'Muy ordenada, el kit venía completo.', daysAgo: 8, material: 'Contabilidad General' },
    { author: 'Sofía Quispe', stars: 5, comment: 'Respondió al toque y fue muy amable.', daysAgo: 19, material: 'Calculadora financiera' },
  ],
  'u-carlos': [
    { author: 'Renato Castillo', stars: 5, comment: 'Donación genial, el cuaderno está completo.', daysAgo: 15, material: 'Apuntes de Estadística' },
    { author: 'Ximena Rojas', stars: 4, comment: 'No llegó a la primera cita, pero reprogramó y cumplió.', daysAgo: 44, material: 'Separata de Finanzas' },
  ],
}

function seedMaterials(now: number): Material[] {
  const base = [
    {
      title: 'Calculadora científica Casio fx-991',
      course: 'Matemática I', career: 'Ingeniería de Sistemas', cycle: 1, category: 'Calculadoras', mode: 'Venta', price: 25,
      condition: 'Buen estado', ownerId: 'u-maria', images: [img('1761546571631-a4d61b55cd2f')],
      description: 'Funciona perfectamente e incluye tapa protectora. Tiene pequeñas señales de uso en la parte posterior.',
    },
    {
      title: 'Cálculo de una variable (7.ª ed.)',
      course: 'Cálculo I', career: 'Ingeniería de Sistemas', cycle: 2, category: 'Libros', mode: 'Intercambio', price: 0,
      exchangeFor: 'Material de programación o Física I',
      condition: 'Como nuevo', ownerId: 'u-diego', images: [img('1764096535068-0e9f652e03f6')],
      description: 'Libro de Cálculo, séptima edición. Sin páginas marcadas. Busco intercambiar por material de programación.',
    },
    {
      title: 'Apuntes de Programación I',
      course: 'Programación I', career: 'Ingeniería de Sistemas', cycle: 1, category: 'Apuntes', mode: 'Donación', price: 0,
      condition: 'Buen estado', ownerId: 'u-lucia', images: [img('1762318953799-918e21d1fec4')],
      description: 'Cuaderno completo del curso con ejercicios resueltos, diagramas de flujo y resumen para el examen final.',
    },
    {
      title: 'Separata de Álgebra',
      course: 'Matemática Básica', career: 'Administración', cycle: 1, category: 'Separatas', mode: 'Venta', price: 12,
      condition: 'Usado', ownerId: 'u-jorge', images: [img('1608048608477-30389696fdc1')],
      description: 'Separata original con ejercicios prácticos. Algunas anotaciones útiles en los márgenes.',
    },
    {
      title: 'Kit de Contabilidad básica',
      course: 'Contabilidad I', career: 'Contabilidad', cycle: 1, category: 'Libros', mode: 'Venta', price: 35,
      condition: 'Como nuevo', ownerId: 'u-ana', images: [img('1769794371055-54436b54577e')],
      description: 'Libro y cuaderno de ejercicios del primer ciclo. Se entregan juntos.',
    },
    {
      title: 'Cuaderno de Estadística',
      course: 'Estadística General', career: 'Administración', cycle: 3, category: 'Apuntes', mode: 'Donación', price: 0,
      condition: 'Buen estado', ownerId: 'u-carlos', images: [img('1761821170104-ccd3e3e21318')],
      description: 'Teoría y ejercicios desarrollados durante todo el ciclo, con fórmulas resumidas al final.',
    },
    {
      title: 'Calculadora financiera HP 10bII',
      course: 'Matemática Financiera', career: 'Contabilidad', cycle: 4, category: 'Calculadoras', mode: 'Venta', price: 60,
      condition: 'Buen estado', ownerId: 'u-ana', images: [img('1761546571631-a4d61b55cd2f')],
      description: 'Ideal para Matemática Financiera. Pilas nuevas. Ya está reservada para otro estudiante.',
      status: 'Reservado',
    },
  ] as const

  return base.map((item, index) => ({
    status: 'Disponible',
    ...item,
    images: [...item.images],
    id: `m-${index + 1}`,
    createdAt: now - (index + 1) * DAY * 0.7,
  })) as Material[]
}

export const STATE_VERSION = 1

export function createSeedState(now = Date.now()): State {
  return {
    version: STATE_VERSION,
    sessionUserId: null,
    users: seedUsers,
    materials: seedMaterials(now),
    conversations: [],
    agreements: [],
    notifications: [],
    reports: [],
    savedSearches: [],
    saved: {},
    scheduled: [],
  }
}

/** Canned replies used to simulate the other student while there is no backend. */
export function simulatedReply(text: string, material: Material): string {
  const t = text.toLocaleLowerCase()
  if (material.status === 'Reservado') return 'Hola, por ahora está reservado. Si se libera te escribo por aquí 🙌'
  if (/(disponible|todav|sigue)/.test(t)) return '¡Hola! Sí, sigue disponible. ¿Cuándo te gustaría recogerlo?'
  if (/(precio|rebaja|descuento|menos)/.test(t))
    return material.mode === 'Venta' ? `Te lo puedo dejar en S/ ${Math.max(1, Math.round(material.price * 0.9))} si lo recoges esta semana.` : 'No tiene costo 😊 solo coordinemos la entrega.'
  if (/(foto|estado|falla|marca)/.test(t)) return 'Está tal como en las fotos. Al entregarlo puedes revisarlo con calma.'
  if (/(cambio|intercambi)/.test(t)) return material.exchangeFor ? `Me interesaría a cambio: ${material.exchangeFor}.` : 'Podemos conversarlo, ¿qué tienes para intercambiar?'
  if (/(hora|cuando|cuándo|mañana|hoy|lugar|biblioteca|patio|cafeter)/.test(t))
    return 'Me queda bien. Envíame la propuesta con "Acordar entrega" y la confirmo.'
  if (/(gracias|ok|listo|perfecto)/.test(t)) return '¡A ti! Nos vemos en el campus 👋'
  return '¡Hola! Claro, cuéntame. Si te interesa, propón lugar y hora con "Acordar entrega".'
}
