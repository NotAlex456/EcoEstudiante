/** Frases de los estudiantes simulados. Las usan la app y el servidor. */

export type ReplyMaterial = { status: string; mode: string; price: number; exchangeFor?: string | null }

/** Respuesta del vendedor simulado al último mensaje del comprador. */
export function simulatedReply(text: string, material: ReplyMaterial): string {
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

/** Respuesta del comprador simulado, según cuántos mensajes ya envió. */
export function buyerReply(botMessagesSoFar: number): string {
  return botMessagesSoFar < 2 ? '¡Genial! ¿Te parece mañana a las 12:30 en la biblioteca central?' : 'Perfecto, ahí nos vemos. ¡Gracias! 🙌'
}

/** Primer mensaje de un bot interesado en una publicación nueva. */
export function interestMessage(material: { title: string; mode: string }): string {
  return material.mode === 'Donación'
    ? `¡Hola! Me serviría mucho ${material.title}. ¿Aún lo estás donando?`
    : `¡Hola! Me interesa ${material.title}. ¿Sigue disponible?`
}

export const BOT_CONFIRMATION = '✅ ¡Confirmado! Nos vemos ahí. Llevaré el material.'
