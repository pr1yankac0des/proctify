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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@academyflow.local'

  const subject = 'AcademyFlow — Email Verification Code'
  const text = `Your AcademyFlow verification code is: ${code}\n\nThis code expires in 15 minutes. Do not share it with anyone.`
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="color:#4f46e5;">AcademyFlow Verification</h2>
      <p>Your verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1e293b;">${code}</p>
      <p style="color:#64748b;font-size:14px;">This code expires in 15 minutes. Do not share it with anyone.</p>
    </div>
  `

  if (!transport) {
    console.log(`[AcademyFlow] SMTP not configured. Verification code for ${to}: ${code}`)
    return { sent: false, devCode: code }
  }

  await transport.sendMail({ from, to, subject, text, html })
  return { sent: true }
}
