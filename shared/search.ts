import { foldText } from './text'

/** ¿El material coincide con una búsqueda guardada? La usan la app y el servidor (sin mayúsculas ni tildes). */
export function matchesSearch(
  material: { title: string; course: string; category: string; mode: string },
  search: { query: string; category: string; mode: string },
) {
  const term = foldText(search.query.trim())
  return (
    (!term || foldText(`${material.title} ${material.course} ${material.category}`).includes(term)) &&
    (search.category === 'Todos' || foldText(material.category) === foldText(search.category)) &&
    (search.mode === 'Todos' || material.mode === search.mode)
  )
}
