import { describe, expect, it } from 'vitest'
import { BOT_CONFIRMATION, buyerReply, interestMessage, simulatedReply } from '../../shared/bot-replies'
import { formatDate, formatTime } from '../../shared/format'

const available = { status: 'Disponible', mode: 'Venta', price: 40, exchangeFor: null }

describe('shared/format', () => {
  it('formatDate muestra día y mes', () => {
    const text = formatDate('2026-11-10')
    expect(text).toContain('10')
    expect(text.toLowerCase()).toContain('nov')
  })
  it('formatTime muestra la hora', () => {
    expect(formatTime('12:30')).toContain('12:30')
  })
})

describe('shared/bot-replies', () => {
  it('responde que sigue disponible', () => {
    expect(simulatedReply('¿sigue disponible?', available)).toBe('¡Hola! Sí, sigue disponible. ¿Cuándo te gustaría recogerlo?')
  })
  it('ofrece rebaja del 10 % en venta', () => {
    expect(simulatedReply('¿me haces precio?', available)).toContain('S/ 36')
  })
  it('avisa si está reservado', () => {
    expect(simulatedReply('hola', { ...available, status: 'Reservado' })).toBe(
      'Hola, por ahora está reservado. Si se libera te escribo por aquí 🙌',
    )
  })
  it('buyerReply cambia según los mensajes previos', () => {
    expect(buyerReply(0)).toBe('¡Genial! ¿Te parece mañana a las 12:30 en la biblioteca central?')
    expect(buyerReply(2)).toBe('Perfecto, ahí nos vemos. ¡Gracias! 🙌')
  })
  it('interestMessage cambia en donación', () => {
    expect(interestMessage({ title: 'Libro X', mode: 'Venta' })).toBe('¡Hola! Me interesa Libro X. ¿Sigue disponible?')
    expect(interestMessage({ title: 'Libro X', mode: 'Donación' })).toBe('¡Hola! Me serviría mucho Libro X. ¿Aún lo estás donando?')
  })
  it('texto de confirmación del bot', () => {
    expect(BOT_CONFIRMATION).toBe('✅ ¡Confirmado! Nos vemos ahí. Llevaré el material.')
  })
})
