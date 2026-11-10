import nodemailer from 'nodemailer'
import type { Config } from '../config'
import { AppError } from '../errors'

export type Mailer = {
  mode: 'brevo' | 'resend' | 'smtp' | 'console'
  sendVerificationCode(to: string, name: string, code: string): Promise<void>
}

type Email = { to: string; subject: string; html: string; text: string }

const mailFailed = () => new AppError(502, 'MAIL_FAILED', 'No pudimos enviar el correo. Inténtalo en un momento.')

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function verificationEmail(to: string, name: string, code: string): Email {
  const first = escapeHtml(name.trim().split(/\s+/)[0] || 'estudiante')
  return {
    to,
    subject: `Tu código de EcoEstudiante: ${code}`,
    text: `Hola, ${first}:\n\nTu código de verificación de EcoEstudiante es ${code}.\nVence en 15 minutos.\n\nSi no creaste una cuenta, ignora este correo.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;color:#1f2a1f">
  <h2 style="color:#2f6b3a">EcoEstudiante</h2>
  <p>Hola, ${first}:</p>
  <p>Tu código de verificación es:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
  <p>Vence en 15 minutos.</p>
  <p style="color:#667;font-size:13px">Si no creaste una cuenta, ignora este correo.</p>
</div>`,
  }
}

/** "Nombre <correo@x>" → { name, email }; un correo suelto también vale. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from)
  if (match) return { ...(match[1] ? { name: match[1] } : {}), email: match[2].trim() }
  return { email: from.trim() }
}

/**
 * Elige Brevo, Resend, SMTP o consola según la configuración disponible. En Render gratuito los puertos SMTP
 * están bloqueados, así que en producción se usa una API HTTP (Brevo permite enviar desde un Gmail verificado).
 */
export function createMailer(config: Config, fetchImpl: typeof fetch = fetch): Mailer {
  const { brevoApiKey, resendApiKey, smtp, from } = config.mail

  let send: (email: Email) => Promise<void>
  let mode: Mailer['mode']

  if (brevoApiKey) {
    mode = 'brevo'
    send = async (email) => {
      const res = await fetchImpl('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: parseSender(from),
          to: [{ email: email.to }],
          subject: email.subject,
          htmlContent: email.html,
          textContent: email.text,
        }),
        signal: AbortSignal.timeout(15_000),
      }).catch((error) => {
        console.error('Brevo no respondió', error)
        throw mailFailed()
      })
      if (!res.ok) {
        console.error('Brevo respondió', res.status, await res.text().catch(() => ''))
        throw mailFailed()
      }
    }
  } else if (resendApiKey) {
    mode = 'resend'
    send = async (email) => {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
      })
      if (!res.ok) {
        console.error('Resend respondió', res.status, await res.text().catch(() => ''))
        throw mailFailed()
      }
    }
  } else if (smtp) {
    mode = 'smtp'
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
      // Si el puerto está bloqueado (como en Render gratuito), falla rápido en vez de colgar el registro.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    send = async (email) => {
      try {
        await transport.sendMail({ from, ...email })
      } catch (error) {
        console.error('SMTP falló', error)
        throw mailFailed()
      }
    }
  } else {
    mode = 'console'
    send = async (email) => {
      const code = email.subject.split(': ').pop()
      console.log(`[correo] Código para ${email.to}: ${code}`)
    }
  }

  return {
    mode,
    sendVerificationCode: (to, name, code) => send(verificationEmail(to, name, code)),
  }
}
