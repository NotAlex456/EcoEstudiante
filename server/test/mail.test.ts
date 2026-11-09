import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMailer } from '../src/integrations/mail'
import { testConfig } from './helpers'

describe('mailer', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sin claves usa modo consola e imprime el código', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const m = createMailer(testConfig())
    expect(m.mode).toBe('console')
    await m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '123456')
    expect(log.mock.calls.flat().join(' ')).toContain('[correo] Código para ana@upsjb.edu.pe: 123456')
  })

  it('con SMTP configurado usa modo smtp', () => {
    const m = createMailer(testConfig({ mail: { from: 'x', smtp: { host: 'smtp.gmail.com', port: 587, user: 'u', pass: 'p' } } }))
    expect(m.mode).toBe('smtp')
  })

  it('con RESEND_API_KEY llama a la API de Resend', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const m = createMailer(testConfig({ mail: { resendApiKey: 're_x', from: 'Eco <a@b.c>' } }), fetchImpl)
    expect(m.mode).toBe('resend')
    await m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '123456')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_x')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({ from: 'Eco <a@b.c>', to: ['ana@upsjb.edu.pe'], subject: 'Tu código de EcoEstudiante: 123456' })
    expect(sent.html).toContain('123456')
    expect(sent.text).toContain('15 minutos')
  })

  it('si Resend responde error, lanza AppError 502 MAIL_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"message":"no"}', { status: 422 }))
    const m = createMailer(testConfig({ mail: { resendApiKey: 're_x', from: 'x' } }), fetchImpl)
    await expect(m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '1')).rejects.toMatchObject({
      status: 502,
      code: 'MAIL_FAILED',
      message: 'No pudimos enviar el correo. Inténtalo en un momento.',
    })
  })
})
