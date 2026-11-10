import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config'
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

  it('escapa el HTML del nombre en el correo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const m = createMailer(testConfig({ mail: { resendApiKey: 're_x', from: 'x' } }), fetchImpl)
    await m.sendVerificationCode('ana@upsjb.edu.pe', '<a/href=//evil.pe>Clic</a> Torres', '123456')
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(sent.html).not.toContain('<a/href')
    expect(sent.html).toContain('&lt;a/href=//evil.pe&gt;Clic&lt;/a&gt;')
  })

  it('con BREVO_API_KEY envía por la API HTTP de Brevo (Render bloquea SMTP en el plan gratuito)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"messageId":"x"}', { status: 201 }))
    const m = createMailer(testConfig({ mail: { brevoApiKey: 'xkeysib-1', from: 'EcoEstudiante <eco@gmail.com>' } }), fetchImpl)
    expect(m.mode).toBe('brevo')
    await m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '123456')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.brevo.com/v3/smtp/email')
    expect(init.headers['api-key']).toBe('xkeysib-1')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({
      sender: { name: 'EcoEstudiante', email: 'eco@gmail.com' },
      to: [{ email: 'ana@upsjb.edu.pe' }],
      subject: 'Tu código de EcoEstudiante: 123456',
    })
    expect(sent.htmlContent).toContain('123456')
    expect(sent.textContent).toContain('15 minutos')
  })

  it('si Brevo responde error, lanza AppError 502 MAIL_FAILED', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"code":"unauthorized"}', { status: 401 }))
    const m = createMailer(testConfig({ mail: { brevoApiKey: 'k', from: 'eco@gmail.com' } }), fetchImpl)
    await expect(m.sendVerificationCode('ana@upsjb.edu.pe', 'Ana', '1')).rejects.toMatchObject({ status: 502, code: 'MAIL_FAILED' })
  })

  it('BREVO_API_KEY se lee de las variables de entorno', () => {
    const config = loadConfig({ DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(32), BREVO_API_KEY: 'xkeysib-2' })
    expect(config.mail.brevoApiKey).toBe('xkeysib-2')
  })
})
