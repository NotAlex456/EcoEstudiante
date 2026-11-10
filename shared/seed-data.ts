/** Estudiantes, materiales y reseñas de ejemplo (bots del servidor y datos locales de la app). */

const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=80&w=900`

const DAY = 86_400_000

export type SeedUser = {
  id: string
  name: string
  email: string
  career: string
  cycle: number
  baseRating: number
  baseRatingCount: number
}

export const SEED_USERS: SeedUser[] = [
  { id: 'u-maria', name: 'María Fernanda Quispe', email: 'bot.maria.quispe@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 8, baseRating: 4.9, baseRatingCount: 14 },
  { id: 'u-diego', name: 'Diego Salazar', email: 'bot.diego.salazar@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 9, baseRating: 4.8, baseRatingCount: 9 },
  { id: 'u-lucia', name: 'Lucía Mendoza', email: 'bot.lucia.mendoza@upsjb.edu.pe', career: 'Ingeniería de Sistemas', cycle: 10, baseRating: 5, baseRatingCount: 6 },
  { id: 'u-jorge', name: 'Jorge Paredes', email: 'bot.jorge.paredes@upsjb.edu.pe', career: 'Administración de Empresas', cycle: 8, baseRating: 4.7, baseRatingCount: 11 },
  { id: 'u-ana', name: 'Ana Torres', email: 'bot.ana.torres@upsjb.edu.pe', career: 'Contabilidad', cycle: 9, baseRating: 4.9, baseRatingCount: 7 },
  { id: 'u-carlos', name: 'Carlos Vela', email: 'bot.carlos.vela@upsjb.edu.pe', career: 'Administración de Empresas', cycle: 10, baseRating: 4.6, baseRatingCount: 5 },
]

export type SeedMaterial = {
  id: string
  title: string
  course: string
  career: string
  cycle: number
  category: string
  mode: 'Venta' | 'Intercambio' | 'Donación'
  price: number
  exchangeFor?: string
  condition: 'Como nuevo' | 'Buen estado' | 'Usado'
  ownerId: string
  images: string[]
  description: string
  status: 'Disponible' | 'Reservado'
  /** Antigüedad de la publicación en días. */
  daysAgo: number
}

const materials = [
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
    course: 'Matemática Básica', career: 'Administración de Empresas', cycle: 1, category: 'Separatas', mode: 'Venta', price: 12,
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
    course: 'Estadística General', career: 'Administración de Empresas', cycle: 3, category: 'Apuntes', mode: 'Donación', price: 0,
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

export const SEED_MATERIALS: SeedMaterial[] = materials.map((item, index) => ({
  status: 'Disponible' as const,
  ...item,
  images: [...item.images],
  id: `m-${index + 1}`,
  daysAgo: (index + 1) * 0.7,
}))

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

export { DAY }
