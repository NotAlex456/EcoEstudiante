/** ¿El material coincide con una búsqueda guardada? La usan la app y el servidor. */
export function matchesSearch(
  material: { title: string; course: string; category: string; mode: string },
  search: { query: string; category: string; mode: string },
) {
  const term = search.query.trim().toLocaleLowerCase()
  return (
    (!term || `${material.title} ${material.course} ${material.category}`.toLocaleLowerCase().includes(term)) &&
    (search.category === 'Todos' || material.category === search.category) &&
    (search.mode === 'Todos' || material.mode === search.mode)
  )
}
