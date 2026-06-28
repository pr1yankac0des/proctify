import nodemailer from 'nodemailer'

let transporter = null

function getTransporter() {
  if (transporter) return transporter
  if (process.env.EMAIL_MODE === 'console') return null

  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) return null

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  })
  return transporter
}

export async function sendVerificationEmail(to, code) {
  const transport = getTransporter()
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@proctify.local'

  const subject = 'Proctify — Email Verification Code'
  const text = `Your Proctify verification code is: ${code}\n\nThis code expires in 15 minutes. Do not share it with anyone.`
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#8A6D3B;">Proctify Verification</h2>
      <p>Your verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#14171F;">${code}</p>
      <p style="color:#5B6275;font-size:14px;">This code expires in 15 minutes. Do not share it with anyone.</p>
    </div>
  `

  if (!transport) {
    // Dev/no-SMTP mode: also used in production on Render's free tier, which
    // blocks outbound SMTP ports (25/465/587) entirely as of Sep 2025 — see
    // https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports
    // The frontend displays devCode on-screen instead of requiring real email.
    console.log(`[Proctify] SMTP not configured or unavailable. Verification code for ${to}: ${code}`)
    return { sent: false, devCode: code }
  }

  await transport.sendMail({ from, to, subject, text, html })
  return { sent: true }
}
