import { describe, expect, it } from 'vitest'
import { BOT_CONFIRMATION, buyerReply, interestMessage, simulatedReply } from '../../shared/bot-replies'
import { formatDate, formatTime } from '../../shared/format'
import { badgeText, markSeen, newAgreementsCount } from '../../shared/activity'

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

describe('shared/activity', () => {
  const a = (id: string, updatedAt: number, buyerId = 'me', sellerId = 'otro') => ({ id, updatedAt, buyerId, sellerId })

  it('sin registro guardado no hay pendientes', () => {
    expect(newAgreementsCount([a('x', 100)], 'me', null)).toBe(0)
  })
  it('cuenta los acuerdos míos actualizados después de verlos', () => {
    expect(newAgreementsCount([a('x', 200), a('y', 100)], 'me', { since: 0, at: { x: 150, y: 100 } })).toBe(1)
  })
  it('un acuerdo que nunca vi cuenta si cambió después de empezar a registrar', () => {
    expect(newAgreementsCount([a('z', 50)], 'me', { since: 10, at: {} })).toBe(1)
    expect(newAgreementsCount([a('z', 5)], 'me', { since: 10, at: {} })).toBe(0)
  })
  it('también cuenta cuando soy el vendedor', () => {
    expect(newAgreementsCount([a('v', 50, 'otro', 'me')], 'me', { since: 0, at: {} })).toBe(1)
  })
  it('ignora acuerdos ajenos', () => {
    expect(newAgreementsCount([a('w', 50, 'ana', 'beto')], 'me', { since: 0, at: {} })).toBe(0)
  })
  it('markSeen guarda la última actualización de cada acuerdo y conserva los demás', () => {
    expect(markSeen({ since: 1, at: { old: 5 } }, [a('x', 10), a('y', 20)])).toEqual({ since: 1, at: { old: 5, x: 10, y: 20 } })
  })
  it('badgeText: 9+ desde 10', () => {
    expect(badgeText(9)).toBe('9')
    expect(badgeText(10)).toBe('9+')
  })
})
