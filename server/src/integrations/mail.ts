import nodemailer from 'nodemailer'
import type { Config } from '../config'
import { AppError } from '../errors'

export type Mailer = {
  mode: 'resend' | 'smtp' | 'console'
  sendVerificationCode(to: string, name: string, code: string): Promise<void>
}

type Email = { to: string; subject: string; html: string; text: string }

const mailFailed = () => new AppError(502, 'MAIL_FAILED', 'No pudimos enviar el correo. Inténtalo en un momento.')

function verificationEmail(to: string, name: string, code: string): Email {
  const first = name.trim().split(/\s+/)[0] || 'estudiante'
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

/** Elige Resend, SMTP o consola según la configuración disponible. */
export function createMailer(config: Config, fetchImpl: typeof fetch = fetch): Mailer {
  const { resendApiKey, smtp, from } = config.mail

  let send: (email: Email) => Promise<void>
  let mode: Mailer['mode']

  if (resendApiKey) {
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
